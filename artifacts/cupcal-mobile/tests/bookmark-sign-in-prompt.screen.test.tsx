import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Platform } from 'react-native';
import { sampleEvents } from '../data/events';
import { EventCard } from '../components/EventCard';
import CalendarScreen from '../app/(tabs)/index';
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
jest.mock('@/components/MonthCalendar', () => {
  const React = require('react');
  const ReactNative = require('react-native');
  return {
    MonthCalendar: ({ events }: { events: { title: string }[] }) =>
      React.createElement(ReactNative.View, {
        testID: 'month-calendar-events',
        accessibilityLabel: events.map(({ title }) => title).join(', '),
      }),
  };
});

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

function setAuthPending() {
  mockContext.current = {
    authReady: false,
    isAuthenticated: false,
    events: [event],
    bookmarkedIds: [],
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

    expect(bookmarkButton.props.accessibilityLabel).toBe(`${event.title}, Zum Speichern anmelden`);
    expect(bookmarkButton.props.accessibilityState).toMatchObject({
      disabled: false,
      busy: false,
      selected: false,
    });
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
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/settings',
      params: { focusAccount: 'true' },
    });
    expect(onBookmarkToggle).not.toHaveBeenCalled();

    setAuthState(true);
    await view.rerender(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe(`${event.title}, In Merkliste speichern`);

    await fireEvent.press(view.getByTestId(`bookmark-${event.id}`));
    expect(onBookmarkToggle).toHaveBeenCalledWith(event.id);

    await view.rerender(
      <EventCard event={event} isBookmarked onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe(`${event.title}, Aus Merkliste entfernen`);
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityState.selected).toBe(true);

    setAuthState(false);
    await view.rerender(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe(`${event.title}, Zum Speichern anmelden`);

    alertSpy.mockClear();
    const bookmarkCallsBeforePending = onBookmarkToggle.mock.calls.length;
    setAuthPending();
    await view.rerender(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={onBookmarkToggle} />,
    );
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityLabel)
      .toBe(`${event.title}, Anmeldung wird geprüft`);
    expect(view.getByTestId(`bookmark-${event.id}`).props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    await fireEvent.press(view.getByTestId(`bookmark-${event.id}`));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onBookmarkToggle).toHaveBeenCalledTimes(bookmarkCallsBeforePending);
  },
);

test('zeigt Reload-Serie und Zero-Build-Regelwerk getrennt auf der Kalenderkarte', async () => {
  const reloadZeroBuildEvent = {
    ...event,
    gameMode: 'Reload' as const,
    gameRuleset: 'Zero Build' as const,
    tournamentSeries: 'Reload' as const,
  };
  const view = await render(
    <EventCard event={reloadZeroBuildEvent} isBookmarked={false} onBookmarkToggle={() => undefined} />,
  );

  expect(view.getByText('Zero Build')).toBeTruthy();
  expect(view.getByText('Reload')).toBeTruthy();
  expect(view.getByText('Zero Build').props.accessibilityLabel).toBe('Turnierregelwerk: Zero Build');
  expect(view.getByText('Reload').props.accessibilityLabel).toBe('Turnierserie: Reload');
});

test.each([
  ['Reload', 'Reload Liga', 'Reload Turnier', 'Zero-Build-Liga'],
  ['Zero Build', 'Zero-Build-Liga', 'Reload Liga', 'Reload Turnier'],
] as const)(
  'kombiniert die Terminart Liga mit %s in Monat und Tagesliste und setzt Filter zurück',
  async (feature, expectedTitle, excludedTitle, otherFeatureTitle) => {
    const today = new Date();
    const makeEvent = (
      id: string,
      title: string,
      category: 'Turnier' | 'Liga',
      gameMode: 'Battle Royale' | 'Zero Build' | 'Reload',
      gameRuleset: 'Battle Royale' | 'Zero Build',
      tournamentSeries: 'Reload' | null,
    ) => ({
      ...event,
      id,
      title,
      category,
      gameMode,
      gameRuleset,
      tournamentSeries,
      startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(),
      endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14).toISOString(),
    });
    const matchingEvents = [
      makeEvent('reload-league', 'Reload Liga', 'Liga', 'Reload', 'Battle Royale', 'Reload'),
      makeEvent('reload-tournament', 'Reload Turnier', 'Turnier', 'Reload', 'Battle Royale', 'Reload'),
      makeEvent('zero-build-league', 'Zero-Build-Liga', 'Liga', 'Battle Royale', 'Zero Build', null),
      makeEvent('other-tournament', 'Battle-Royale-Turnier', 'Turnier', 'Battle Royale', 'Battle Royale', null),
    ];
    mockContext.current = {
      authReady: true,
      isAuthenticated: false,
      events: matchingEvents,
      bookmarkedIds: [],
      toggleBookmark: mockToggleBookmark,
    };
    const view = await render(<CalendarScreen />);

    await fireEvent.press(view.getByTestId('calendar-filter'));
    await fireEvent.press(view.getByTestId('calendar-filter-category-Liga'));
    await fireEvent.press(view.getByTestId(`calendar-filter-feature-${feature}`));

    expect(view.getByText(expectedTitle)).toBeTruthy();
    expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(expectedTitle);
    expect(view.queryByText(excludedTitle)).toBeNull();
    expect(view.queryByText(otherFeatureTitle)).toBeNull();
    expect(view.queryByText('Battle-Royale-Turnier')).toBeNull();
    expect(view.getByText(new RegExp(`· 1 Termin$`))).toBeTruthy();
    expect(view.getByTestId('calendar-filter').props.accessibilityLabel).toBe(`Filter, Liga · ${feature}`);

    await fireEvent.press(view.getByTestId('calendar-filter-reset'));

    expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(
      'Reload Liga, Reload Turnier, Zero-Build-Liga, Battle-Royale-Turnier',
    );
    expect(view.getByText('Reload Liga')).toBeTruthy();
    expect(view.getByText('Reload Turnier')).toBeTruthy();
    expect(view.getByText('Zero-Build-Liga')).toBeTruthy();
    expect(view.getByText('Battle-Royale-Turnier')).toBeTruthy();
    expect(view.getByText(new RegExp(`· 4 Termine$`))).toBeTruthy();
    expect(view.getByTestId('calendar-filter').props.accessibilityLabel).toBe('Filter, Alle Termine');
  },
);

test('zeigt Regelwerk und Turnierserie getrennt in den Turnierdetails', async () => {
  const reloadZeroBuildEvent = {
    ...event,
    gameMode: 'Reload' as const,
    gameRuleset: 'Zero Build' as const,
    tournamentSeries: 'Reload' as const,
  };
  mockContext.current = {
    authReady: true,
    isAuthenticated: false,
    events: [reloadZeroBuildEvent],
    bookmarkedIds: [],
    toggleBookmark: mockToggleBookmark,
  };

  const view = await render(<EventDetailsScreen />);

  expect(view.getByText('REGELWERK')).toBeTruthy();
  expect(view.getByText('SERIE')).toBeTruthy();
  expect(view.getByText('Zero Build')).toBeTruthy();
  expect(view.getByText('Reload')).toBeTruthy();
});

test.each(['android', 'ios'] as const)(
  'Turnierdetails behalten Gäste auf der Ansicht und erlauben Speichern nach Anmeldung auf %s',
  async (platform) => {
    setPlatformOS(platform);
    const view = await render(<EventDetailsScreen />);
    expect(view.getByTestId('event-detail-bookmark')).toBeTruthy();
    expect(view.getByTestId('event-detail-bookmark').props.accessibilityLabel)
      .toBe(`${event.title}, Zum Speichern anmelden`);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe(`${event.title}, Zum Speichern anmelden`);

    await fireEvent.press(view.getByTestId('event-save-button'));
    getDialogButtons().find((button) => button.text === 'Später')?.onPress?.();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(view.getByText('FNCS Challenger Cup')).toBeTruthy();

    await fireEvent.press(view.getByTestId('event-save-button'));
    getDialogButtons().find((button) => button.text === 'Anmelden')?.onPress?.();
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/settings',
      params: { focusAccount: 'true' },
    });
    expect(view.getByText('FNCS Challenger Cup')).toBeTruthy();

    setAuthState(true);
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe(`${event.title}, In Merkliste speichern`);
    expect(view.getByTestId('event-detail-bookmark').props.accessibilityLabel)
      .toBe(`${event.title}, In Merkliste speichern`);
    await fireEvent.press(view.getByTestId('event-save-button'));
    expect(mockToggleBookmark).toHaveBeenCalledWith(event.id);

    setAuthState(true, [event.id]);
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe(`${event.title}, Aus Merkliste entfernen`);
    expect(view.getByTestId('event-save-button').props.accessibilityState.selected).toBe(true);
    expect(view.getByText('In deiner Merkliste')).toBeTruthy();

    setAuthState(false, [event.id]);
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe(`${event.title}, Zum Speichern anmelden`);
    expect(view.getByTestId('event-detail-bookmark').props.accessibilityState.selected).toBe(false);
    expect(view.queryByText('In deiner Merkliste')).toBeNull();

    alertSpy.mockClear();
    const toggleCallsBeforePending = mockToggleBookmark.mock.calls.length;
    setAuthPending();
    await view.rerender(<EventDetailsScreen />);
    expect(view.getByTestId('event-detail-bookmark').props.accessibilityLabel)
      .toBe(`${event.title}, Anmeldung wird geprüft`);
    expect(view.getByTestId('event-save-button').props.accessibilityLabel)
      .toBe(`${event.title}, Anmeldung wird geprüft`);
    expect(view.getByTestId('event-save-button').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    expect(view.getByTestId('event-detail-bookmark').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    expect(view.getByText('Anmeldung wird geprüft')).toBeTruthy();
    await fireEvent.press(view.getByTestId('event-save-button'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockToggleBookmark).toHaveBeenCalledTimes(toggleCallsBeforePending);
  },
);

test.each(['android', 'ios'] as const)(
  'Anmeldedialog ordnet Später und Anmelden unter %s dem richtigen Verhalten zu',
  (platform) => {
    setPlatformOS(platform);
    const restoreFocus = jest.fn();
    jest.useFakeTimers();
    promptAccountSignIn(event.title, restoreFocus);
    expect(alertSpy).toHaveBeenCalledWith(
      'Anmeldung erforderlich',
      `Melde dich an, um „${event.title}“ in deiner persönlichen Merkliste zu speichern.`,
      expect.any(Array),
    );
    const buttons = getDialogButtons();

    expect(buttons.map((button) => button.text)).toEqual(['Später', 'Anmelden']);
    buttons[0]?.onPress?.();
    expect(restoreFocus).not.toHaveBeenCalled();
    jest.advanceTimersByTime(250);
    expect(restoreFocus).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    buttons[1]?.onPress?.();
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/settings',
      params: { focusAccount: 'true' },
    });
    jest.useRealTimers();
  },
);

test.each(['android', 'ios'] as const)(
  '„Später“ gibt den Screenreader-Fokus zur Merkliste der Turnierkarte zurück auf %s',
  async (platform) => {
    setPlatformOS(platform);
    jest.useFakeTimers();
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {});
    const view = await render(
      <EventCard event={event} isBookmarked={false} onBookmarkToggle={() => undefined} />,
    );

    await fireEvent.press(view.getByTestId(`bookmark-${event.id}`));
    getDialogButtons().find((button) => button.text === 'Später')?.onPress?.();
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(focusSpy).toHaveBeenCalledWith(expect.anything(), 'focus');
    focusSpy.mockRestore();
    jest.useRealTimers();
  },
);

test.each(['android', 'ios'] as const)(
  '„Später“ gibt den Screenreader-Fokus zum Speichern-Element der Turnierdetails zurück auf %s',
  async (platform) => {
    setPlatformOS(platform);
    jest.useFakeTimers();
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {});
    const view = await render(<EventDetailsScreen />);

    await fireEvent.press(view.getByTestId('event-save-button'));
    getDialogButtons().find((button) => button.text === 'Später')?.onPress?.();
    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(focusSpy).toHaveBeenCalledWith(expect.anything(), 'focus');
    focusSpy.mockRestore();
    jest.useRealTimers();
  },
);
