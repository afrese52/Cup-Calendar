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
  await waitFor(() => expect(mockPreviewImport).toHaveBeenCalledWith({ data: 'MIME-Version: 1.0\n' }));
  expect(await screen.findByText('Prüfergebnis')).toBeTruthy();
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
    expect.stringContaining('Achtung: Der Snapshot ist älter als 24 Stunden.'),
    expect.any(Array),
  );
  alertSpy.mockRestore();
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
});
