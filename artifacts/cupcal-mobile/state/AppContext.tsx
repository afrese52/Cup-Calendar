import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGetEvents } from '@workspace/api-client-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import type { TournamentEvent } from '@/data/events';
import { loadCachedEvents, saveEventsToCache } from '@/services/localEventStore';
import {
  loadAnonymousBookmarks,
  loadBookmarksForUser,
  prepareBookmarksForSync,
  reconcileBookmarks,
  setBookmarksFavorite,
} from '@/services/localBookmarkStore';
import { fetchRemoteBookmarks, saveRemoteBookmark, supabase } from '@/services/supabase';

interface AppContextValue {
  events: TournamentEvent[];
  bookmarkedIds: string[];
  isReady: boolean;
  isLiveData: boolean;
  eventError: string | null;
  storageError: string | null;
  bookmarkSyncStatus: 'local' | 'syncing' | 'synced' | 'pending';
  bookmarkSyncError: string | null;
  toggleBookmark: (eventId: string) => Promise<void>;
  clearBookmarks: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [bookmarksReady, setBookmarksReady] = useState(false);
  const [authReady, setAuthReady] = useState(!supabase);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarkSyncStatus, setBookmarkSyncStatus] =
    useState<AppContextValue['bookmarkSyncStatus']>('local');
  const [bookmarkSyncError, setBookmarkSyncError] = useState<string | null>(null);
  const [eventsReady, setEventsReady] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const hasLoadedLiveData = useRef(false);
  const currentBookmarkIds = useRef<string[]>([]);
  const currentUserId = useRef<string | null>(null);
  const syncingUsers = useRef(new Set<string>());
  const eventsQuery = useGetEvents(undefined, {
    query: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  });
  const isReady = bookmarksReady && eventsReady;

  useEffect(() => {
    let isMounted = true;
    loadAnonymousBookmarks()
      .then((ids) => {
        if (!isMounted) return;
        currentBookmarkIds.current = ids;
        setBookmarkedIds(ids);
      })
      .catch(() => {
        if (isMounted) setStorageError('Favoriten konnten nicht geladen werden.');
      })
      .finally(() => {
        if (isMounted) setBookmarksReady(true);
      });

    return () => {
      isMounted = false;
    };
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

  const syncBookmarks = useCallback(async (targetUserId: string) => {
    if (
      !supabase ||
      currentUserId.current !== targetUserId ||
      syncingUsers.current.has(targetUserId)
    ) return;
    syncingUsers.current.add(targetUserId);
    setBookmarkSyncStatus('syncing');
    setBookmarkSyncError(null);

    try {
      const pending = await prepareBookmarksForSync(targetUserId);
      let remoteBookmarks = await fetchRemoteBookmarks(targetUserId);
      let hasWriteFailure = false;

      for (const [eventId, change] of Object.entries(pending)) {
        const remote = remoteBookmarks.find((bookmark) => bookmark.event_id === eventId);
        if (!remote || Date.parse(change.updatedAt) > Date.parse(remote.updated_at)) {
          try {
            await saveRemoteBookmark(eventId, change);
          } catch {
            hasWriteFailure = true;
            break;
          }
        }
      }

      remoteBookmarks = await fetchRemoteBookmarks(targetUserId);
      const reconciled = await reconcileBookmarks(targetUserId, remoteBookmarks);
      if (currentUserId.current === targetUserId) {
        currentBookmarkIds.current = reconciled.eventIds;
        setBookmarkedIds(reconciled.eventIds);
        const hasPendingChanges = reconciled.pendingCount > 0 || hasWriteFailure;
        setBookmarkSyncStatus(hasPendingChanges ? 'pending' : 'synced');
        setBookmarkSyncError(
          hasPendingChanges
            ? 'Änderungen bleiben auf diesem Gerät gespeichert und werden später erneut synchronisiert.'
            : null,
        );
      }
    } catch {
      if (currentUserId.current === targetUserId) {
        setBookmarkSyncStatus('pending');
        setBookmarkSyncError(
          'Die Synchronisierung ist gerade nicht möglich. Deine Favoriten bleiben auf diesem Gerät gespeichert.',
        );
      }
    } finally {
      syncingUsers.current.delete(targetUserId);
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!bookmarksReady || !authReady) return;
    let isMounted = true;

    void (async () => {
      try {
        const localIds = await loadBookmarksForUser(userId);
        if (!isMounted || currentUserId.current !== userId) return;
        currentBookmarkIds.current = localIds;
        setBookmarkedIds(localIds);
        if (!userId) {
          setBookmarkSyncStatus('local');
          setBookmarkSyncError(null);
          return;
        }
        await syncBookmarks(userId);
      } catch {
        if (isMounted) setStorageError('Favoriten konnten nicht geladen werden.');
      }
    })();

    if (!userId || !client) {
      return () => {
        isMounted = false;
      };
    }

    const retrySync = () => {
      if (AppState.currentState === 'active') void syncBookmarks(userId);
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retrySync();
    });
    const retryTimer = setInterval(retrySync, 30_000);
    const realtimeChannel = client
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
      )
      .subscribe();

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      clearInterval(retryTimer);
      void client.removeChannel(realtimeChannel);
    };
  }, [bookmarksReady, authReady, userId, syncBookmarks]);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const cachedEvents = await loadCachedEvents();
        if (isMounted && cachedEvents !== null && !hasLoadedLiveData.current) {
          setEvents(cachedEvents);
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
      hasLoadedLiveData.current = true;
      setEvents(eventsQuery.data.data);
      const sourceIsCurrent = eventsQuery.data.sourceStatus.state === 'ok';
      setIsLiveData(sourceIsCurrent);
      setEventError(
        sourceIsCurrent
          ? null
          : eventsQuery.data.data.length > 0 || events.length > 0
            ? 'Die Turnierquelle ist derzeit nicht erreichbar · gespeicherte Termine werden angezeigt.'
            : 'Die Turnierquelle ist derzeit nicht erreichbar · es sind keine gespeicherten Termine vorhanden.',
      );
      void saveEventsToCache(eventsQuery.data.data).catch(() => {
        if (isMounted) setStorageError('Live-Termine konnten nicht offline gespeichert werden.');
      });
    } else if (eventsQuery.isError) {
      setIsLiveData(false);
      setEventError(
        events.length > 0
          ? 'Live-Daten nicht erreichbar · gespeicherte Termine werden angezeigt.'
          : 'Der Kalender konnte nicht geladen werden. Bitte prüfe die Verbindung.',
      );
    }

    return () => {
      isMounted = false;
    };
  }, [eventsQuery.data, eventsQuery.isError, events.length]);

  const toggleBookmark = useCallback(
    async (eventId: string) => {
      const isFavorite = !currentBookmarkIds.current.includes(eventId);
      const next = isFavorite
        ? [...currentBookmarkIds.current, eventId]
        : currentBookmarkIds.current.filter((id) => id !== eventId);
      currentBookmarkIds.current = next;
      setBookmarkedIds(next);
      setStorageError(null);
      try {
        await setBookmarksFavorite(currentUserId.current, [eventId], isFavorite);
        const activeUserId = currentUserId.current;
        if (activeUserId) void syncBookmarks(activeUserId);
      } catch {
        setStorageError('Favorit konnte nicht dauerhaft gespeichert werden.');
      }
    },
    [syncBookmarks],
  );

  const clearBookmarks = useCallback(async () => {
    const idsToClear = [...currentBookmarkIds.current];
    const activeUserId = currentUserId.current;
    currentBookmarkIds.current = [];
    setBookmarkedIds([]);
    setStorageError(null);
    try {
      await setBookmarksFavorite(activeUserId, idsToClear, false);
      if (activeUserId) void syncBookmarks(activeUserId);
    } catch {
      setStorageError('Favoriten konnten nicht gelöscht werden.');
    }
  }, [syncBookmarks]);

  const value = useMemo(
    () => ({
      events,
      bookmarkedIds,
      isReady,
      isLiveData,
      eventError,
      storageError,
      bookmarkSyncStatus,
      bookmarkSyncError,
      toggleBookmark,
      clearBookmarks,
    }),
    [
      events,
      bookmarkedIds,
      isReady,
      isLiveData,
      eventError,
      storageError,
      bookmarkSyncStatus,
      bookmarkSyncError,
      toggleBookmark,
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
