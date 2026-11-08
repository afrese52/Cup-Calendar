import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { sampleEvents, type TournamentEvent } from '@/data/events';

const BOOKMARKS_KEY = 'cupcal.bookmarks.v1';

interface AppContextValue {
  events: TournamentEvent[];
  bookmarkedIds: string[];
  isReady: boolean;
  storageError: string | null;
  toggleBookmark: (eventId: string) => Promise<void>;
  clearBookmarks: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

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
        if (isMounted) setIsReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
      events: sampleEvents,
      bookmarkedIds,
      isReady,
      storageError,
      toggleBookmark,
      clearBookmarks,
    }),
    [bookmarkedIds, isReady, storageError, toggleBookmark, clearBookmarks],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useCupCal() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useCupCal muss innerhalb von AppProvider verwendet werden.');
  return context;
}
