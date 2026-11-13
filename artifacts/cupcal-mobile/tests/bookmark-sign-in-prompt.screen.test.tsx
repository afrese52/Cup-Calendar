import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { sampleEvents } from '../data/events';
import { EventCard } from '../components/EventCard';
import EventDetailsScreen from '../app/event/[id]';
import { promptAccountSignIn } from '../services/accountSignInPrompt';

const mockContext: { current: Record<string, any> } = { current: {} };

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'preview-fncs-eu-duos' }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = require('react-native');
  return { SafeAreaView: MockView };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    foreground: '#111',
    mutedForeground: '#666',
    primary: '#06c',
    primaryForeground: '#fff',
    secondary: '#eee',
    secondaryForeground: '#333',
    destructive: '#c00',
    success: '#080',
    warning: '#a60',
    accent: '#def',
    accentForeground: '#123',
    heroHighlight: '#def',
    heroMeta: '#ddd',
    heroForeground: '#fff',
    card: '#fff',
    border: '#ddd',
    surfaceRaised: '#f5f5f5',
  }),
}));
jest.mock('@/state/AppContext', () => ({
  useCupCal: () => mockContext.current,
}));

const mockRouterPush = (jest.requireMock('expo-router') as {
  router: { push: jest.Mock };
}).router.push;
const event = sampleEvents[0]!;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

function setPlatformOS(platform: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: platform,
  });
}

function getDialogButtons() {
  const [, , buttons] = alertSpy.mock.calls.at(-1)!;
  return buttons as { text: string; onPress?: () => void }[];
}

function setAuthState(isAuthenticated: boolean, bookmarkedIds: string[] = []) {
  mockContext.current = {
    authReady: true,
    isAuthenticated,
    events: [event],
    bookmarkedIds,
    toggleBookmark: mockToggleBookmark,
  };
}

const mockToggleBookmark = jest.fn(async (_eventId: string) => undefined);

beforeEach(() => {
  setAuthState(false);
  mockRouterPush.mockReset();
  mockToggleBookmark.mockReset().mockResolvedValue(undefined);
  alertSpy.mockClear();
});

afterEach(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
  }
});

test.each(['android', 'ios'] as const)(
  'Kalenderkarte zeigt Gästen den Dialog und erhält den Zustand auf %s',
  async (platform) => {
    setPlatformOS(platform);
    const onBookmarkToggle = jest.fn();
    const view = await render(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={onBookmarkToggle} />,
    );
    const bookmarkButton = view.getByTestId(`bookmark-${event.id}`);

    expect(bookmarkButton.props.accessibilityLabel).toBe('Zum Speichern anmelden');
    await fireEvent.press(bookmarkButton);
    expect(alertSpy).toHaveBeenCalledWith(
      'Anmeldung erforderlich',
      expect.stringContaining('persönlichen Merkliste'),
      expect.any(Array),
    );

    getDialogButtons().find((button) => button.text === 'Später')?.onPress?.();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(view.getByTestId(`bookmark-${event.id}`)).toBeTruthy();

    await fireEvent.press(view.getByTestId(`bookmark-${event.id}`));
    getDialogButtons().find((button) => button.text === 'Anmelden')?.onPress?.();
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/settings');
    expect(onBookmarkToggle).not.toHaveBeenCalled();

    setAuthState(true);
    await view.rerender(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe('In Merkliste speichern');

    await fireEvent.press(view.getByTestId(`bookmark-${event.id}`));
    expect(onBookmarkToggle).toHaveBeenCalledWith(event.id);

    await view.rerender(
      <EventCard event={event} isBookmarked onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe('Aus Merkliste entfernen');

    setAuthState(false);
    await view.rerender(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe('Zum Speichern anmelden');
  },
);

test.each(['android', 'ios'] as const)(
  'Turnierdetails behalten Gäste auf der Ansicht und erlauben Speichern nach Anmeldung auf %s',
  async (platform) => {
    setPlatformOS(platform);
    const view = await render(<EventDetailsScreen />);
    expect(view.getByTestId('event-detail-bookmark')).toBeTruthy();
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe('Zum Speichern anmelden');

    await fireEvent.press(view.getByTestId('event-save-button'));
    getDialogButtons().find((button) => button.text === 'Später')?.onPress?.();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(view.getByText('FNCS Challenger Cup')).toBeTruthy();

    await fireEvent.press(view.getByTestId('event-save-button'));
    getDialogButtons().find((button) => button.text === 'Anmelden')?.onPress?.();
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/settings');
    expect(view.getByText('FNCS Challenger Cup')).toBeTruthy();

    setAuthState(true);
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe('In Merkliste speichern');
    await fireEvent.press(view.getByTestId('event-save-button'));
    expect(mockToggleBookmark).toHaveBeenCalledWith(event.id);

    setAuthState(true, [event.id]);
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe('Aus Merkliste entfernen');
    expect(view.getByText('In deiner Merkliste')).toBeTruthy();

    setAuthState(false);
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe('Zum Speichern anmelden');
  },
);

test.each(['android', 'ios'] as const)(
  'Anmeldedialog ordnet Später und Anmelden unter %s dem richtigen Verhalten zu',
  (platform) => {
    setPlatformOS(platform);
    promptAccountSignIn();
    const buttons = getDialogButtons();

    expect(buttons.map((button) => button.text)).toEqual(['Später', 'Anmelden']);
    buttons[0]?.onPress?.();
    expect(mockRouterPush).not.toHaveBeenCalled();
    buttons[1]?.onPress?.();
    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/settings');
  },
);
