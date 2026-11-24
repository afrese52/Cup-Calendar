import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGetEvents } from '@workspace/api-client-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { getAvailableEvents, type TournamentEvent } from '@/data/events';
import { loadCachedEvents, saveEventsToCache } from '@/services/localEventStore';
import {
  getAnonymousBookmarksForImport,
  importAnonymousBookmarksForUser,
  keepAnonymousBookmarksLocal,
  loadBookmarksForUser,
  prepareBookmarksForSync,
  reconcileBookmarks,
  setBookmarksFavorite,
  shouldUploadBookmarkChange,
} from '@/services/localBookmarkStore';
import { getBookmarkSyncErrorMessage } from '@/services/bookmarkSyncErrors';
import { fetchRemoteBookmarks, saveRemoteBookmark, supabase } from '@/services/supabase';

interface AppContextValue {
  events: TournamentEvent[];
  bookmarkedIds: string[];
  isReady: boolean;
  authReady: boolean;
  isAuthenticated: boolean;
  eventError: string | null;
  storageError: string | null;
  canRetryLocalBookmarkLoad: boolean;
  isRetryingLocalBookmarkLoad: boolean;
  bookmarkSyncStatus: 'local' | 'syncing' | 'synced' | 'pending';
  bookmarkSyncError: string | null;
  legacyBookmarkImportCount: number;
  importLegacyBookmarks: () => Promise<void>;
  keepLegacyBookmarksLocal: () => Promise<void>;
  toggleBookmark: (eventId: string) => Promise<void>;
  retryLocalBookmarkLoad: () => Promise<void>;
  retryBookmarkSync: () => Promise<void>;
  clearBookmarks: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);
const BOOKMARK_CHANNEL_RECONNECT_BASE_MS = 1_000;
const BOOKMARK_CHANNEL_RECONNECT_MAX_MS = 30_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [authReady, setAuthReady] = useState(!supabase);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarkSyncStatus, setBookmarkSyncStatus] =
    useState<AppContextValue['bookmarkSyncStatus']>('local');
  const [bookmarkSyncError, setBookmarkSyncError] = useState<string | null>(null);
  const [legacyBookmarkImport, setLegacyBookmarkImport] = useState<{
    userId: string;
    count: number;
  } | null>(null);
  const [eventsReady, setEventsReady] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [canRetryLocalBookmarkLoad, setCanRetryLocalBookmarkLoad] = useState(false);
  const [isRetryingLocalBookmarkLoad, setIsRetryingLocalBookmarkLoad] = useState(false);
  const localBookmarkLoadRetryInFlight = useRef(false);
  const hasLoadedServerEvents = useRef(false);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const currentBookmarkIds = useRef<string[]>([]);
  const currentUserId = useRef<string | null>(null);
  const currentSessionVersion = useRef(0);
  const syncingSessions = useRef(new Set<string>());
  const queuedSyncSessions = useRef(new Set<string>());
  const queuedAnnouncementSessions = useRef(new Set<string>());
  const eventsQuery = useGetEvents(undefined, {
    query: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });
  const isReady = authReady && eventsReady;
  const isAuthenticated = Boolean(userId);

  useEffect(() => {
    const expirationTimer = setInterval(() => {
      setEvents((currentEvents) => {
        const availableEvents = getAvailableEvents(currentEvents);
        return availableEvents.length === currentEvents.length ? currentEvents : availableEvents;
      });
    }, 60_000);
    return () => clearInterval(expirationTimer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      currentUserId.current = null;
      setAuthReady(true);
      return;
    }

    let isMounted = true;
    let authEventCount = 0;
    const setActiveUser = (nextUserId: string | null) => {
      if (currentUserId.current !== nextUserId) {
        currentSessionVersion.current += 1;
        currentBookmarkIds.current = [];
        setBookmarkedIds([]);
        setStorageError(null);
        setCanRetryLocalBookmarkLoad(false);
        setBookmarkSyncStatus('local');
        setBookmarkSyncError(null);
      }
      currentUserId.current = nextUserId;
      setUserId(nextUserId);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      authEventCount += 1;
      setActiveUser(session?.user.id ?? null);
      setAuthReady(true);
    });
    const initialAuthEventCount = authEventCount;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (!error && authEventCount === initialAuthEventCount) {
        setActiveUser(data.session?.user.id ?? null);
      }
      setAuthReady(true);
    }).catch(() => {
      if (isMounted) setAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const syncBookmarks = useCallback(async (targetUserId: string, announceRemoteChanges = false) => {
    if (
      !supabase ||
      currentUserId.current !== targetUserId
    ) return;
    const sessionVersion = currentSessionVersion.current;
    const sessionKey = `${targetUserId}:${sessionVersion}`;
    const isCurrentSession = () =>
      currentUserId.current === targetUserId &&
      currentSessionVersion.current === sessionVersion;
    if (announceRemoteChanges) queuedAnnouncementSessions.current.add(sessionKey);
    let unclaimedIds: string[];
    try {
      unclaimedIds = await getAnonymousBookmarksForImport(targetUserId);
    } catch (error) {
      queuedAnnouncementSessions.current.delete(sessionKey);
      if (isCurrentSession()) {
        setBookmarkSyncStatus('pending');
        setBookmarkSyncError(getBookmarkSyncErrorMessage(error));
      }
      return;
    }
    if (!isCurrentSession()) {
      queuedAnnouncementSessions.current.delete(sessionKey);
      return;
    }
    if (unclaimedIds.length) {
      queuedAnnouncementSessions.current.delete(sessionKey);
      setLegacyBookmarkImport({ userId: targetUserId, count: unclaimedIds.length });
      return;
    }
    setLegacyBookmarkImport((current) => current?.userId === targetUserId ? null : current);
    if (syncingSessions.current.has(sessionKey)) {
      queuedSyncSessions.current.add(sessionKey);
      return;
    }

    syncingSessions.current.add(sessionKey);

    try {
      do {
        queuedSyncSessions.current.delete(sessionKey);
        if (!isCurrentSession()) break;

        setBookmarkSyncStatus('syncing');
        setBookmarkSyncError(null);

        try {
          const pending = await prepareBookmarksForSync(targetUserId);
          if (!isCurrentSession()) break;
          let remoteBookmarks = await fetchRemoteBookmarks(targetUserId);
          if (!isCurrentSession()) break;
          let writeError: unknown = null;

          for (const [eventId, change] of Object.entries(pending)) {
            if (!isCurrentSession()) break;
            const remote = remoteBookmarks.find((bookmark) => bookmark.event_id === eventId);
            if (shouldUploadBookmarkChange(change, remote)) {
              try {
                await saveRemoteBookmark(eventId, change);
                if (!isCurrentSession()) break;
              } catch (error) {
                writeError = error;
                break;
              }
            }
          }
          if (!isCurrentSession()) break;

          remoteBookmarks = await fetchRemoteBookmarks(targetUserId);
          if (!isCurrentSession()) break;
          const reconciled = await reconcileBookmarks(targetUserId, remoteBookmarks);
          if (isCurrentSession()) {
            const previousIds = currentBookmarkIds.current;
            const nextIds = reconciled.eventIds;
            const hasBookmarkChanges = previousIds.some((id) => !nextIds.includes(id)) ||
              nextIds.some((id) => !previousIds.includes(id));
            if (hasBookmarkChanges && queuedAnnouncementSessions.current.has(sessionKey)) {
              const getEventTitle = (eventId: string) =>
                eventsRef.current.find((event) => event.id === eventId)?.title ?? 'Ein Turnier';
              const added = nextIds
                .filter((id) => !previousIds.includes(id))
                .map((id) => `${getEventTitle(id)} zur Merkliste hinzugefügt`);
              const removed = previousIds
                .filter((id) => !nextIds.includes(id))
                .map((id) => `${getEventTitle(id)} aus der Merkliste entfernt`);
              AccessibilityInfo.announceForAccessibility(
                `Merkliste aktualisiert: ${[...added, ...removed].join('. ')}.`,
              );
              queuedAnnouncementSessions.current.delete(sessionKey);
            } else if (!queuedSyncSessions.current.has(sessionKey)) {
              queuedAnnouncementSessions.current.delete(sessionKey);
            }
            currentBookmarkIds.current = nextIds;
            setBookmarkedIds(nextIds);
            const hasPendingChanges = reconciled.pendingCount > 0 || writeError !== null;
            setBookmarkSyncStatus(hasPendingChanges ? 'pending' : 'synced');
            setBookmarkSyncError(
              !hasPendingChanges
                ? null
                : writeError
                  ? getBookmarkSyncErrorMessage(writeError)
                  : 'Änderungen bleiben auf diesem Gerät gespeichert und werden später erneut synchronisiert.',
            );
          }
        } catch (error) {
          if (isCurrentSession()) {
            setBookmarkSyncStatus('pending');
            setBookmarkSyncError(getBookmarkSyncErrorMessage(error));
          }
        }
      } while (
        queuedSyncSessions.current.has(sessionKey) &&
        isCurrentSession()
      );
    } finally {
      syncingSessions.current.delete(sessionKey);
      queuedSyncSessions.current.delete(sessionKey);
      queuedAnnouncementSessions.current.delete(sessionKey);
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!authReady) return;
    let isMounted = true;

    void (async () => {
      try {
        const localIds = await loadBookmarksForUser(userId);
        if (!isMounted || currentUserId.current !== userId) return;
        currentBookmarkIds.current = localIds;
        setBookmarkedIds(localIds);
        if (!userId) {
          setLegacyBookmarkImport(null);
          setBookmarkSyncStatus('local');
          setBookmarkSyncError(null);
          return;
        }
        await syncBookmarks(userId);
      } catch {
        if (isMounted && currentUserId.current === userId) {
          setStorageError('Favoriten konnten nicht geladen werden.');
          setCanRetryLocalBookmarkLoad(true);
        }
      }
    })();

    if (!userId || !client) {
      return () => {
        isMounted = false;
      };
    }

    const retrySync = () => {
      if (AppState.currentState === 'active') void syncBookmarks(userId, true);
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retrySync();
    });
    const retryTimer = setInterval(retrySync, 30_000);
    let activeChannel: ReturnType<typeof client.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;

    const openRealtimeChannel = () => {
      if (!isMounted) return;
      const channel = client
        .channel(`cupcal-bookmarks-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_event_bookmarks',
            filter: `user_id=eq.${userId}`,
          },
          retrySync,
        );
      activeChannel = channel;
      channel.subscribe((status) => {
        if (!isMounted || activeChannel !== channel) return;
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = undefined;
          retrySync();
          return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
        if (reconnectTimer) return;

        const delay = Math.min(
          BOOKMARK_CHANNEL_RECONNECT_BASE_MS * 2 ** reconnectAttempt,
          BOOKMARK_CHANNEL_RECONNECT_MAX_MS,
        );
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          if (!isMounted || activeChannel !== channel) return;
          activeChannel = null;
          void client.removeChannel(channel).finally(() => {
            if (isMounted && activeChannel === null) openRealtimeChannel();
          });
        }, delay);
      });
    };

    openRealtimeChannel();

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      clearInterval(retryTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (activeChannel) void client.removeChannel(activeChannel);
    };
  }, [authReady, userId, syncBookmarks]);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const cachedEvents = await loadCachedEvents();
        if (isMounted && cachedEvents !== null && !hasLoadedServerEvents.current) {
          setEvents(getAvailableEvents(cachedEvents));
        }
      } catch {
        if (isMounted) {
          setStorageError('Offline-Termine konnten nicht gespeichert werden.');
        }
      } finally {
        if (isMounted) setEventsReady(true);
      }
    }

    void loadEvents();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (eventsQuery.data) {
      hasLoadedServerEvents.current = true;
      const availableEvents = getAvailableEvents(eventsQuery.data.data);
      setEvents(availableEvents);
      setEventError(null);
      void saveEventsToCache(availableEvents).catch(() => {
        if (isMounted) setStorageError('Termine konnten nicht offline gespeichert werden.');
      });
    } else if (eventsQuery.isError) {
      setEventError(
        events.length > 0
          ? 'Die Termin-Datenbank ist nicht erreichbar · gespeicherte Termine werden angezeigt.'
          : 'Der Kalender konnte nicht geladen werden. Bitte prüfe die Verbindung.',
      );
    }

    return () => {
      isMounted = false;
    };
  }, [eventsQuery.data, eventsQuery.isError, events.length]);

  const toggleBookmark = useCallback(
    async (eventId: string) => {
      const activeUserId = currentUserId.current;
      if (!activeUserId) return;
      const sessionVersion = currentSessionVersion.current;
      const isCurrentSession = () =>
        currentUserId.current === activeUserId &&
        currentSessionVersion.current === sessionVersion;
      const isFavorite = !currentBookmarkIds.current.includes(eventId);
      setStorageError(null);
      try {
        const savedIds = await setBookmarksFavorite(activeUserId, [eventId], isFavorite);
        if (!isCurrentSession()) return;
        currentBookmarkIds.current = savedIds;
        setBookmarkedIds(savedIds);
        void syncBookmarks(activeUserId);
      } catch {
        if (isCurrentSession()) {
          setStorageError('Favorit konnte nicht gespeichert werden. Bitte versuche es erneut.');
        }
      }
    },
    [syncBookmarks],
  );

  const retryBookmarkSync = useCallback(async () => {
    const activeUserId = currentUserId.current;
    if (activeUserId) await syncBookmarks(activeUserId, true);
  }, [syncBookmarks]);

  const retryLocalBookmarkLoad = useCallback(async () => {
    if (localBookmarkLoadRetryInFlight.current) return;
    localBookmarkLoadRetryInFlight.current = true;
    setIsRetryingLocalBookmarkLoad(true);
    const activeUserId = currentUserId.current;
    try {
      const localIds = await loadBookmarksForUser(activeUserId);
      if (currentUserId.current !== activeUserId) return;
      currentBookmarkIds.current = localIds;
      setBookmarkedIds(localIds);
      setStorageError(null);
      setCanRetryLocalBookmarkLoad(false);
      if (activeUserId) await syncBookmarks(activeUserId);
    } catch {
      if (currentUserId.current === activeUserId) {
        setStorageError('Favoriten konnten nicht geladen werden.');
        setCanRetryLocalBookmarkLoad(true);
      }
    } finally {
      localBookmarkLoadRetryInFlight.current = false;
      setIsRetryingLocalBookmarkLoad(false);
    }
  }, [syncBookmarks]);

  const importLegacyBookmarks = useCallback(async () => {
    const activeUserId = currentUserId.current;
    if (!activeUserId || legacyBookmarkImport?.userId !== activeUserId) return;
    setStorageError(null);
    try {
      const importedIds = await importAnonymousBookmarksForUser(activeUserId);
      if (currentUserId.current !== activeUserId) return;
      currentBookmarkIds.current = importedIds;
      setBookmarkedIds(importedIds);
      setLegacyBookmarkImport(null);
      await syncBookmarks(activeUserId);
    } catch {
      setStorageError('Alte Favoriten konnten nicht übernommen werden.');
    }
  }, [legacyBookmarkImport, syncBookmarks]);

  const keepLegacyBookmarks = useCallback(async () => {
    const activeUserId = currentUserId.current;
    if (!activeUserId || legacyBookmarkImport?.userId !== activeUserId) return;
    setStorageError(null);
    try {
      await keepAnonymousBookmarksLocal(activeUserId);
      if (currentUserId.current !== activeUserId) return;
      setLegacyBookmarkImport(null);
      await syncBookmarks(activeUserId);
    } catch {
      setStorageError('Die lokale Merkliste konnte nicht gespeichert werden.');
    }
  }, [legacyBookmarkImport, syncBookmarks]);

  const clearBookmarks = useCallback(async () => {
    const activeUserId = currentUserId.current;
    if (!activeUserId) return;
    const sessionVersion = currentSessionVersion.current;
    const isCurrentSession = () =>
      currentUserId.current === activeUserId &&
      currentSessionVersion.current === sessionVersion;
    const idsToClear = [...currentBookmarkIds.current];
    setStorageError(null);
    try {
      const savedIds = await setBookmarksFavorite(activeUserId, idsToClear, false);
      if (!isCurrentSession()) return;
      currentBookmarkIds.current = savedIds;
      setBookmarkedIds(savedIds);
      void syncBookmarks(activeUserId);
    } catch {
      if (isCurrentSession()) {
        setStorageError('Favoriten konnten nicht gelöscht werden. Bitte versuche es erneut.');
      }
    }
  }, [syncBookmarks]);

  const value = useMemo(
    () => ({
      events,
      bookmarkedIds,
      isReady,
      authReady,
      isAuthenticated,
      eventError,
      storageError,
      canRetryLocalBookmarkLoad,
      isRetryingLocalBookmarkLoad,
      bookmarkSyncStatus,
      bookmarkSyncError,
      legacyBookmarkImportCount: legacyBookmarkImport?.count ?? 0,
      importLegacyBookmarks,
      keepLegacyBookmarksLocal: keepLegacyBookmarks,
      toggleBookmark,
      retryLocalBookmarkLoad,
      retryBookmarkSync,
      clearBookmarks,
    }),
    [
      events,
      bookmarkedIds,
      isReady,
      authReady,
      isAuthenticated,
      eventError,
      storageError,
      canRetryLocalBookmarkLoad,
      isRetryingLocalBookmarkLoad,
      bookmarkSyncStatus,
      bookmarkSyncError,
      legacyBookmarkImport,
      importLegacyBookmarks,
      keepLegacyBookmarks,
      toggleBookmark,
      retryLocalBookmarkLoad,
      retryBookmarkSync,
      clearBookmarks,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useCupCal() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useCupCal muss innerhalb von AppProvider verwendet werden.');
  return context;
}
