import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import * as Sharing from 'expo-sharing';
import SearchConsoleScreen from '../app/admin/search-console';

const mockRouter = { back: jest.fn() };
const mockFetch = jest.fn<typeof fetch>();
const originalDomain = process.env.EXPO_PUBLIC_DOMAIN;

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///cache/cupcal-suchbegriffe.csv',
    create: jest.fn(),
    write: jest.fn(),
  })),
  Paths: { cache: {} },
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => mockRouter,
}));
jest.mock('expo/virtual/env', () => ({ env: process.env }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#080b10',
    foreground: '#f5f7fa',
    mutedForeground: '#8f99a7',
    primary: '#d2f52b',
    primaryForeground: '#10140a',
    success: '#d2f52b',
    warning: '#f0b24b',
    destructive: '#f47788',
    card: '#10161e',
    border: '#26303b',
    input: '#0b1017',
  }),
}));
beforeEach(() => {
  process.env.EXPO_PUBLIC_DOMAIN = 'cupcal.example.test';
  setBaseUrl('https://cupcal.example.test');
  setAuthTokenGetter(() => 'cupcal-session-token');
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  jest.mocked(Sharing.shareAsync).mockClear();
  (jest.requireMock('expo-file-system') as { File: jest.Mock }).File.mockClear();
});

afterEach(() => {
  setBaseUrl(null);
  setAuthTokenGetter(null);
  if (originalDomain === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
  else process.env.EXPO_PUBLIC_DOMAIN = originalDomain;
});

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return await render(
    <QueryClientProvider client={queryClient}>
      <SearchConsoleScreen />
    </QueryClientProvider>,
  );
}

async function renderCanonicalReport(
  userCanonical: string | null,
  googleCanonical: string | null,
  pageFetchState: string | null = null,
  robotsTxtState: string | null = null,
) {
  mockFetch
    .mockResolvedValueOnce(Response.json({
      configured: true,
      property: 'https://cupcal.af-software.app/',
      serviceAccountEmail: 'cupcal-search@project.iam.gserviceaccount.com',
    }))
    .mockResolvedValueOnce(Response.json({
      property: 'https://cupcal.af-software.app/',
      data: [{
        url: 'https://cupcal.af-software.app/',
        indexing: {
          verdict: 'PASS',
          coverageState: 'Indexiert',
          robotsTxtState,
          indexingState: 'INDEXING_ALLOWED',
          lastCrawlTime: null,
          pageFetchState,
          googleCanonical,
          userCanonical,
          canonicalHistory: { firstDetectedAt: null, lastChangedAt: null },
        },
        performance: { clicks: 0, impressions: 0, ctr: 0, position: null },
        countries: [],
        devices: [],
        queries: [],
        queryComparisons: [],
      }],
    }));
  const view = await renderScreen();
  await view.findByText('Google-Dienstkonto ist eingerichtet.');
  await fireEvent.press(view.getByLabelText('Suchdaten abrufen'));
  return view;
}

test('zeigt den Hinweis, wenn Google-Zugangsdaten noch nicht eingerichtet sind', async () => {
  mockFetch.mockResolvedValueOnce(Response.json({
    configured: false,
    property: 'https://cupcal.af-software.app/',
    serviceAccountEmail: null,
  }));

  const view = await renderScreen();

  expect(await view.findByText(/Google-Dienstkonto und Leseberechtigung/)).toBeTruthy();
  expect(view.getByLabelText('Suchdaten abrufen').props.accessibilityState.disabled).toBe(true);
  expect(mockFetch.mock.calls[0]?.[0]).toBe(
    'https://cupcal.example.test/api/v1/admin/search-console/status',
  );
});

test('lädt Indexstatus und Suchleistung mit der CupCal-Admin-Sitzung', async () => {
  mockFetch
    .mockResolvedValueOnce(Response.json({
      configured: true,
      property: 'https://cupcal.af-software.app/',
      serviceAccountEmail: 'cupcal-search@project.iam.gserviceaccount.com',
    }))
    .mockResolvedValueOnce(Response.json({
      property: 'https://cupcal.af-software.app/',
      data: [{
        url: 'https://cupcal.af-software.app/',
        indexing: {
          verdict: 'PASS',
          coverageState: 'Eingereicht und indexiert',
          robotsTxtState: 'ALLOWED',
          indexingState: 'INDEXING_ALLOWED',
          lastCrawlTime: '2026-11-19T10:36:01Z',
          pageFetchState: 'SUCCESSFUL',
          googleCanonical: 'https://cupcal.af-software.app/',
          userCanonical: 'https://www.cupcal.af-software.app/',
          canonicalHistory: {
            firstDetectedAt: '2026-11-19T10:36:01Z',
            lastChangedAt: '2026-11-20T10:36:01Z',
          },
        },
        performance: { clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 },
        countries: [
          { country: 'DEU', clicks: 9, impressions: 280, ctr: 0.032, position: 8.1 },
        ],
        devices: [
          { device: 'MOBILE', clicks: 7, impressions: 180, ctr: 0.0389, position: 6.4 },
        ],
        queries: [
          { query: 'cupcal kalender', clicks: 8, impressions: 100, ctr: 0.08, position: 4.5 },
          { query: 'fortnite cup termine', clicks: 2, impressions: 30, ctr: 0.0667, position: 7.1 },
        ],
        queryComparisons: [
          {
            query: 'cupcal kalender',
            currentClicks: 8,
            currentImpressions: 100,
            currentPosition: 4.5,
            comparisonClicks: 3,
            comparisonImpressions: 50,
            comparisonPosition: 5.5,
            status: 'both',
          },
          {
            query: 'neuer cupcal begriff',
            currentClicks: 2,
            currentImpressions: 30,
            currentPosition: 7.1,
            comparisonClicks: null,
            comparisonImpressions: null,
            comparisonPosition: null,
            status: 'new',
          },
        ],
      }],
    }));

  const view = await renderScreen();
  expect(await view.findByText('Google-Dienstkonto ist eingerichtet.')).toBeTruthy();
  await fireEvent.press(view.getByText('Suchdaten abrufen'));

  expect(await view.findByText('Eingereicht und indexiert')).toBeTruthy();
  expect(await view.findByText('Google-Abruf: Abruf erfolgreich')).toBeTruthy();
  expect(await view.findByText('Robots.txt: Abruf durch robots.txt erlaubt')).toBeTruthy();
  expect(view.getByText('Website-Canonical')).toBeTruthy();
  expect(view.getByLabelText('Website-Canonical: https://www.cupcal.af-software.app/')).toBeTruthy();
  expect(view.getByLabelText('Google-Canonical: https://cupcal.af-software.app/')).toBeTruthy();
  expect(await view.findByText('Abweichung: Google verwendet eine andere Canonical-Adresse')).toBeTruthy();
  expect(await view.findByText(/Abweichung erstmals erfasst: 19\.11\.2026, 11:36/)).toBeTruthy();
  expect(await view.findByText(/Canonical-Werte zuletzt geändert: 20\.11\.2026, 11:36/)).toBeTruthy();
  expect(view.getByText(/Historie beginnt mit der ersten Abfrage/)).toBeTruthy();
  expect(await view.findByText('12 Klicks · 340 Impressionen')).toBeTruthy();
  expect(await view.findByText('DEU')).toBeTruthy();
  expect(await view.findByText('Mobilgerät')).toBeTruthy();
  expect(await view.findByText('cupcal kalender')).toBeTruthy();
  expect(await view.findByText('Aktuell: 8 Klicks · 100 Impressionen')).toBeTruthy();
  expect(await view.findByText('Vergleich: 3 Klicks · 50 Impressionen')).toBeTruthy();
  expect(await view.findByText('Neu')).toBeTruthy();
  expect(view.getByText(/anonymisierte Suchanfragen möglicherweise aus/)).toBeTruthy();
  await waitFor(() => {
    const reportCall = mockFetch.mock.calls[1];
    const reportRequest = reportCall?.[1];
    const reportUrl = reportCall?.[0];
    expect(reportUrl).toBe('https://cupcal.example.test/api/v1/admin/search-console/report');
    expect(new Headers(reportRequest?.headers).get('authorization')).toBe('Bearer cupcal-session-token');
    expect(reportRequest?.method).toBe('POST');
    expect(JSON.parse(String(reportRequest?.body))).toMatchObject({
      urls: ['https://cupcal.af-software.app/'],
      startDate: expect.any(String),
      endDate: expect.any(String),
      comparisonStartDate: expect.any(String),
      comparisonEndDate: expect.any(String),
    });
  });

  await fireEvent.press(view.getByLabelText('Suchbericht als CSV exportieren'));
  await waitFor(() => {
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/cupcal-suchbegriffe.csv',
      expect.objectContaining({ mimeType: 'text/csv' }),
    );
  });
  const mockedFile = (jest.requireMock('expo-file-system') as { File: jest.Mock }).File;
  const fileInstance = mockedFile.mock.results.at(-1)?.value as { write: jest.Mock };
  expect(fileInstance.write).toHaveBeenCalledWith(expect.stringContaining(
    '"Seite";"Zeitraum";"Suchbegriff";"Klicks";"Impressionen";"Position";"Website-Canonical";"Google-Canonical";"Canonical-Status"',
  ));
  expect(fileInstance.write).toHaveBeenCalledWith(expect.stringContaining(
    '"https://www.cupcal.af-software.app/";"https://cupcal.af-software.app/";"Abweichend"',
  ));
  expect(fileInstance.write).toHaveBeenCalledWith(expect.stringContaining(
    '"Aktuell: ',
  ));
  expect(fileInstance.write).toHaveBeenCalledWith(expect.stringContaining(
    '"cupcal kalender";"8";"100";"4.5"',
  ));
  expect(fileInstance.write).toHaveBeenCalledWith(expect.stringContaining(
    'Google blendet seltene oder anonymisierte Suchanfragen möglicherweise aus.',
  ));
});

test('kennzeichnet übereinstimmende Canonical-Adressen klar', async () => {
  const canonical = 'https://cupcal.af-software.app/turnierkalender-app/';
  const view = await renderCanonicalReport(canonical, canonical);

  expect(await view.findByText('Canonical-Adressen stimmen überein')).toBeTruthy();
  expect(view.getAllByText(canonical)).toHaveLength(2);
});

test('erklärt blockierte Abrufe und Robots-Freigaben verständlich', async () => {
  const view = await renderCanonicalReport(
    null,
    null,
    'BLOCKED_ROBOTS_TXT',
    'DISALLOWED',
  );

  expect(await view.findByText('Google-Abruf: Durch robots.txt blockiert')).toBeTruthy();
  expect(await view.findByText('Robots.txt: Durch robots.txt nicht erlaubt')).toBeTruthy();
});

test('erklärt, wenn für eine Seite keine sichtbaren Suchbegriffe vorliegen', async () => {
  mockFetch
    .mockResolvedValueOnce(Response.json({
      configured: true,
      property: 'https://cupcal.af-software.app/',
      serviceAccountEmail: 'cupcal-search@project.iam.gserviceaccount.com',
    }))
    .mockResolvedValueOnce(Response.json({
      property: 'https://cupcal.af-software.app/',
      data: [{
        url: 'https://cupcal.af-software.app/',
        indexing: {
          verdict: 'PASS',
          coverageState: 'Indexiert',
          robotsTxtState: null,
          indexingState: 'INDEXING_ALLOWED',
          lastCrawlTime: null,
          pageFetchState: null,
          googleCanonical: null,
          userCanonical: null,
          canonicalHistory: { firstDetectedAt: null, lastChangedAt: null },
        },
        performance: { clicks: 0, impressions: 0, ctr: 0, position: null },
        countries: [],
        devices: [],
        queries: [],
        queryComparisons: [],
      }],
    }));

  const view = await renderScreen();
  await view.findByText('Google-Dienstkonto ist eingerichtet.');
  await fireEvent.press(await view.findByText('Suchdaten abrufen'));

  expect(await view.findByText(
    'Für diese Seite wurden in beiden Zeiträumen keine sichtbaren Suchbegriffe gemeldet.',
  )).toBeTruthy();
  expect(await view.findByText('Vergleich nicht möglich: Canonical-Adresse fehlt')).toBeTruthy();
  expect(await view.findByText('Google-Abruf: Nicht verfügbar')).toBeTruthy();
  expect(await view.findByText('Robots.txt: Nicht verfügbar')).toBeTruthy();
  expect(view.getAllByText('Nicht verfügbar')).toHaveLength(2);
  expect(view.getByText(/Google blendet seltene oder anonymisierte Suchanfragen/)).toBeTruthy();
  expect(view.getByText(
    'Google hat für diese Seite im gewählten Zeitraum keine Länderwerte geliefert.',
  )).toBeTruthy();
  expect(view.getByText(
    'Google hat für diese Seite im gewählten Zeitraum keine Gerätedaten geliefert.',
  )).toBeTruthy();
});
