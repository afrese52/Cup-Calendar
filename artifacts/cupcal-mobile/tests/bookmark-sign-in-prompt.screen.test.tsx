import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Dimensions, Platform, StyleSheet } from 'react-native';
import { matchesEventFilter, sampleEvents, toLocalDateKey, type TournamentEvent } from '../data/events';
import { EventCard } from '../components/EventCard';
import CalendarScreen from '../app/(tabs)/index';
import SavedScreen from '../app/(tabs)/saved';
import EventDetailsScreen from '../app/event/[id]';
import { promptAccountSignIn } from '../services/accountSignInPrompt';

const mockContext: { current: Record<string, any> } = { current: {} };

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('../services/calendarRegionPreference', () => ({
  loadCalendarRegionPreference: jest.fn(async () => null),
  saveCalendarRegionPreference: jest.fn(async () => undefined),
}));
jest.mock('../services/deviceRegion', () => ({
  resolveDeviceRegion: jest.fn(async () => ({
    status: 'permission-required',
    permission: {
      granted: false,
      status: 'denied',
      canAskAgain: true,
      expires: 'never',
    },
  })),
}));
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
    categoryTournament: '#9c0',
    categoryLeague: '#09c',
    categoryQualification: '#c90',
    categoryTraining: '#90c',
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
const mockRegionPreference = jest.requireMock('../services/calendarRegionPreference') as {
  loadCalendarRegionPreference: jest.Mock;
  saveCalendarRegionPreference: jest.Mock;
};
const mockDeviceRegion = jest.requireMock('../services/deviceRegion') as {
  resolveDeviceRegion: jest.Mock;
};
const event = sampleEvents[0]!;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
const defaultWindowDimensions = Dimensions.get('window');
const defaultScreenDimensions = Dimensions.get('screen');
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

function makeLegacyEvent(gameMode: TournamentEvent['gameMode']): TournamentEvent {
  const legacyEvent: TournamentEvent = { ...event, gameMode };
  delete legacyEvent.gameRuleset;
  delete legacyEvent.tournamentSeries;
  return legacyEvent;
}

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
    storageError: null,
    isReady: true,
    bookmarkSyncError: null,
    bookmarkSyncStatus: 'local',
    clearBookmarks: jest.fn(async () => undefined),
    retryBookmarkSync: jest.fn(async () => undefined),
    retryLocalBookmarkLoad: jest.fn(async () => undefined),
    canRetryLocalBookmarkLoad: false,
    isRetryingLocalBookmarkLoad: false,
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
  mockRegionPreference.loadCalendarRegionPreference.mockReset().mockResolvedValue(null as never);
  mockRegionPreference.saveCalendarRegionPreference.mockReset().mockResolvedValue(undefined as never);
  mockDeviceRegion.resolveDeviceRegion.mockReset().mockResolvedValue({
    status: 'permission-required',
    permission: {
      granted: false,
      status: 'denied',
      canAskAgain: true,
      expires: 'never',
    },
  } as never);
  alertSpy.mockClear();
});

afterEach(() => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
  }
  Dimensions.set({
    window: defaultWindowDimensions,
    screen: defaultScreenDimensions,
  });
});

test('zeigt im Kalender keinen Hinweis auf manuellen Import', async () => {
  const view = await render(<CalendarScreen />);

  expect(view.queryByText('MANUELLER IMPORT')).toBeNull();
  expect(view.getByText('CUPCAL')).toBeTruthy();
});

test('zeigt den nativen Favoritenspeicherfehler im Kalender', async () => {
  setAuthState(true);
  mockContext.current.storageError = 'Favoriten konnten nicht geladen werden.';

  const view = await render(<CalendarScreen />);

  expect(view.getByText('Favoriten konnten nicht geladen werden.')).toBeTruthy();
});

test('zeigt den nativen Favoritenspeicherfehler in der Merkliste', async () => {
  setAuthState(true, [event.id]);
  mockContext.current.storageError =
    'Favorit konnte nicht gespeichert werden. Bitte versuche es erneut.';

  const view = await render(<SavedScreen />);

  expect(
    view.getByText('Favorit konnte nicht gespeichert werden. Bitte versuche es erneut.'),
  ).toBeTruthy();
});

test('zeigt die Wochenleiste standardmäßig und öffnet den Monatskalender auf Wunsch', async () => {
  const today = new Date();
  const view = await render(<CalendarScreen />);
  const todayButton = view.getByTestId(`calendar-week-day-${toLocalDateKey(today)}`);

  expect(todayButton.props.accessibilityState.selected).toBe(true);
  expect(view.queryByTestId('month-calendar-events')).toBeNull();

  await fireEvent.press(view.getByTestId('month-calendar-toggle'));

  expect(view.getByTestId('month-calendar-events')).toBeTruthy();
  expect(view.getByTestId('month-calendar-toggle').props.accessibilityState.expanded).toBe(true);
});

test('zeigt farbige Terminmarker in der Wochenleiste und aktualisiert die Tagesagenda', async () => {
  const today = new Date();
  const nextDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const todayEvent: TournamentEvent = {
    ...event,
    id: 'today-tournament',
    title: 'Heutiges Turnier',
    category: 'Turnier',
    startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(),
    endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14).toISOString(),
  };
  const nextDayEvent: TournamentEvent = {
    ...event,
    id: 'next-day-league',
    title: 'Liga morgen',
    category: 'Liga',
    startTime: nextDay.toISOString(),
    endTime: new Date(nextDay.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
  mockContext.current = {
    authReady: true,
    isAuthenticated: false,
    events: [todayEvent, nextDayEvent],
    bookmarkedIds: [],
    toggleBookmark: mockToggleBookmark,
  };
  const view = await render(<CalendarScreen />);

  expect(view.getByTestId(`calendar-week-marker-${toLocalDateKey(today)}-Turnier`)).toBeTruthy();
  expect(view.getByText('Heutiges Turnier')).toBeTruthy();

  await fireEvent.press(view.getByTestId(`calendar-week-day-${toLocalDateKey(nextDay)}`));

  expect(view.getByText('Liga morgen')).toBeTruthy();
  expect(view.getByText('1 Termin')).toBeTruthy();
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

test.each(['android', 'ios'] as const)(
  'Kalenderfilter haben auf %s verständliche Screenreader-Bezeichnungen und Zustände',
  async (platform) => {
    setPlatformOS(platform);
    const view = await render(<CalendarScreen />);
    const filter = view.getByTestId('calendar-filter');

    expect(filter.props.accessibilityLabel).toBe(
      'Kalenderfilter. Alle Terminarten, Spielmerkmale und Regionen',
    );
    expect(filter.props.accessibilityState).toEqual({ expanded: false });

    await fireEvent.press(filter);

    expect(view.getByText('TERMINART').props.accessibilityRole).toBe('header');
    expect(view.getByText('SPIELMERKMAL').props.accessibilityRole).toBe('header');
    expect(view.getByText('REGION').props.accessibilityRole).toBe('header');
    expect(view.getByTestId('calendar-filter-category-Alle Termine').props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Terminart: Alle Termine',
      accessibilityState: { selected: true },
    });
    expect(view.getByTestId('calendar-filter-feature-Alle Spielmerkmale').props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Spielmerkmal: Alle Spielmerkmale',
      accessibilityState: { selected: true },
    });
    expect(view.getByTestId('calendar-filter-region-Alle Regionen').props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Region: Alle Regionen',
      accessibilityState: { selected: true },
    });
    expect(view.getByTestId('calendar-filter-reset').props).toMatchObject({
      accessibilityLabel: 'Filter zurücksetzen',
      accessibilityState: { disabled: true },
    });

    await fireEvent.press(view.getByTestId('calendar-filter-category-Liga'));
    expect(view.getByTestId('calendar-filter-category-Liga').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('calendar-filter-category-Alle Termine').props.accessibilityState.selected).toBe(false);

    await fireEvent.press(view.getByTestId('calendar-filter-category-Turnier'));
    expect(view.getByTestId('calendar-filter-category-Turnier').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('calendar-filter-category-Liga').props.accessibilityState.selected).toBe(false);

    await fireEvent.press(view.getByTestId('calendar-filter-feature-Reload'));
    const resetButton = view.getByTestId('calendar-filter-reset');
    expect(resetButton.props.accessibilityState.disabled).toBe(false);
    expect(view.getByTestId('calendar-filter').props.accessibilityLabel).toBe(
      'Kalenderfilter. Terminart: Turnier, Spielmerkmal: Reload',
    );

    await fireEvent.press(resetButton);

    expect(view.getByTestId('calendar-filter-category-Alle Termine').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('calendar-filter-feature-Alle Spielmerkmale').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('calendar-filter-reset').props.accessibilityState.disabled).toBe(true);
    expect(view.getByTestId('calendar-filter').props.accessibilityLabel).toBe(
      'Kalenderfilter. Alle Terminarten, Spielmerkmale und Regionen',
    );
    expect(view.getByTestId('calendar-filter').props.accessibilityState.expanded).toBe(true);
  },
);

test('setzt die Gerätestandort-Region automatisch und lässt globale Turniere sichtbar', async () => {
  const today = new Date();
  const makeRegionEvent = (
    base: TournamentEvent,
    id: string,
    title: string,
    region: TournamentEvent['region'],
  ): TournamentEvent => ({
    ...base,
    id,
    title,
    region,
    startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(),
    endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14).toISOString(),
  });
  mockContext.current.events = [
    makeRegionEvent(event, 'event-eu', 'EU-Turnier', 'EU'),
    makeRegionEvent(event, 'event-nae', 'NAE-Turnier', 'NAE'),
    makeRegionEvent(event, 'event-global', 'Globales Turnier', 'GLOBAL'),
  ];
  mockDeviceRegion.resolveDeviceRegion.mockResolvedValue({
    status: 'ready',
    region: 'EU',
    permission: {
      granted: true,
      status: 'granted',
      canAskAgain: true,
      expires: 'never',
    },
  } as never);

  const view = await render(<CalendarScreen />);
  await waitFor(() => expect(mockDeviceRegion.resolveDeviceRegion).toHaveBeenCalledWith('initial'));
  await fireEvent.press(view.getByTestId('month-calendar-toggle'));
  await fireEvent.press(view.getByTestId('calendar-filter'));

  expect(view.getByText('Automatisch ermittelt · EU')).toBeTruthy();
  expect(view.getByTestId('calendar-filter-region-EU').props.accessibilityState.selected).toBe(true);
  expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(
    'EU-Turnier, Globales Turnier',
  );

  await fireEvent.press(view.getByTestId('calendar-filter-region-NAE'));
  expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(
    'NAE-Turnier, Globales Turnier',
  );
  expect(mockRegionPreference.saveCalendarRegionPreference).toHaveBeenCalledWith({
    region: 'NAE',
    source: 'manual',
  });
});

test('lässt die Regionsauswahl bei fehlender Standortfreigabe manuell nutzbar', async () => {
  mockContext.current.events = [
    { ...event, id: 'event-eu', title: 'EU-Turnier', region: 'EU' },
    { ...event, id: 'event-nae', title: 'NAE-Turnier', region: 'NAE' },
    { ...event, id: 'event-global', title: 'Globales Turnier', region: 'GLOBAL' },
  ];

  const view = await render(<CalendarScreen />);
  await fireEvent.press(view.getByTestId('month-calendar-toggle'));
  await fireEvent.press(view.getByTestId('calendar-filter'));
  await waitFor(() => expect(view.getByText(/Standortfreigabe fehlt/)).toBeTruthy());
  await fireEvent.press(view.getByTestId('calendar-filter-region-NAE'));

  expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(
    'NAE-Turnier, Globales Turnier',
  );
});

test('zeigt globale Termine in regionalen Ansichten, filtert GLOBAL aber gezielt', () => {
  const euEvent = { ...event, region: 'EU' as const };
  const naeEvent = { ...event, region: 'NAE' as const };
  const globalEvent = { ...event, region: 'GLOBAL' as const };

  expect(matchesEventFilter(euEvent, 'Alle Termine', 'Alle Spielmerkmale', 'EU')).toBe(true);
  expect(matchesEventFilter(globalEvent, 'Alle Termine', 'Alle Spielmerkmale', 'EU')).toBe(true);
  expect(matchesEventFilter(naeEvent, 'Alle Termine', 'Alle Spielmerkmale', 'EU')).toBe(false);
  expect(matchesEventFilter(globalEvent, 'Alle Termine', 'Alle Spielmerkmale', 'GLOBAL')).toBe(true);
  expect(matchesEventFilter(euEvent, 'Alle Termine', 'Alle Spielmerkmale', 'GLOBAL')).toBe(false);
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
    await fireEvent.press(view.getByTestId('month-calendar-toggle'));

    await fireEvent.press(view.getByTestId('calendar-filter'));
    await fireEvent.press(view.getByTestId('calendar-filter-category-Liga'));
    await fireEvent.press(view.getByTestId(`calendar-filter-feature-${feature}`));

    expect(view.getByText(expectedTitle)).toBeTruthy();
    expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(expectedTitle);
    expect(view.queryByText(excludedTitle)).toBeNull();
    expect(view.queryByText(otherFeatureTitle)).toBeNull();
    expect(view.queryByText('Battle-Royale-Turnier')).toBeNull();
    expect(view.getByText(new RegExp(`· 1 Termin$`))).toBeTruthy();
    expect(view.getByTestId('calendar-filter').props.accessibilityLabel).toBe(
      `Kalenderfilter. Terminart: Liga, Spielmerkmal: ${feature}`,
    );

    await fireEvent.press(view.getByTestId('calendar-filter-reset'));

    expect(view.getByTestId('month-calendar-events').props.accessibilityLabel).toBe(
      'Reload Liga, Reload Turnier, Zero-Build-Liga, Battle-Royale-Turnier',
    );
    expect(view.getByText('Reload Liga')).toBeTruthy();
    expect(view.getByText('Reload Turnier')).toBeTruthy();
    expect(view.getByText('Zero-Build-Liga')).toBeTruthy();
    expect(view.getByText('Battle-Royale-Turnier')).toBeTruthy();
    expect(view.getByText(new RegExp(`· 4 Termine$`))).toBeTruthy();
    expect(view.getByTestId('calendar-filter').props.accessibilityLabel).toBe(
      'Kalenderfilter. Alle Terminarten, Spielmerkmale und Regionen',
    );
  },
);

test('zeigt ältere Reload- und Zero-Build-Termine mit den passenden Filtern', async () => {
  const today = new Date();
  const makeTodayEvent = (
    base: TournamentEvent,
    id: string,
    title: string,
  ): TournamentEvent => ({
    ...base,
    id,
    title,
    category: 'Liga',
    startTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(),
    endTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14).toISOString(),
  });
  const legacyReloadEvent = makeTodayEvent(
    makeLegacyEvent('Reload'),
    'legacy-reload',
    'Ältere Reload-Liga',
  );
  const legacyZeroBuildEvent = makeTodayEvent(
    makeLegacyEvent('Zero Build'),
    'legacy-zero-build',
    'Ältere Zero-Build-Liga',
  );
  const explicitBattleRoyaleRuleset = {
    ...makeTodayEvent(
      makeLegacyEvent('Zero Build'),
      'explicit-battle-royale',
      'Explizites Battle-Royale-Regelwerk',
    ),
    gameRuleset: 'Battle Royale' as const,
  };

  expect(matchesEventFilter(legacyReloadEvent, 'Alle Termine', 'Reload')).toBe(true);
  expect(matchesEventFilter(legacyReloadEvent, 'Alle Termine', 'Zero Build')).toBe(false);
  expect(matchesEventFilter(legacyZeroBuildEvent, 'Alle Termine', 'Zero Build')).toBe(true);
  expect(matchesEventFilter(explicitBattleRoyaleRuleset, 'Alle Termine', 'Zero Build')).toBe(false);

  mockContext.current = {
    authReady: true,
    isAuthenticated: false,
    events: [legacyReloadEvent, legacyZeroBuildEvent, explicitBattleRoyaleRuleset],
    bookmarkedIds: [],
    toggleBookmark: mockToggleBookmark,
  };
  const view = await render(<CalendarScreen />);

  await fireEvent.press(view.getByTestId('calendar-filter'));
  await fireEvent.press(view.getByTestId('calendar-filter-category-Liga'));
  await fireEvent.press(view.getByTestId('calendar-filter-feature-Reload'));
  expect(view.getByText('Ältere Reload-Liga')).toBeTruthy();
  expect(view.queryByText('Ältere Zero-Build-Liga')).toBeNull();
  expect(view.queryByText('Explizites Battle-Royale-Regelwerk')).toBeNull();

  await fireEvent.press(view.getByTestId('calendar-filter-reset'));
  await fireEvent.press(view.getByTestId('calendar-filter-feature-Zero Build'));
  expect(view.getByText('Ältere Zero-Build-Liga')).toBeTruthy();
  expect(view.queryByText('Ältere Reload-Liga')).toBeNull();
  expect(view.queryByText('Explizites Battle-Royale-Regelwerk')).toBeNull();
});

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
  'hält Turnierdetails und Speichern bei großer Schrift auf kleinem %s-Bildschirm erreichbar',
  async (platform) => {
    setPlatformOS(platform);
    const compactDimensions = { width: 320, height: 480, scale: 1, fontScale: 2 };
    Dimensions.set({
      window: compactDimensions,
      screen: compactDimensions,
    });
    const largeTextEvent: TournamentEvent = {
      ...event,
      title: 'FNCS Challenger Cup – Europäische Meisterschaft in mehreren Runden',
      description:
        'Teilnahmeberechtigte Teams spielen über mehrere Runden um die Qualifikation. Alle Ergebnisse und Hinweise zu den Spielzeiten bleiben in dieser ausführlichen Beschreibung enthalten.',
      teamFormat: 'Duos',
      gameRuleset: 'Zero Build',
      tournamentSeries: 'Reload',
    };
    setAuthState(true);
    mockContext.current.events = [largeTextEvent];

    const view = await render(<EventDetailsScreen />);
    const scrollView = view.getByTestId('event-details-scroll-view');
    const contentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);
    const title = view.getByText(largeTextEvent.title);
    const description = view.getByText(largeTextEvent.description);
    const format = view.getByText(largeTextEvent.teamFormat);
    const ruleset = view.getByText(largeTextEvent.gameRuleset!);
    const series = view.getByText(largeTextEvent.tournamentSeries!);
    const saveButton = view.getByTestId('event-save-button');
    const saveText = view.getByText('In Merkliste speichern');

    expect(scrollView.props.scrollEnabled).toBe(true);
    expect(StyleSheet.flatten(scrollView.props.style).flex).toBe(1);
    expect(contentStyle.paddingBottom).toBeGreaterThan(0);
    for (const text of [title, description, format, ruleset, series, saveText]) {
      expect(text.props.allowFontScaling).toBe(true);
      expect(text.props.numberOfLines).toBeUndefined();
    }
    expect(saveButton.props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: `${largeTextEvent.title}, In Merkliste speichern`,
      accessibilityState: { disabled: false },
    });
    expect(StyleSheet.flatten(saveText.props.style)).toMatchObject({
      flexShrink: 1,
      textAlign: 'center',
    });

    await fireEvent.press(saveButton);
    expect(mockToggleBookmark).toHaveBeenCalledWith(largeTextEvent.id);
  },
);

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
