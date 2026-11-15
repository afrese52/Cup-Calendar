import React from 'react';
import { afterAll, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import AdminImportScreen from '../app/admin/import';

const mockGetDocumentAsync = jest.fn<(...args: any[]) => Promise<any>>();
const mockReadFile = jest.fn<(...args: any[]) => Promise<string>>();
const mockPreviewImport = jest.fn<(...args: any[]) => Promise<any>>();
const mockImportSchedule = jest.fn<(...args: any[]) => Promise<any>>();
const mockImportHistory = jest.fn<() => any>();
let mockNativeFileSize: number | null = null;
const originalPlatformOS = Platform.OS;

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: any[]) => mockGetDocumentAsync(...args),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((...args: any[]) => {
    const uri = args[0] as string;
    return {
      get size() {
        return mockNativeFileSize;
      },
      text: () => mockReadFile(uri),
    };
  }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@workspace/api-client-react', () => ({
  getGetEventsQueryKey: () => ['events'],
  useGetAdminImportAccess: () => ({
    data: { authorized: true },
    isLoading: false,
    isError: false,
  }),
  getGetAdminImportHistoryQueryKey: () => ['admin-import-history'],
  useGetAdminImportHistory: () => mockImportHistory(),
  usePreviewMhtImport: () => ({ mutateAsync: mockPreviewImport, isPending: false }),
  useImportMhtSchedule: () => ({ mutateAsync: mockImportSchedule, isPending: false }),
}));
jest.mock('@/services/accountAuth', () => ({
  watchAuthSession: (_auth: unknown, callbacks: {
    onSession: (session: { access_token: string }) => void;
    onReady: () => void;
  }) => {
    callbacks.onSession({ access_token: 'test-token' });
    callbacks.onReady();
    return () => {};
  },
}));
jest.mock('@/services/supabase', () => ({ supabase: { auth: {} } }));
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
    card: '#fff',
    border: '#ddd',
    input: '#fff',
    categoryLeague: '#90c',
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const preview = {
  importableCount: 0,
  newCount: 0,
  updateCount: 0,
  warningCount: 0,
  invalidCount: 0,
  events: [],
  issues: [],
  region: 'EU',
  snapshotAt: null,
  snapshotAgeMs: null,
  isSnapshotStale: false,
  timeZone: 'Europe/Berlin',
  startDate: '2026-11-12',
  endDate: '2026-11-12',
  outOfRangeCount: 0,
  sourceUrl: null,
};

function selectedFile(name: string, size = 128) {
  return {
    canceled: false,
    assets: [{
      name,
      size,
      uri: 'content://com.android.providers.downloads.documents/document/msf%3A123456',
    }],
  };
}

function selectedWebFile(name: string, size = 128) {
  return {
    canceled: false,
    assets: [{
      name,
      size,
      uri: 'blob:test-file',
      file: {
        size,
        text: async () => 'MIME-Version: 1.0\n',
      },
    }],
  };
}

function selectedFileWithoutSize(name: string) {
  return {
    canceled: false,
    assets: [{
      name,
      uri: 'content://com.android.providers.downloads.documents/document/msf%3A123456',
    }],
  };
}

function setPlatformOS(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

async function openImportScreen() {
  const screen = await render(<AdminImportScreen />);
  await waitFor(() => expect(screen.getByText('Spielplan-Datei')).toBeTruthy());
  return screen;
}

beforeEach(() => {
  setPlatformOS('android');
  mockNativeFileSize = null;
  mockGetDocumentAsync.mockReset();
  mockReadFile.mockReset().mockResolvedValue('MIME-Version: 1.0\n');
  mockPreviewImport.mockReset().mockResolvedValue(preview);
  mockImportSchedule.mockReset();
  mockImportHistory.mockReset().mockReturnValue({
    data: { entries: [] },
    isLoading: false,
    isError: false,
  });
});

afterAll(() => setPlatformOS(originalPlatformOS));

test.each(['plan.mht', 'plan.mhtml'])('liest %s ein und zeigt die Vorschau', async (name) => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile(name));
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  expect(await screen.findByText(name)).toBeTruthy();
  expect(mockGetDocumentAsync).toHaveBeenCalledWith({
    type: '*/*',
    copyToCacheDirectory: false,
    multiple: false,
  });
  expect(mockReadFile).toHaveBeenCalledWith(
    'content://com.android.providers.downloads.documents/document/msf%3A123456',
  );
  expect(screen.getByText('maximal 25 MB', { exact: false })).toBeTruthy();

  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await waitFor(() => expect(mockPreviewImport).toHaveBeenCalledWith({
    data: 'MIME-Version: 1.0\n',
    params: undefined,
  }));
  expect(await screen.findByText('Prüfergebnis')).toBeTruthy();
  expect(screen.getByTestId('import-start-date').props.value).toBe('12.11.2026');
  expect(screen.getByTestId('import-end-date').props.value).toBe('12.11.2026');
});

test('wendet den gewählten Datumsbereich auf Vorschau, Bestätigung und Import an', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockImplementation(async ({ params }: { params?: { startDate?: string; endDate?: string } }) => ({
    ...preview,
    importableCount: 1,
    outOfRangeCount: params ? 4 : 0,
    startDate: params?.startDate ?? preview.startDate,
    endDate: params?.endDate ?? preview.endDate,
  }));
  mockImportSchedule.mockResolvedValue({
    importedCount: 1,
    insertedCount: 1,
    updatedCount: 0,
    skippedWarningCount: 0,
    skippedPastCount: 0,
    skippedInvalidCount: 0,
    skippedCount: 0,
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
    expect(message).toContain('15.11.2026 bis 15.11.2026');
    expect(message).toContain('4 Termine außerhalb der Spanne bleiben unverändert.');
    buttons?.find((button) => button.text === 'Importieren')?.onPress?.();
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await fireEvent.changeText(screen.getByTestId('import-start-date'), '15.11.2026');
  await fireEvent.changeText(screen.getByTestId('import-end-date'), '15.11.2026');
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await waitFor(() => expect(mockPreviewImport).toHaveBeenLastCalledWith({
    data: 'MIME-Version: 1.0\n',
    params: { startDate: '2026-11-15', endDate: '2026-11-15' },
  }));
  await fireEvent.press(screen.getByTestId('confirm-import-button'));

  await waitFor(() => expect(mockImportSchedule).toHaveBeenCalledWith({
    data: 'MIME-Version: 1.0\n',
    params: {
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      confirmStaleSnapshot: false,
    },
  }));
  expect(mockPreviewImport).toHaveBeenCalledWith({
    data: 'MIME-Version: 1.0\n',
    params: { startDate: '2026-11-15', endDate: '2026-11-15' },
  });
  alertSpy.mockRestore();
});

test('bricht bei fehlgeschlagener Vorschau vor der Bestätigung ab und erlaubt eine neue Dateiauswahl', async () => {
  mockGetDocumentAsync
    .mockResolvedValueOnce(selectedFile('plan.mht'))
    .mockResolvedValueOnce(selectedFile('neuer-plan.mht'));
  mockPreviewImport
    .mockResolvedValueOnce({ ...preview, importableCount: 1 })
    .mockRejectedValueOnce(new Error('temporärer Vorschaufehler'));
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await fireEvent.press(await screen.findByTestId('confirm-import-button'));

  expect(await screen.findByText(
    'Die Vorschau konnte vor der Bestätigung nicht aktualisiert werden. Bitte prüfe deine Verbindung und versuche es erneut.',
  )).toBeTruthy();
  expect(mockPreviewImport).toHaveBeenCalledTimes(2);
  expect(mockImportSchedule).not.toHaveBeenCalled();
  expect(screen.getByTestId('choose-import-file-button').props.accessibilityState.disabled).not.toBe(true);

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  expect(await screen.findByText('neuer-plan.mht')).toBeTruthy();
  expect(mockGetDocumentAsync).toHaveBeenCalledTimes(2);
});

test('zeigt Titel, Eventkennung und Prüfgrund für nicht importierte Karten', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    issues: [{
      id: 'epic:solo-cash-cup:round-1',
      title: 'Solo Cash Cup',
      errors: ['Turnierart fehlt oder ist nicht eindeutig angegeben.'],
    }],
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));

  expect(await screen.findByText('Solo Cash Cup')).toBeTruthy();
  expect(screen.getByTestId('import-issue-id-0').props.children).toContain('epic:solo-cash-cup:round-1');
  expect(screen.getByText('Prüfgrund: Turnierart fehlt oder ist nicht eindeutig angegeben.')).toBeTruthy();
});

test('zeigt das Alter und warnt vor einem mehr als 24 Stunden alten Snapshot', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    importableCount: 1,
    snapshotAt: '2026-11-11T10:00:00.000Z',
    snapshotAgeMs: 25 * 60 * 60 * 1000,
    isSnapshotStale: true,
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));

  expect(await screen.findByTestId('snapshot-age-warning')).toBeTruthy();
  expect(screen.getByText('Dieser Spielplan ist älter als 24 Stunden. Prüfe auf Fortnite eine aktuelle Version und lade sie erneut, bevor du speicherst.')).toBeTruthy();
  expect(screen.getByText('vor 1 Tag und 1 Stunde', { exact: false })).toBeTruthy();

  await fireEvent.press(screen.getByTestId('confirm-import-button'));
  expect(alertSpy).toHaveBeenCalledWith(
    'Veralteten Spielplan importieren?',
    expect.stringContaining('Achtung: Der Snapshot ist inzwischen älter als 24 Stunden.'),
    expect.any(Array),
  );
  alertSpy.mockRestore();
});

test('aktualisiert eine zunächst frische Vorschau und verlangt Bestätigung, wenn sie inzwischen veraltet ist', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  const freshPreview = {
    ...preview,
    importableCount: 1,
    snapshotAt: '2026-11-12T12:00:00.000Z',
    snapshotAgeMs: 23 * 60 * 60 * 1000,
    isSnapshotStale: false,
  };
  const stalePreview = {
    ...freshPreview,
    snapshotAgeMs: 24 * 60 * 60 * 1000 + 1,
    isSnapshotStale: true,
  };
  mockPreviewImport
    .mockResolvedValueOnce(freshPreview)
    .mockResolvedValueOnce(stalePreview)
    .mockResolvedValueOnce(stalePreview);
  mockImportSchedule.mockResolvedValue({
    importedCount: 1,
    insertedCount: 1,
    updatedCount: 0,
    skippedWarningCount: 0,
    skippedPastCount: 0,
    skippedInvalidCount: 0,
    skippedCount: 0,
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === 'Importieren')?.onPress?.();
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await fireEvent.press(await screen.findByTestId('confirm-import-button'));

  expect(alertSpy).toHaveBeenCalledWith(
    'Veralteten Spielplan importieren?',
    expect.stringContaining('Der Snapshot ist inzwischen älter als 24 Stunden.'),
    expect.any(Array),
  );
  await waitFor(() => expect(mockImportSchedule).toHaveBeenCalledWith({
    data: 'MIME-Version: 1.0\n',
    params: {
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      confirmStaleSnapshot: true,
    },
  }));
  expect(mockPreviewImport).toHaveBeenCalledTimes(3);
  alertSpy.mockRestore();
});

test('zeigt auf iOS die aktuelle Veraltung im nativen Dialog und übermittelt die Bestätigung', async () => {
  setPlatformOS('ios');
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  const freshPreview = {
    ...preview,
    importableCount: 1,
    snapshotAt: '2026-11-12T12:00:00.000Z',
    snapshotAgeMs: 23 * 60 * 60 * 1000,
    isSnapshotStale: false,
  };
  const stalePreview = {
    ...freshPreview,
    snapshotAt: '2026-11-11T10:00:00.000Z',
    snapshotAgeMs: 25 * 60 * 60 * 1000,
    isSnapshotStale: true,
  };
  mockPreviewImport.mockResolvedValueOnce(freshPreview).mockResolvedValue(stalePreview);
  mockImportSchedule.mockResolvedValue({
    importedCount: 1,
    insertedCount: 1,
    updatedCount: 0,
    skippedWarningCount: 0,
    skippedPastCount: 0,
    skippedInvalidCount: 0,
    skippedCount: 0,
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
    expect(message).toContain(
      'Achtung: Der Snapshot ist inzwischen älter als 24 Stunden. Prüfe eine aktuelle Datei oder bestätige ausdrücklich den Import dieser veralteten Vorschau.',
    );
    buttons?.find((button) => button.text === 'Importieren')?.onPress?.();
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await fireEvent.press(await screen.findByTestId('confirm-import-button'));

  expect(alertSpy).toHaveBeenCalledWith(
    'Veralteten Spielplan importieren?',
    expect.stringContaining('Achtung: Der Snapshot ist inzwischen älter als 24 Stunden.'),
    expect.any(Array),
  );
  await waitFor(() => expect(mockImportSchedule).toHaveBeenCalledWith({
    data: 'MIME-Version: 1.0\n',
    params: {
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      confirmStaleSnapshot: true,
    },
  }));
  alertSpy.mockRestore();
});

test('zeigt im Web dieselbe aktuelle Veraltungswarnung und übermittelt die Bestätigung', async () => {
  setPlatformOS('web');
  mockGetDocumentAsync.mockResolvedValue(selectedWebFile('plan.mht'));
  const freshPreview = {
    ...preview,
    importableCount: 1,
    snapshotAt: '2026-11-12T12:00:00.000Z',
    snapshotAgeMs: 23 * 60 * 60 * 1000,
    isSnapshotStale: false,
  };
  const stalePreview = {
    ...freshPreview,
    snapshotAt: '2026-11-11T10:00:00.000Z',
    snapshotAgeMs: 25 * 60 * 60 * 1000,
    isSnapshotStale: true,
  };
  mockPreviewImport.mockResolvedValueOnce(freshPreview).mockResolvedValue(stalePreview);
  mockImportSchedule.mockResolvedValue({
    importedCount: 1,
    insertedCount: 1,
    updatedCount: 0,
    skippedWarningCount: 0,
    skippedPastCount: 0,
    skippedInvalidCount: 0,
    skippedCount: 0,
  });
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const confirmSpy = jest.fn<(message: string) => boolean>().mockReturnValue(true);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { confirm: confirmSpy },
  });

  try {
    const screen = await openImportScreen();
    await fireEvent.press(screen.getByTestId('choose-import-file-button'));
    await fireEvent.press(screen.getByTestId('preview-import-file-button'));
    await fireEvent.press(await screen.findByTestId('confirm-import-button'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining(
      'Achtung: Der Snapshot ist inzwischen älter als 24 Stunden. Prüfe eine aktuelle Datei oder bestätige ausdrücklich den Import dieser veralteten Vorschau.',
    ));
    await waitFor(() => expect(mockImportSchedule).toHaveBeenCalledWith({
      data: 'MIME-Version: 1.0\n',
      params: {
        startDate: '2026-11-12',
        endDate: '2026-11-12',
        confirmStaleSnapshot: true,
      },
    }));
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('meldet ein unbekanntes Snapshot-Alter, ohne es als veraltet auszugeben', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    snapshotAt: null,
    snapshotAgeMs: null,
    isSnapshotStale: false,
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));

  expect(await screen.findByTestId('snapshot-age-warning')).toBeTruthy();
  expect(screen.getByText('Das Alter des Spielplans ist nicht bestimmbar. Prüfe die Datei vor dem Import.')).toBeTruthy();
  expect(screen.getByText('Alter nicht bestimmbar', { exact: false })).toBeTruthy();
});

test('zeigt geänderte Zeiten und Turnierdetails, aber keine Änderungen für neue oder gleiche Termine', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    importableCount: 3,
    newCount: 1,
    updateCount: 2,
    events: [
      {
        id: 'new-event',
        title: 'Neuer Termin',
        startTime: '2026-11-12T18:00:00.000Z',
        endTime: '2026-11-12T20:00:00.000Z',
        previousTitle: null,
        previousGameMode: null,
        previousTeamFormat: null,
        previousTournamentType: null,
        previousCategory: null,
        previousStartTime: null,
        previousEndTime: null,
        gameMode: 'Battle Royale',
        teamFormat: 'Solo',
        tournamentType: 'Cash Cup',
        category: 'Turnier',
        warnings: [],
        willUpdate: false,
      },
      {
        id: 'same-event',
        title: 'Unveränderter Termin',
        startTime: '2026-11-12T18:00:00.000Z',
        endTime: '2026-11-12T20:00:00.000Z',
        previousTitle: null,
        previousGameMode: null,
        previousTeamFormat: null,
        previousTournamentType: null,
        previousCategory: null,
        previousStartTime: null,
        previousEndTime: null,
        gameMode: 'Battle Royale',
        teamFormat: 'Solo',
        tournamentType: 'Cash Cup',
        category: 'Turnier',
        warnings: [],
        willUpdate: true,
      },
      {
        id: 'changed-event',
        title: 'Termin mit Zeitänderung',
        startTime: '2026-11-12T18:00:00.000Z',
        endTime: '2026-11-12T20:00:00.000Z',
        previousTitle: 'Alter Titel',
        previousGameMode: 'Reload',
        previousTeamFormat: 'Duos',
        previousTournamentType: 'FNCS',
        previousCategory: 'Liga',
        previousStartTime: '2026-11-12T17:00:00.000Z',
        previousEndTime: '2026-11-12T21:00:00.000Z',
        gameMode: 'Battle Royale',
        teamFormat: 'Solo',
        tournamentType: 'Cash Cup',
        category: 'Turnier',
        warnings: [],
        willUpdate: true,
      },
    ],
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));

  expect(await screen.findByTestId('event-time-changes-changed-event')).toBeTruthy();
  expect(screen.getByText(/Start 12\.11\.2026, 18:00 → 12\.11\.2026, 19:00/)).toBeTruthy();
  expect(screen.getByText(/Ende 12\.11\.2026, 22:00 → 12\.11\.2026, 21:00/)).toBeTruthy();
  expect(screen.queryByTestId('event-time-changes-new-event')).toBeNull();
  expect(screen.queryByTestId('event-time-changes-same-event')).toBeNull();
  expect(screen.getByTestId('event-detail-changes-changed-event')).toBeTruthy();
  expect(screen.getByText(/Titel „Alter Titel“ → „Termin mit Zeitänderung“/)).toBeTruthy();
  expect(screen.getByText(/Spielformat Duos → Solo/)).toBeTruthy();
  expect(screen.getByText(/Spielmodus Reload → Battle Royale/)).toBeTruthy();
  expect(screen.getByText(/Turniertyp FNCS → Cash Cup/)).toBeTruthy();
  expect(screen.getByText(/Kategorie Liga → Turnier/)).toBeTruthy();
  expect(screen.queryByTestId('event-detail-changes-new-event')).toBeNull();
  expect(screen.queryByTestId('event-detail-changes-same-event')).toBeNull();
});

test('zeigt auch geänderte Termine außerhalb der ersten zwanzig Vorschauzeilen', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    importableCount: 21,
    events: [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `event-${index + 1}`,
        title: `Turnier ${index + 1}`,
        startTime: '2026-11-12T18:00:00.000Z',
        endTime: '2026-11-12T20:00:00.000Z',
        previousTitle: null,
        previousGameMode: null,
        previousTeamFormat: null,
        previousTournamentType: null,
        previousCategory: null,
        previousStartTime: null,
        previousEndTime: null,
        gameMode: 'Battle Royale',
        teamFormat: 'Solo',
        tournamentType: 'Cash Cup',
        category: 'Turnier',
        warnings: [],
        willUpdate: false,
      })),
      {
        id: 'changed-outside-limit',
        title: 'Turnier mit geänderter Kategorie',
        startTime: '2026-11-12T18:00:00.000Z',
        endTime: '2026-11-12T20:00:00.000Z',
        previousTitle: null,
        previousGameMode: null,
        previousTeamFormat: null,
        previousTournamentType: null,
        previousCategory: 'Liga',
        previousStartTime: null,
        previousEndTime: null,
        gameMode: 'Battle Royale',
        teamFormat: 'Solo',
        tournamentType: 'Cash Cup',
        category: 'Turnier',
        warnings: [],
        willUpdate: true,
      },
    ],
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));

  expect(await screen.findByTestId('event-detail-changes-changed-outside-limit')).toBeTruthy();
  expect(screen.getByText(/Kategorie Liga → Turnier/)).toBeTruthy();
  expect(screen.queryByText(/weitere Termine ohne Warnung/)).toBeNull();
});

test('wechselt zwischen allen Vorschauterminen und Änderungen mit passenden Zählern', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  const unchangedEvent = {
    id: 'unchanged-event',
    title: 'Unveränderter Termin',
    startTime: '2026-11-12T18:00:00.000Z',
    endTime: '2026-11-12T20:00:00.000Z',
    previousTitle: null,
    previousGameMode: null,
    previousTeamFormat: null,
    previousTournamentType: null,
    previousCategory: null,
    previousStartTime: null,
    previousEndTime: null,
    gameMode: 'Battle Royale',
    teamFormat: 'Solo',
    tournamentType: 'Cash Cup',
    category: 'Turnier',
    warnings: [],
    willUpdate: true,
  };
  const changedEvents = [
    { id: 'changed-start', title: 'Startzeit geändert', previousStartTime: '2026-11-12T17:00:00.000Z' },
    { id: 'changed-end', title: 'Endzeit geändert', previousEndTime: '2026-11-12T21:00:00.000Z' },
    { id: 'changed-title', title: 'Titel geändert', previousTitle: 'Alter Titel' },
    { id: 'changed-mode', title: 'Spielmodus geändert', previousGameMode: 'Reload' },
    { id: 'changed-format', title: 'Spielformat geändert', previousTeamFormat: 'Duos' },
    { id: 'changed-type', title: 'Turniertyp geändert', previousTournamentType: 'FNCS' },
    { id: 'changed-category', title: 'Kategorie geändert', previousCategory: 'Liga' },
  ].map((change) => ({ ...unchangedEvent, ...change }));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    importableCount: 8,
    updateCount: 8,
    events: [unchangedEvent, ...changedEvents],
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));

  expect(await screen.findByText('Vorschautermine')).toBeTruthy();
  expect(screen.getByTestId('import-event-count-summary').props.children.join(''))
    .toBe('8 Termine · 7 geändert');
  expect(screen.getByText('Unveränderter Termin')).toBeTruthy();
  expect(screen.getByTestId('import-event-filter-all').props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Alle (8)')).toBeTruthy();
  expect(screen.getByText('Geändert (7)')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('import-event-filter-changed'));

  expect(screen.getByTestId('import-event-filter-changed').props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId('import-event-filter-all').props.accessibilityState.selected).toBe(false);
  expect(screen.getByTestId('import-event-count-summary').props.children.join(''))
    .toBe('8 Termine · 7 geändert');
  expect(screen.queryByText('Unveränderter Termin')).toBeNull();
  for (const event of changedEvents) {
    expect(screen.getByText(event.title)).toBeTruthy();
  }

  await fireEvent.press(screen.getByTestId('import-event-filter-all'));
  expect(screen.getByTestId('import-event-filter-all').props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('Unveränderter Termin')).toBeTruthy();
});

test('meldet einen Abbruch verständlich und lässt die Auswahl erneut zu', async () => {
  mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText(
    'Dateiauswahl abgebrochen. Du kannst jederzeit erneut eine Datei auswählen.',
  )).toBeTruthy();
  expect(screen.getByTestId('choose-import-file-button').props.accessibilityState.disabled).not.toBe(true);
});

test.each([
  ['falscher Dateityp', selectedFile('plan.pdf'), 'Bitte wähle eine MHT- oder MHTML-Datei aus.'],
  ['Datei über 25 MB', selectedFile('plan.mht', 25 * 1024 * 1024 + 1), 'Die Datei ist größer als 25 MB. Bitte wähle eine kleinere Datei aus.'],
])('weist %s mit verständlichem Hinweis zurück', async (_label, selection, message) => {
  mockGetDocumentAsync.mockResolvedValue(selection);
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText(message)).toBeTruthy();
  expect(mockReadFile).not.toHaveBeenCalled();
  expect(screen.getByTestId('choose-import-file-button').props.accessibilityState.disabled).not.toBe(true);
});

test('prüft die Dateigröße über die lokale Datei, wenn die Auswahl keine Größe meldet', async () => {
  setPlatformOS('ios');
  mockNativeFileSize = 25 * 1024 * 1024 + 1;
  mockGetDocumentAsync.mockResolvedValue(selectedFileWithoutSize('plan.mht'));
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText(
    'Die Datei ist größer als 25 MB. Bitte wähle eine kleinere Datei aus.',
  )).toBeTruthy();
  expect(mockReadFile).not.toHaveBeenCalled();
});

test('akzeptiert Dateien bis einschließlich 25 MB', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht', 25 * 1024 * 1024));
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText('plan.mht')).toBeTruthy();
  expect(mockReadFile).toHaveBeenCalledTimes(1);
});

test('zeigt einen verständlichen Hinweis, wenn die Datei fehlt oder nicht lesbar ist', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFileWithoutSize('plan.mht'));
  mockNativeFileSize = null;
  mockReadFile.mockRejectedValue(new Error('native filesystem error'));
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText(
    'Die Datei konnte nicht gelesen werden. Bitte prüfe, ob sie noch verfügbar ist, und wähle sie erneut aus.',
  )).toBeTruthy();
  expect(screen.getByTestId('choose-import-file-button').props.accessibilityState.disabled).not.toBe(true);
});

test('liest native Dateien auf iOS weiterhin über die File API', async () => {
  setPlatformOS('ios');
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText('plan.mht')).toBeTruthy();
  expect(mockGetDocumentAsync).toHaveBeenCalledWith({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  expect(mockReadFile).toHaveBeenCalledTimes(1);
});

test('meldet eine leere Dateiauswahl, ohne den Bildschirm zu blockieren', async () => {
  mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [] });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));

  expect(await screen.findByText(
    'Es wurde keine Datei bereitgestellt. Bitte wähle sie erneut aus.',
  )).toBeTruthy();
  expect(screen.getByTestId('choose-import-file-button').props.accessibilityState.disabled).not.toBe(true);
});

test('zeigt Admins die gespeicherte Importhistorie mit Konto, Quelle und Zählern', async () => {
  mockImportHistory.mockReturnValue({
    data: {
      entries: [{
        id: 19,
        importedAt: '2026-11-11T12:00:00.000Z',
        adminUserId: '2d81b842-8d9c-4de3-8411-6787a91e68e9',
        adminEmail: 'admin@example.org',
        sourceHint: 'fortnite.com',
        insertedCount: 2,
        updatedCount: 1,
        skippedCount: 4,
        skippedWarningCount: 2,
        skippedPastCount: 1,
        skippedInvalidCount: 1,
      }],
    },
    isLoading: false,
    isError: false,
  });
  const screen = await openImportScreen();

  expect(screen.getByTestId('admin-import-history')).toBeTruthy();
  expect(screen.getByText('Admin: admin@example.org')).toBeTruthy();
  expect(screen.getByText('fortnite.com')).toBeTruthy();
  expect(screen.getByText('2 neu · 1 aktualisiert · 4 übersprungen')).toBeTruthy();
  expect(screen.getByText(
    'Davon 2 mit unklarer Zuordnung, 1 vergangene Termine und 1 fehlerhafte Karten.',
  )).toBeTruthy();
});

test('zeigt bei älteren Historieneinträgen weiterhin die Gesamtzahl ohne erfundene Aufschlüsselung', async () => {
  mockImportHistory.mockReturnValue({
    data: {
      entries: [{
        id: 20,
        importedAt: '2026-11-10T12:00:00.000Z',
        adminUserId: '2d81b842-8d9c-4de3-8411-6787a91e68e9',
        adminEmail: 'admin@example.org',
        sourceHint: null,
        insertedCount: 1,
        updatedCount: 0,
        skippedCount: 3,
        skippedWarningCount: null,
        skippedPastCount: null,
        skippedInvalidCount: null,
      }],
    },
    isLoading: false,
    isError: false,
  });
  const screen = await openImportScreen();

  expect(screen.getByText('1 neu · 0 aktualisiert · 3 übersprungen')).toBeTruthy();
  expect(screen.getByText(
    'Für diesen älteren Eintrag ist keine Aufschlüsselung gespeichert.',
  )).toBeTruthy();
});

test('zeigt fehlerhafte Karten getrennt im Importergebnis an', async () => {
  setPlatformOS('android');
  mockGetDocumentAsync.mockResolvedValue(selectedFile('plan.mht'));
  mockPreviewImport.mockResolvedValue({
    ...preview,
    importableCount: 1,
    events: [{
      id: 'event-1',
      title: 'Turnier',
      startTime: '2026-11-12T18:00:00.000Z',
      endTime: '2026-11-12T20:00:00.000Z',
      previousTitle: null,
      previousGameMode: null,
      previousTeamFormat: null,
      previousTournamentType: null,
      previousCategory: null,
      gameMode: 'Battle Royale',
      teamFormat: 'Solo',
      tournamentType: 'Cash Cup',
      category: 'Turnier',
      warnings: [],
      willUpdate: false,
    }],
  });
  mockImportSchedule.mockResolvedValue({
    importedCount: 1,
    insertedCount: 1,
    updatedCount: 0,
    skippedWarningCount: 2,
    skippedPastCount: 3,
    skippedInvalidCount: 4,
    skippedCount: 9,
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.text === 'Importieren')?.onPress?.();
  });
  const screen = await openImportScreen();

  await fireEvent.press(screen.getByTestId('choose-import-file-button'));
  await fireEvent.press(screen.getByTestId('preview-import-file-button'));
  await fireEvent.press(await screen.findByTestId('confirm-import-button'));

  expect(await screen.findByText(
    '1 Termine gespeichert: 1 neu, 0 aktualisiert. 2 mit unklarer Zuordnung, 3 vergangene Termine und 4 fehlerhafte Karten wurden übersprungen.',
  )).toBeTruthy();
  alertSpy.mockRestore();
});
