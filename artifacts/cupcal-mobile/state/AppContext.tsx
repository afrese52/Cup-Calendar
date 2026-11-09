import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGetEvents } from '@workspace/api-client-react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TournamentEvent } from '@/data/events';
import { loadCachedEvents, saveEventsToCache } from '@/services/localEventStore';

const BOOKMARKS_KEY = 'cupcal.bookmarks.v1';

interface AppContextValue {
  events: TournamentEvent[];
  bookmarkedIds: string[];
  isReady: boolean;
  isLiveData: boolean;
  eventError: string | null;
  storageError: string | null;
  toggleBookmark: (eventId: string) => Promise<void>;
  clearBookmarks: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [bookmarksReady, setBookmarksReady] = useState(false);
  const [eventsReady, setEventsReady] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const hasLoadedLiveData = useRef(false);
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
    AsyncStorage.getItem(BOOKMARKS_KEY)
      .then((stored) => {
        if (!isMounted || !stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
          setBookmarkedIds(parsed);
        }
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
      const next = bookmarkedIds.includes(eventId)
        ? bookmarkedIds.filter((id) => id !== eventId)
        : [...bookmarkedIds, eventId];
      setBookmarkedIds(next);
      setStorageError(null);
      try {
        await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
      } catch {
        setStorageError('Favorit konnte nicht dauerhaft gespeichert werden.');
      }
    },
    [bookmarkedIds],
  );

  const clearBookmarks = useCallback(async () => {
    setBookmarkedIds([]);
    setStorageError(null);
    try {
      await AsyncStorage.removeItem(BOOKMARKS_KEY);
    } catch {
      setStorageError('Favoriten konnten nicht gelöscht werden.');
    }
  }, []);

  const value = useMemo(
    () => ({
      events,
      bookmarkedIds,
      isReady,
      isLiveData,
      eventError,
      storageError,
      toggleBookmark,
      clearBookmarks,
    }),
    [events, bookmarkedIds, isReady, isLiveData, eventError, storageError, toggleBookmark, clearBookmarks],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useCupCal() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useCupCal muss innerhalb von AppProvider verwendet werden.');
  return context;
}
