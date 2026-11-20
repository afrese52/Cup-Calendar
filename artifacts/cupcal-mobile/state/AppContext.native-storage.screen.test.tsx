import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform, Pressable, Text } from 'react-native';
import { AppProvider, useCupCal } from './AppContext';

jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  };
  return { __esModule: true, default: storage, ...storage };
});

jest.mock('@workspace/api-client-react', () => {
  const eventsResponse = { data: [] };
  return {
    useGetEvents: () => ({ data: eventsResponse, isError: false }),
  };
});

jest.mock('@/services/localEventStore', () => ({
  loadCachedEvents: jest.fn(async () => null),
  saveEventsToCache: jest.fn(async () => undefined),
}));

jest.mock('@/services/supabase', () => {
  let authListener: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
  const channel = {
    on: jest.fn(function (this: typeof channel) {
      return this;
    }),
    subscribe: jest.fn(function (this: typeof channel) {
      return this;
    }),
  };
  return {
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: { user: { id: 'konto-test' } } },
          error: null,
        })),
        onAuthStateChange: jest.fn((listener: typeof authListener) => {
          authListener = listener;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => undefined),
    },
    fetchRemoteBookmarks: jest.fn(async () => []),
    saveRemoteBookmark: jest.fn(async () => undefined),
  };
});

function NativeStorageState() {
  const { bookmarkedIds, storageError, toggleBookmark } = useCupCal();
  return (
    <>
      <Text testID="bookmark-ids">{bookmarkedIds.join(',')}</Text>
      <Text testID="storage-error">{storageError ?? ''}</Text>
      <Pressable testID="toggle-bookmark" onPress={() => toggleBookmark('turnier-test')}>
        <Text>Favorit ändern</Text>
      </Pressable>
    </>
  );
}

const nativeStorage = jest.requireMock('@react-native-async-storage/async-storage') as {
  getItem: jest.Mock<(...args: any[]) => any>;
  setItem: jest.Mock<(...args: any[]) => any>;
  removeItem: jest.Mock<(...args: any[]) => any>;
};
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

function setPlatformOS(platform: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
}

beforeEach(() => {
  nativeStorage.getItem.mockReset().mockResolvedValue(null);
  nativeStorage.setItem.mockReset().mockResolvedValue(undefined);
  nativeStorage.removeItem.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
  }
});

test.each(['ios', 'android'] as const)(
  'zeigt nach einem nativen AsyncStorage-Lesefehler auf %s den verständlichen Ladefehler',
  async (platform) => {
    setPlatformOS(platform);
    nativeStorage.getItem.mockRejectedValue(new Error('native storage read failed'));

    const view = await render(
      <AppProvider>
        <NativeStorageState />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(view.getByTestId('storage-error').props.children).toBe(
        'Favoriten konnten nicht geladen werden.',
      );
    });
    expect(view.getByTestId('bookmark-ids').props.children).toBe('');
  },
);

test.each(['ios', 'android'] as const)(
  'hält auf %s die sichtbaren Favoriten bei einem nativen AsyncStorage-Schreibfehler unverändert',
  async (platform) => {
    setPlatformOS(platform);
    nativeStorage.setItem.mockRejectedValue(new Error('native storage write failed'));

    const view = await render(
      <AppProvider>
        <NativeStorageState />
      </AppProvider>,
    );
    await waitFor(() => expect(view.getByTestId('bookmark-ids').props.children).toBe(''));

    await act(async () => {
      await fireEvent.press(view.getByTestId('toggle-bookmark'));
    });

    expect(view.getByTestId('bookmark-ids').props.children).toBe('');
    expect(view.getByTestId('storage-error').props.children).toBe(
      'Favorit konnte nicht gespeichert werden. Bitte versuche es erneut.',
    );
    expect(nativeStorage.setItem).toHaveBeenCalled();
  },
);
