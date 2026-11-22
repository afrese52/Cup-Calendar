import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Pressable, Text } from 'react-native';
import { AppProvider, useCupCal } from './AppContext';

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;
type RemoteBookmark = {
  event_id: string;
  is_favorite: boolean;
  updated_at: string;
  revision: number;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

jest.mock('@workspace/api-client-react', () => {
  const eventsResponse = {
    data: [
      { id: 'turnier-neu', title: 'FNCS Challenger Cup' },
      { id: 'turnier-zweit', title: 'FNCS Zweiter Cup' },
    ],
  };
  return {
    useGetEvents: () => ({ data: eventsResponse, isError: false }),
  };
});

jest.mock('@/services/localEventStore', () => ({
  loadCachedEvents: jest.fn(async () => null),
  saveEventsToCache: jest.fn(async () => undefined),
}));

jest.mock('@/services/localBookmarkStore', () => ({
  getAnonymousBookmarksForImport: jest.fn(async () => []),
  importAnonymousBookmarksForUser: jest.fn(async () => []),
  keepAnonymousBookmarksLocal: jest.fn(async () => undefined),
  loadBookmarksForUser: jest.fn(async () => []),
  prepareBookmarksForSync: jest.fn(async () => ({})),
  reconcileBookmarks: jest.fn(async (_userId: string, remote: RemoteBookmark[]) => ({
    eventIds: remote.filter((bookmark) => bookmark.is_favorite).map((bookmark) => bookmark.event_id),
    pendingCount: 0,
  })),
  setBookmarksFavorite: jest.fn(async () => []),
  shouldUploadBookmarkChange: jest.fn(() => false),
}));

jest.mock('@/services/supabase', () => {
  let authListener: AuthListener | undefined;
  const channels: Array<{
    listener?: () => void;
    statusListener?: (status: string) => void;
  }> = [];
  return {
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: jest.fn((listener: AuthListener) => {
          authListener = listener;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      channel: jest.fn(() => {
        const entry: {
          listener?: () => void;
          statusListener?: (status: string) => void;
        } = {};
        channels.push(entry);
        const channel = {
          on: jest.fn(function (this: typeof channel, _event: string, _filter: unknown, listener: () => void) {
            entry.listener = listener;
            return this;
          }),
          subscribe: jest.fn(function (this: typeof channel, listener?: (status: string) => void) {
            entry.statusListener = listener;
            return this;
          }),
        };
        return channel;
      }),
      removeChannel: jest.fn(async () => undefined),
    },
    fetchRemoteBookmarks: jest.fn(async () => []),
    saveRemoteBookmark: jest.fn(async () => undefined),
    __emitBookmarkRealtime: () => channels.at(-1)?.listener?.(),
    __emitRealtimeStatus: (status: string, channelIndex = channels.length - 1) =>
      channels[channelIndex]?.statusListener?.(status),
    __channelCount: () => channels.length,
    __resetChannels: () => { channels.length = 0; },
    __emitAuthStateChange: (event: string, session: { user: { id: string } } | null) =>
      authListener?.(event, session),
  };
});

function BookmarkState() {
  const {
    bookmarkedIds,
    bookmarkSyncStatus,
    bookmarkSyncError,
    storageError,
    canRetryLocalBookmarkLoad,
    toggleBookmark,
    clearBookmarks,
    retryLocalBookmarkLoad,
    retryBookmarkSync,
  } = useCupCal();
  return (
    <>
      <Text testID="bookmark-ids">{bookmarkedIds.join(',')}</Text>
      <Text testID="bookmark-sync-status">{bookmarkSyncStatus}</Text>
      <Text testID="bookmark-sync-error">{bookmarkSyncError ?? ''}</Text>
      <Text testID="storage-error">{storageError ?? ''}</Text>
      <Text testID="can-retry-local-bookmark-load">{String(canRetryLocalBookmarkLoad)}</Text>
      <Pressable testID="toggle-bookmark" onPress={() => toggleBookmark('turnier-neu')}>
        <Text>Favorit ändern</Text>
      </Pressable>
      <Pressable testID="toggle-second-bookmark" onPress={() => toggleBookmark('turnier-zweit')}>
        <Text>Zweiten Favoriten ändern</Text>
      </Pressable>
      <Pressable testID="clear-bookmarks" onPress={() => clearBookmarks()}>
        <Text>Favoriten löschen</Text>
      </Pressable>
      <Pressable testID="retry-bookmark-sync" onPress={() => retryBookmarkSync()}>
        <Text>Synchronisierung wiederholen</Text>
      </Pressable>
      <Pressable testID="retry-local-bookmark-load" onPress={() => retryLocalBookmarkLoad()}>
        <Text>Favoriten erneut laden</Text>
      </Pressable>
    </>
  );
}

const bookmarkStore = jest.requireMock('@/services/localBookmarkStore') as {
  loadBookmarksForUser: jest.Mock<(...args: any[]) => any>;
  prepareBookmarksForSync: jest.Mock<(...args: any[]) => any>;
  reconcileBookmarks: jest.Mock<(...args: any[]) => any>;
  setBookmarksFavorite: jest.Mock<(...args: any[]) => any>;
};
const mockedSupabase = jest.requireMock('@/services/supabase') as {
  __emitAuthStateChange: (event: string, session: { user: { id: string } } | null) => void;
  __emitBookmarkRealtime: () => void;
  __emitRealtimeStatus: (status: string, channelIndex?: number) => void;
  __channelCount: () => number;
  __resetChannels: () => void;
  supabase: {
    auth: {
      getSession: jest.Mock<(...args: any[]) => any>;
    };
  };
  fetchRemoteBookmarks: jest.Mock<(...args: any[]) => any>;
  saveRemoteBookmark: jest.Mock<(...args: any[]) => any>;
};

async function renderProvider() {
  const view = await render(
    <AppProvider>
      <BookmarkState />
    </AppProvider>,
  );
  await waitFor(() => expect(view.getByTestId('bookmark-ids')).toBeTruthy());
  return view;
}

async function emitUser(userId: string) {
  await act(async () => {
    mockedSupabase.__emitAuthStateChange('SIGNED_IN', { user: { id: userId } });
  });
}

beforeEach(() => {
  bookmarkStore.loadBookmarksForUser.mockReset().mockResolvedValue([]);
  bookmarkStore.reconcileBookmarks.mockReset().mockImplementation(
    async (_userId: string, remote: RemoteBookmark[]) => ({
      eventIds: remote.filter((bookmark) => bookmark.is_favorite).map((bookmark) => bookmark.event_id),
      pendingCount: 0,
    }),
  );
  bookmarkStore.setBookmarksFavorite.mockReset().mockResolvedValue([]);
  mockedSupabase.supabase.auth.getSession.mockReset().mockResolvedValue({
    data: { session: null },
    error: null,
  });
  mockedSupabase.fetchRemoteBookmarks.mockReset().mockResolvedValue([]);
  mockedSupabase.saveRemoteBookmark.mockReset().mockResolvedValue(undefined);
  bookmarkStore.prepareBookmarksForSync.mockReset().mockResolvedValue({});
  const shouldUpload = (jest.requireMock('@/services/localBookmarkStore') as {
    shouldUploadBookmarkChange: jest.Mock<
      (change: { isFavorite: boolean }, remote?: RemoteBookmark) => boolean
    >;
  }).shouldUploadBookmarkChange;
  shouldUpload.mockReset().mockImplementation(
    (change: { isFavorite: boolean }, remote?: RemoteBookmark) =>
      !remote || remote.is_favorite !== change.isFavorite,
  );
});

afterEach(() => {
  AppState.currentState = 'unknown';
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.useRealTimers();
  mockedSupabase.__resetChannels();
});

test('zeigt beim Kaltstart erst nach der Sitzungsprüfung die Favoriten des angemeldeten Kontos', async () => {
  const sessionLoad = deferred<{
    data: { session: { user: { id: string } } };
    error: null;
  }>();
  mockedSupabase.supabase.auth.getSession.mockReturnValue(sessionLoad.promise);
  bookmarkStore.loadBookmarksForUser.mockImplementation((userId: string | null) =>
    Promise.resolve(userId === 'konto-a' ? ['konto-favorit'] : ['gast-favorit']),
  );
  mockedSupabase.fetchRemoteBookmarks.mockResolvedValue([{
    event_id: 'konto-favorit',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }]);

  const view = await renderProvider();

  expect(view.getByTestId('bookmark-ids').props.children).toBe('');
  expect(bookmarkStore.loadBookmarksForUser).not.toHaveBeenCalled();

  await act(async () => {
    sessionLoad.resolve({
      data: { session: { user: { id: 'konto-a' } } },
      error: null,
    });
    await sessionLoad.promise;
  });

  await waitFor(() => {
    expect(view.getByTestId('bookmark-ids').props.children).toBe('konto-favorit');
  });
  expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledWith('konto-a');
  expect(bookmarkStore.loadBookmarksForUser).not.toHaveBeenCalledWith(null);
});

test('zeigt ohne gespeicherte Sitzung weiterhin nur lokale Gastfavoriten', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  bookmarkStore.loadBookmarksForUser.mockImplementation((userId: string | null) =>
    Promise.resolve(userId === null ? ['gast-favorit'] : ['konto-favorit']),
  );

  const view = await renderProvider();

  await waitFor(() => {
    expect(view.getByTestId('bookmark-ids').props.children).toBe('gast-favorit');
  });
  expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledWith(null);
  expect(bookmarkStore.loadBookmarksForUser).not.toHaveBeenCalledWith('konto-a');
  expect(mockedSupabase.fetchRemoteBookmarks).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
});

test('sagt externe Merkliste-Änderungen einmal an, ohne den Accessibility-Fokus zu verschieben', async () => {
  AppState.currentState = 'active';
  let remoteFavorite = false;
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () => remoteFavorite ? [{
    event_id: 'turnier-neu',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }] : []);
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const sendAccessibilityEvent = jest
    .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    .mockImplementation(() => {});
  const view = await renderProvider();
  await emitUser('konto-a');
  await waitFor(() => expect(mockedSupabase.fetchRemoteBookmarks).toHaveBeenCalledWith('konto-a'));
  announce.mockClear();

  remoteFavorite = true;
  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });

  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('turnier-neu'));
  await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
  expect(announce).toHaveBeenLastCalledWith(
    'Merkliste aktualisiert: FNCS Challenger Cup zur Merkliste hinzugefügt.',
  );

  remoteFavorite = false;
  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });

  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe(''));
  await waitFor(() => expect(announce).toHaveBeenCalledTimes(2));
  expect(announce).toHaveBeenLastCalledWith(
    'Merkliste aktualisiert: FNCS Challenger Cup aus der Merkliste entfernt.',
  );
  expect(sendAccessibilityEvent).not.toHaveBeenCalled();
});

test('verwirft verspätete externe Merkliste-Änderungen nach einem Kontowechsel', async () => {
  AppState.currentState = 'active';
  const accountAExternalChange = deferred<RemoteBookmark[]>();
  let accountAFetches = 0;
  let accountBExternalFavorite = false;
  bookmarkStore.loadBookmarksForUser.mockImplementation((userId: string | null) =>
    Promise.resolve(userId === 'konto-b' ? ['favorit-b'] : []),
  );
  mockedSupabase.fetchRemoteBookmarks.mockImplementation((userId: string) => {
    if (userId === 'konto-a') {
      accountAFetches += 1;
      return accountAFetches === 3
        ? accountAExternalChange.promise
        : Promise.resolve(accountAFetches > 3 ? [{
          event_id: 'favorit-a',
          is_favorite: true,
          updated_at: '2026-01-01T00:00:00.000Z',
          revision: 1,
        }] : []);
    }
    return Promise.resolve([
      {
        event_id: 'favorit-b',
        is_favorite: true,
        updated_at: '2026-01-01T00:00:00.000Z',
        revision: 1,
      },
      ...(accountBExternalFavorite ? [{
        event_id: 'turnier-zweit',
        is_favorite: true,
        updated_at: '2026-01-01T00:00:00.000Z',
        revision: 2,
      }] : []),
    ]);
  });
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const view = await renderProvider();

  await emitUser('konto-a');
  await waitFor(() => expect(accountAFetches).toBe(2));
  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });
  await waitFor(() => expect(accountAFetches).toBe(3));

  await emitUser('konto-b');
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b'));
  announce.mockClear();

  await act(async () => {
    accountAExternalChange.resolve([{
      event_id: 'favorit-a',
      is_favorite: true,
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 2,
    }]);
    await accountAExternalChange.promise;
  });

  expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b');
  expect(announce).not.toHaveBeenCalled();
  expect(
    (bookmarkStore.reconcileBookmarks.mock.calls as [string, RemoteBookmark[]][])
      .some(([userId, remote]) =>
        userId === 'konto-a' && remote.some((bookmark) => bookmark.event_id === 'favorit-a'),
      ),
  ).toBe(false);

  accountBExternalFavorite = true;
  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });

  await waitFor(() =>
    expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b,turnier-zweit'),
  );
  await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
  expect(announce).toHaveBeenLastCalledWith(
    'Merkliste aktualisiert: FNCS Zweiter Cup zur Merkliste hinzugefügt.',
  );
});

test('nimmt den Realtime-Kanal nach einem Verbindungsausfall wieder auf und gleicht Favoriten ab', async () => {
  AppState.currentState = 'active';
  let remoteFavorite = false;
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () => remoteFavorite ? [{
    event_id: 'turnier-neu',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }] : []);
  const view = await renderProvider();
  await emitUser('konto-a');
  await waitFor(() => expect(mockedSupabase.fetchRemoteBookmarks).toHaveBeenCalledWith('konto-a'));
  expect(mockedSupabase.__channelCount()).toBe(1);

  jest.useFakeTimers();
  await act(async () => {
    mockedSupabase.__emitRealtimeStatus('CHANNEL_ERROR');
    await jest.advanceTimersByTimeAsync(1_000);
  });

  expect(mockedSupabase.__channelCount()).toBe(2);
  remoteFavorite = true;
  await act(async () => {
    mockedSupabase.__emitRealtimeStatus('SUBSCRIBED');
  });
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('turnier-neu'));

  remoteFavorite = false;
  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe(''));
  expect(mockedSupabase.saveRemoteBookmark).not.toHaveBeenCalled();
});

test('sagt lokale Speichern-Aktionen nicht zusätzlich an', async () => {
  let remoteFavorite = false;
  let pendingFavorite: boolean | null = null;
  bookmarkStore.setBookmarksFavorite.mockImplementation(async (
    _userId: string,
    _eventIds: string[],
    isFavorite: boolean,
  ) => {
    pendingFavorite = isFavorite;
    return isFavorite ? ['turnier-neu'] : [];
  });
  bookmarkStore.prepareBookmarksForSync.mockImplementation(async () => pendingFavorite === null
    ? {}
    : {
        'turnier-neu': {
          isFavorite: pendingFavorite,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () => remoteFavorite ? [{
    event_id: 'turnier-neu',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }] : []);
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const view = await renderProvider();
  await emitUser('konto-a');
  await waitFor(() => expect(view.getByTestId('bookmark-sync-status').props.children).toBe('synced'));
  announce.mockClear();

  remoteFavorite = true;
  await act(async () => {
    await fireEvent.press(view.getByTestId('toggle-bookmark'));
  });
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('turnier-neu'));
  await waitFor(() => expect(view.getByTestId('bookmark-sync-status').props.children).toBe('synced'));

  remoteFavorite = false;
  await act(async () => {
    await fireEvent.press(view.getByTestId('toggle-bookmark'));
  });
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe(''));

  expect(announce).not.toHaveBeenCalled();
});

test('meldet einen Fehler beim Laden lokaler Favoriten verständlich', async () => {
  bookmarkStore.loadBookmarksForUser.mockRejectedValue(new Error('device storage unavailable'));

  const view = await renderProvider();

  await waitFor(() => {
    expect(view.getByTestId('storage-error').props.children).toBe(
      'Favoriten konnten nicht geladen werden.',
    );
  });
  expect(view.getByTestId('bookmark-ids').props.children).toBe('');
  expect(view.getByTestId('can-retry-local-bookmark-load').props.children).toBe('true');
});

test('lädt lokale Favoriten nach einem Ladefehler erneut und entfernt den Fehler bei Erfolg', async () => {
  bookmarkStore.loadBookmarksForUser
    .mockRejectedValueOnce(new Error('device storage unavailable'))
    .mockResolvedValueOnce(['erneut-geladen']);
  const view = await renderProvider();

  await waitFor(() => expect(view.getByTestId('can-retry-local-bookmark-load').props.children).toBe('true'));
  await act(async () => {
    await fireEvent.press(view.getByTestId('retry-local-bookmark-load'));
  });

  expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledTimes(2);
  expect(bookmarkStore.loadBookmarksForUser).toHaveBeenLastCalledWith(null);
  expect(view.getByTestId('bookmark-ids').props.children).toBe('erneut-geladen');
  expect(view.getByTestId('storage-error').props.children).toBe('');
  expect(view.getByTestId('can-retry-local-bookmark-load').props.children).toBe('false');
});

test('behält den verständlichen Ladefehler, wenn das erneute Laden erneut scheitert', async () => {
  bookmarkStore.loadBookmarksForUser.mockRejectedValue(new Error('device storage unavailable'));
  const view = await renderProvider();

  await waitFor(() => expect(view.getByTestId('can-retry-local-bookmark-load').props.children).toBe('true'));
  await act(async () => {
    await fireEvent.press(view.getByTestId('retry-local-bookmark-load'));
  });

  expect(view.getByTestId('storage-error').props.children).toBe(
    'Favoriten konnten nicht geladen werden.',
  );
  expect(view.getByTestId('can-retry-local-bookmark-load').props.children).toBe('true');
});

test('zeigt einen Favoriten erst nach erfolgreichem lokalem Speichern an', async () => {
  bookmarkStore.setBookmarksFavorite.mockRejectedValue(new Error('device storage unavailable'));
  const view = await renderProvider();
  await emitUser('konto-a');

  await waitFor(() => expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledWith('konto-a'));
  await act(async () => {
    await fireEvent.press(view.getByTestId('toggle-bookmark'));
  });

  expect(view.getByTestId('bookmark-ids').props.children).toBe('');
  expect(view.getByTestId('storage-error').props.children).toBe(
    'Favorit konnte nicht gespeichert werden. Bitte versuche es erneut.',
  );
});

test('behält Favoriten bei einem fehlgeschlagenen lokalen Löschen bei', async () => {
  mockedSupabase.fetchRemoteBookmarks.mockResolvedValue([{
    event_id: 'bereits-gespeichert',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }]);
  bookmarkStore.setBookmarksFavorite.mockRejectedValue(new Error('device storage unavailable'));
  const view = await renderProvider();
  await emitUser('konto-a');

  await waitFor(() => {
    expect(view.getByTestId('bookmark-ids').props.children).toBe('bereits-gespeichert');
  });
  await act(async () => {
    await fireEvent.press(view.getByTestId('clear-bookmarks'));
  });

  expect(view.getByTestId('bookmark-ids').props.children).toBe('bereits-gespeichert');
  expect(view.getByTestId('storage-error').props.children).toBe(
    'Favoriten konnten nicht gelöscht werden. Bitte versuche es erneut.',
  );
});

test('zeigt nach einem Kontowechsel während des lokalen Ladens nur die Favoriten des neuen Kontos', async () => {
  const accountALoad = deferred<string[]>();
  bookmarkStore.loadBookmarksForUser.mockImplementation((userId: string) =>
    userId === 'konto-a' ? accountALoad.promise : Promise.resolve(['favorit-b']),
  );
  mockedSupabase.fetchRemoteBookmarks.mockResolvedValue([{
    event_id: 'favorit-b',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }]);
  const view = await renderProvider();

  await emitUser('konto-a');
  await waitFor(() => expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledWith('konto-a'));

  await emitUser('konto-b');
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b'));

  await act(async () => {
    accountALoad.resolve(['favorit-a']);
    await accountALoad.promise;
  });

  expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b');
});

test('zeigt nach Abmeldung während Kontoladen und Sync nur Gastfavoriten', async () => {
  AppState.currentState = 'active';
  const accountALoad = deferred<string[]>();
  const accountARemote = deferred<RemoteBookmark[]>();
  bookmarkStore.loadBookmarksForUser.mockImplementation((userId: string | null) => {
    if (userId === 'konto-a') return accountALoad.promise;
    return Promise.resolve(['gast-favorit']);
  });
  mockedSupabase.fetchRemoteBookmarks.mockImplementation((userId: string) =>
    userId === 'konto-a' ? accountARemote.promise : Promise.resolve([]),
  );
  const view = await renderProvider();
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('gast-favorit'));

  await emitUser('konto-a');
  await waitFor(() => expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledWith('konto-a'));
  await act(async () => {
    mockedSupabase.__emitRealtimeStatus('SUBSCRIBED');
  });
  await waitFor(() => expect(mockedSupabase.fetchRemoteBookmarks).toHaveBeenCalledWith('konto-a'));

  await act(async () => {
    mockedSupabase.__emitAuthStateChange('SIGNED_OUT', null);
  });
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('gast-favorit'));

  await act(async () => {
    accountALoad.resolve(['konto-favorit']);
    accountARemote.resolve([{
      event_id: 'konto-favorit',
      is_favorite: true,
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 1,
    }]);
    await Promise.all([accountALoad.promise, accountARemote.promise]);
  });
  expect(view.getByTestId('bookmark-ids').props.children).toBe('gast-favorit');
  expect(
    (bookmarkStore.reconcileBookmarks.mock.calls as [string, RemoteBookmark[]][])
      .some(([userId, remote]) =>
        userId === 'konto-a' && remote.some((bookmark) => bookmark.event_id === 'konto-favorit'),
      ),
  ).toBe(false);
  expect(bookmarkStore.loadBookmarksForUser).toHaveBeenCalledWith(null);
});

test('überschreibt neue Favoriten nicht mit einer verspäteten Sync-Antwort des vorherigen Kontos', async () => {
  const accountARemote = deferred<RemoteBookmark[]>();
  let accountAFetches = 0;
  mockedSupabase.fetchRemoteBookmarks.mockImplementation((userId: string) => {
    if (userId === 'konto-a' && accountAFetches++ === 0) return accountARemote.promise;
    return Promise.resolve([{
      event_id: `favorit-${userId.slice(-1)}`,
      is_favorite: true,
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 1,
    }]);
  });
  const view = await renderProvider();

  await emitUser('konto-a');
  await waitFor(() =>
    expect(mockedSupabase.fetchRemoteBookmarks).toHaveBeenCalledWith('konto-a'),
  );

  await emitUser('konto-b');
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b'));

  await act(async () => {
    accountARemote.resolve([{
      event_id: 'favorit-a',
      is_favorite: true,
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 1,
    }]);
    await accountARemote.promise;
  });
  expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b');
  expect(
    (bookmarkStore.reconcileBookmarks.mock.calls as [string, RemoteBookmark[]][])
      .some(([userId, remote]) =>
        userId === 'konto-a' && remote.some((bookmark) => bookmark.event_id === 'favorit-a'),
      ),
  ).toBe(false);
});

test('verwirft eine alte Sync-Antwort nach Ab- und erneuter Anmeldung desselben Kontos', async () => {
  AppState.currentState = 'active';
  const firstSessionExternalChange = deferred<RemoteBookmark[]>();
  let accountAFetches = 0;
  mockedSupabase.fetchRemoteBookmarks.mockImplementation((userId: string) => {
    if (userId !== 'konto-a') return Promise.resolve([]);
    accountAFetches += 1;
    if (accountAFetches === 3) return firstSessionExternalChange.promise;
    if (accountAFetches > 3) {
      return Promise.resolve([{
        event_id: 'favorit-neu',
        is_favorite: true,
        updated_at: '2026-01-01T00:00:00.000Z',
        revision: 2,
      }]);
    }
    return Promise.resolve([]);
  });
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const view = await renderProvider();

  await emitUser('konto-a');
  await waitFor(() => expect(accountAFetches).toBe(2));
  await waitFor(() => expect(view.getByTestId('bookmark-sync-status').props.children).toBe('synced'));

  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });
  await waitFor(() => expect(accountAFetches).toBe(3));

  await act(async () => {
    mockedSupabase.__emitAuthStateChange('SIGNED_OUT', null);
  });
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe(''));

  await emitUser('konto-a');
  await waitFor(() => expect(accountAFetches).toBe(5));
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-neu'));
  await waitFor(() => expect(view.getByTestId('bookmark-sync-status').props.children).toBe('synced'));
  announce.mockClear();

  await act(async () => {
    firstSessionExternalChange.resolve([{
      event_id: 'favorit-alt',
      is_favorite: true,
      updated_at: '2026-01-01T00:00:00.000Z',
      revision: 3,
    }]);
    await firstSessionExternalChange.promise;
  });

  expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-neu');
  expect(view.getByTestId('bookmark-sync-status').props.children).toBe('synced');
  expect(announce).not.toHaveBeenCalled();
  expect(
    (bookmarkStore.reconcileBookmarks.mock.calls as [string, RemoteBookmark[]][])
      .some(([userId, remote]) =>
        userId === 'konto-a' && remote.some((bookmark) => bookmark.event_id === 'favorit-alt'),
      ),
  ).toBe(false);
});

test('verwirft verspätete Sync-Fehler des vorherigen Kontos samt Screenreader-Ansage', async () => {
  const accountAFetch = deferred<RemoteBookmark[]>();
  bookmarkStore.loadBookmarksForUser.mockImplementation((userId: string | null) =>
    Promise.resolve(userId === 'konto-b' ? ['favorit-b'] : []),
  );
  mockedSupabase.fetchRemoteBookmarks.mockImplementation((userId: string) =>
    userId === 'konto-a'
      ? accountAFetch.promise
      : Promise.reject(new Error('network failed')),
  );
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  const view = await renderProvider();

  await emitUser('konto-a');
  await waitFor(() =>
    expect(mockedSupabase.fetchRemoteBookmarks).toHaveBeenCalledWith('konto-a'),
  );
  await act(async () => {
    mockedSupabase.__emitBookmarkRealtime();
  });

  await emitUser('konto-b');
  await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b'));
  await waitFor(() =>
    expect(view.getByTestId('bookmark-sync-status').props.children).toBe('pending'),
  );
  const accountBStatus = view.getByTestId('bookmark-sync-status').props.children;
  const accountBError = view.getByTestId('bookmark-sync-error').props.children;
  expect(accountBError).toBe(
    'Die Synchronisierung ist gerade nicht möglich. Deine Favoriten bleiben auf diesem Gerät gespeichert.',
  );
  announce.mockClear();

  await act(async () => {
    accountAFetch.reject(new Error('late account A failure'));
    await accountAFetch.promise.catch(() => undefined);
  });

  expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b');
  expect(view.getByTestId('bookmark-sync-status').props.children).toBe(accountBStatus);
  expect(view.getByTestId('bookmark-sync-error').props.children).toBe(accountBError);
  expect(announce).not.toHaveBeenCalled();
});

test('führt parallele Wiederholungen und Realtime-Auslöser für denselben Favoriten nur einmal aus', async () => {
  const firstWrite = deferred<void>();
  let remoteFavorite = false;
  bookmarkStore.prepareBookmarksForSync.mockResolvedValue({
    'turnier-neu': { isFavorite: true, updatedAt: '2026-01-01T00:00:00.000Z' },
  });
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () => remoteFavorite ? [{
    event_id: 'turnier-neu',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }] : []);
  const saveRemoteBookmark = mockedSupabase.saveRemoteBookmark;
  saveRemoteBookmark.mockImplementation(async () => {
    await firstWrite.promise;
    remoteFavorite = true;
  });

  const view = await renderProvider();
  await emitUser('konto-a');
  await waitFor(() => expect(saveRemoteBookmark).toHaveBeenCalledTimes(1));

  await act(async () => {
    await fireEvent.press(view.getByTestId('retry-bookmark-sync'));
    mockedSupabase.__emitBookmarkRealtime();
    await fireEvent.press(view.getByTestId('retry-bookmark-sync'));
  });
  await act(async () => {
    firstWrite.resolve();
    await firstWrite.promise;
  });

  await waitFor(() => expect(mockedSupabase.fetchRemoteBookmarks).toHaveBeenCalledTimes(4));
  expect(saveRemoteBookmark).toHaveBeenCalledTimes(1);
});

test('merkt App-Wechsel und 30-Sekunden-Timer während eines Syncs vor', async () => {
  AppState.currentState = 'active';
  const firstWrite = deferred<void>();
  let remoteFavorite = false;
  let pendingFavorite: boolean | null = true;
  bookmarkStore.loadBookmarksForUser.mockImplementation(async (userId: string | null) =>
    userId === 'konto-a' ? ['turnier-neu'] : [],
  );
  bookmarkStore.setBookmarksFavorite.mockImplementation(async (
    _userId: string,
    _eventIds: string[],
    isFavorite: boolean,
  ) => {
    pendingFavorite = isFavorite;
    return isFavorite ? ['turnier-neu'] : [];
  });
  bookmarkStore.prepareBookmarksForSync.mockImplementation(async () => pendingFavorite === null
    ? {}
    : {
        'turnier-neu': {
          isFavorite: pendingFavorite,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
  bookmarkStore.reconcileBookmarks.mockImplementation(async (_userId: string, remote: RemoteBookmark[]) => {
    if (pendingFavorite !== null && remote.some((bookmark) =>
      bookmark.event_id === 'turnier-neu' && bookmark.is_favorite === pendingFavorite
    )) {
      pendingFavorite = null;
    }
    const eventIds = new Set(remote.filter((bookmark) => bookmark.is_favorite).map((bookmark) => bookmark.event_id));
    if (pendingFavorite === true) eventIds.add('turnier-neu');
    if (pendingFavorite === false) eventIds.delete('turnier-neu');
    return { eventIds: [...eventIds], pendingCount: pendingFavorite === null ? 0 : 1 };
  });
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () => [{
    event_id: 'turnier-neu',
    is_favorite: remoteFavorite,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: remoteFavorite ? 1 : 2,
  }]);
  const saveRemoteBookmark = mockedSupabase.saveRemoteBookmark;
  saveRemoteBookmark.mockImplementation(async (_eventId: string, change: { isFavorite: boolean }) => {
    if (saveRemoteBookmark.mock.calls.length === 1) await firstWrite.promise;
    remoteFavorite = change.isFavorite;
  });

  const view = await renderProvider();
  const appStateSpy = jest.spyOn(AppState, 'addEventListener');
  jest.useFakeTimers();
  await emitUser('konto-a');
  await waitFor(() => expect(saveRemoteBookmark).toHaveBeenCalledTimes(1));
  const appStateChangeListener = appStateSpy.mock.calls
    .find(([eventName]) => eventName === 'change')?.[1];
  expect(appStateChangeListener).toBeDefined();

  await act(async () => {
    await fireEvent.press(view.getByTestId('toggle-bookmark'));
  });
  await act(async () => {
    appStateChangeListener?.('active');
    await jest.advanceTimersByTimeAsync(30_000);
  });
  expect(saveRemoteBookmark).toHaveBeenCalledTimes(1);

  await act(async () => {
    firstWrite.resolve();
    await firstWrite.promise;
  });

  await waitFor(() => expect(saveRemoteBookmark).toHaveBeenCalledTimes(2));
  expect(saveRemoteBookmark.mock.calls.map((call: unknown[]) =>
    (call[1] as { isFavorite: boolean }).isFavorite,
  )).toEqual([true, false]);
  expect(remoteFavorite).toBe(false);
});

test('synchronisiert die neueste lokale Änderung nach Abschluss eines laufenden Schreibens', async () => {
  const firstWrite = deferred<void>();
  let remoteFavorite = false;
  let pendingFavorite: boolean | null = true;
  bookmarkStore.loadBookmarksForUser.mockImplementation(async (userId: string | null) =>
    userId === 'konto-a' ? ['turnier-neu'] : [],
  );
  bookmarkStore.setBookmarksFavorite.mockImplementation(async (
    _userId: string,
    _eventIds: string[],
    isFavorite: boolean,
  ) => {
    pendingFavorite = isFavorite;
    return isFavorite ? ['turnier-neu'] : [];
  });
  bookmarkStore.prepareBookmarksForSync.mockImplementation(async () => pendingFavorite === null
    ? {}
    : {
        'turnier-neu': {
          isFavorite: pendingFavorite,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });
  bookmarkStore.reconcileBookmarks.mockImplementation(async (_userId: string, remote: RemoteBookmark[]) => {
    if (pendingFavorite !== null && remote.some((bookmark) =>
      bookmark.event_id === 'turnier-neu' && bookmark.is_favorite === pendingFavorite
    )) {
      pendingFavorite = null;
    }
    const eventIds = new Set(remote.filter((bookmark) => bookmark.is_favorite).map((bookmark) => bookmark.event_id));
    if (pendingFavorite === true) eventIds.add('turnier-neu');
    if (pendingFavorite === false) eventIds.delete('turnier-neu');
    return { eventIds: [...eventIds], pendingCount: pendingFavorite === null ? 0 : 1 };
  });
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () => [{
    event_id: 'turnier-neu',
    is_favorite: remoteFavorite,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: remoteFavorite ? 1 : 2,
  }]);
  const saveRemoteBookmark = mockedSupabase.saveRemoteBookmark;
  saveRemoteBookmark.mockImplementation(async (_eventId: string, change: { isFavorite: boolean }) => {
    if (saveRemoteBookmark.mock.calls.length === 1) await firstWrite.promise;
    remoteFavorite = change.isFavorite;
  });

  const view = await renderProvider();
  await emitUser('konto-a');
  await waitFor(() => expect(saveRemoteBookmark).toHaveBeenCalledTimes(1));

  await act(async () => {
    await fireEvent.press(view.getByTestId('toggle-bookmark'));
  });
  await act(async () => {
    firstWrite.resolve();
    await firstWrite.promise;
  });

  await waitFor(() => expect(saveRemoteBookmark).toHaveBeenCalledTimes(2));
  expect(saveRemoteBookmark.mock.calls.map((call: unknown[]) =>
    (call[1] as { isFavorite: boolean }).isFavorite,
  )).toEqual([true, false]);
  expect(remoteFavorite).toBe(false);
});

test('synchronisiert während eines Schreibens die neuesten Änderungen für mehrere Turniere', async () => {
  const firstWrite = deferred<void>();
  const pending = new Map<string, { isFavorite: boolean; updatedAt: string }>([
    ['turnier-neu', { isFavorite: true, updatedAt: '2026-01-01T00:00:00.000Z' }],
    ['turnier-zweit', { isFavorite: false, updatedAt: '2026-01-01T00:00:00.000Z' }],
  ]);
  const localIds = new Set(['turnier-neu']);
  const remote = new Map<string, boolean>();
  bookmarkStore.loadBookmarksForUser.mockImplementation(async (userId: string | null) =>
    userId === 'konto-a' ? [...localIds] : [],
  );
  bookmarkStore.setBookmarksFavorite.mockImplementation(async (
    _userId: string,
    eventIds: string[],
    isFavorite: boolean,
  ) => {
    for (const eventId of eventIds) {
      if (isFavorite) localIds.add(eventId);
      else localIds.delete(eventId);
      pending.set(eventId, { isFavorite, updatedAt: '2026-01-02T00:00:00.000Z' });
    }
    return [...localIds];
  });
  bookmarkStore.prepareBookmarksForSync.mockImplementation(async () =>
    Object.fromEntries([...pending.entries()].map(([eventId, change]) => [eventId, { ...change }])),
  );
  bookmarkStore.reconcileBookmarks.mockImplementation(async (_userId: string, remoteBookmarks: RemoteBookmark[]) => {
    const remoteById = new Map(remoteBookmarks.map((bookmark) => [bookmark.event_id, bookmark]));
    for (const [eventId, change] of pending) {
      if (remoteById.get(eventId)?.is_favorite === change.isFavorite) pending.delete(eventId);
    }
    const ids = new Set(
      remoteBookmarks.filter((bookmark) => bookmark.is_favorite).map((bookmark) => bookmark.event_id),
    );
    for (const [eventId, change] of pending) {
      if (change.isFavorite) ids.add(eventId);
      else ids.delete(eventId);
    }
    return { eventIds: [...ids], pendingCount: pending.size };
  });
  mockedSupabase.fetchRemoteBookmarks.mockImplementation(async () =>
    [...remote.entries()].map(([event_id, is_favorite], revision) => ({
      event_id,
      is_favorite,
      updated_at: '2026-01-02T00:00:00.000Z',
      revision,
    })),
  );
  const saveRemoteBookmark = mockedSupabase.saveRemoteBookmark;
  saveRemoteBookmark.mockImplementation(async (
    eventId: string,
    change: { isFavorite: boolean },
  ) => {
    if (saveRemoteBookmark.mock.calls.length === 1) await firstWrite.promise;
    remote.set(eventId, change.isFavorite);
  });

  const view = await renderProvider();
  await emitUser('konto-a');
  await waitFor(() => expect(saveRemoteBookmark).toHaveBeenCalledTimes(1));

  await act(async () => {
    await fireEvent.press(view.getByTestId('toggle-bookmark'));
    await fireEvent.press(view.getByTestId('toggle-second-bookmark'));
  });
  expect(view.getByTestId('bookmark-ids').props.children).toBe('turnier-zweit');
  expect([...pending.entries()].map(([eventId, change]) => [eventId, change.isFavorite])).toEqual([
    ['turnier-neu', false],
    ['turnier-zweit', true],
  ]);

  await act(async () => {
    firstWrite.resolve();
    await firstWrite.promise;
  });

  await waitFor(() => expect(view.getByTestId('bookmark-sync-status').props.children).toBe('synced'));
  expect(saveRemoteBookmark.mock.calls.map((call: unknown[]) => [
    call[0],
    (call[1] as { isFavorite: boolean }).isFavorite,
  ])).toEqual([
    ['turnier-neu', true],
    ['turnier-zweit', false],
    ['turnier-neu', false],
    ['turnier-zweit', true],
  ]);
  expect([...remote.entries()]).toEqual([
    ['turnier-neu', false],
    ['turnier-zweit', true],
  ]);
  expect(pending.size).toBe(0);
});
