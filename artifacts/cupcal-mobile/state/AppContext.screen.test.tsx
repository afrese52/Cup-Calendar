import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

jest.mock('@workspace/api-client-react', () => ({
  useGetEvents: () => ({ data: undefined, isError: false }),
}));

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
  const channel = {
    on: jest.fn(function (this: typeof channel) { return this; }),
    subscribe: jest.fn(function (this: typeof channel) { return this; }),
  };
  return {
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: jest.fn((listener: AuthListener) => {
          authListener = listener;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => undefined),
    },
    fetchRemoteBookmarks: jest.fn(async () => []),
    saveRemoteBookmark: jest.fn(async () => undefined),
    __emitAuthStateChange: (event: string, session: { user: { id: string } } | null) =>
      authListener?.(event, session),
  };
});

function BookmarkState() {
  const { bookmarkedIds, storageError, toggleBookmark, clearBookmarks } = useCupCal();
  return (
    <>
      <Text testID="bookmark-ids">{bookmarkedIds.join(',')}</Text>
      <Text testID="storage-error">{storageError ?? ''}</Text>
      <Pressable testID="toggle-bookmark" onPress={() => toggleBookmark('turnier-neu')}>
        <Text>Favorit ändern</Text>
      </Pressable>
      <Pressable testID="clear-bookmarks" onPress={() => clearBookmarks()}>
        <Text>Favoriten löschen</Text>
      </Pressable>
    </>
  );
}

const bookmarkStore = jest.requireMock('@/services/localBookmarkStore') as {
  loadBookmarksForUser: jest.Mock<(...args: any[]) => any>;
  reconcileBookmarks: jest.Mock<(...args: any[]) => any>;
  setBookmarksFavorite: jest.Mock<(...args: any[]) => any>;
};
const mockedSupabase = jest.requireMock('@/services/supabase') as {
  __emitAuthStateChange: (event: string, session: { user: { id: string } } | null) => void;
  supabase: {
    auth: {
      getSession: jest.Mock<(...args: any[]) => any>;
    };
  };
  fetchRemoteBookmarks: jest.Mock<(...args: any[]) => any>;
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
});

afterEach(() => {
  jest.clearAllMocks();
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
  await waitFor(() => expect(bookmarkStore.reconcileBookmarks).toHaveBeenCalledWith(
    'konto-a',
    expect.arrayContaining([expect.objectContaining({ event_id: 'favorit-a' })]),
  ));

  expect(view.getByTestId('bookmark-ids').props.children).toBe('favorit-b');
});
