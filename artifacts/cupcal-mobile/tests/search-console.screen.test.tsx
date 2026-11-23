import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import SearchConsoleScreen from '../app/admin/search-console';

const mockRouter = { back: jest.fn() };
const mockFetch = jest.fn<typeof fetch>();
const originalDomain = process.env.EXPO_PUBLIC_DOMAIN;

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
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
          robotsTxtState: null,
          indexingState: 'INDEXING_ALLOWED',
          lastCrawlTime: '2026-11-19T10:36:01Z',
          pageFetchState: null,
          googleCanonical: 'https://cupcal.af-software.app/',
          userCanonical: null,
        },
        performance: { clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 },
        queries: [
          { query: 'cupcal kalender', clicks: 8, impressions: 100, ctr: 0.08, position: 4.5 },
          { query: 'fortnite cup termine', clicks: 2, impressions: 30, ctr: 0.0667, position: 7.1 },
        ],
      }],
    }));

  const view = await renderScreen();
  expect(await view.findByText('Google-Dienstkonto ist eingerichtet.')).toBeTruthy();
  await fireEvent.press(view.getByText('Suchdaten abrufen'));

  expect(await view.findByText('Eingereicht und indexiert')).toBeTruthy();
  expect(await view.findByText('12 Klicks · 340 Impressionen')).toBeTruthy();
  expect(await view.findByText('cupcal kalender')).toBeTruthy();
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
    });
  });
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
        },
        performance: { clicks: 0, impressions: 0, ctr: 0, position: null },
        queries: [],
      }],
    }));

  const view = await renderScreen();
  await fireEvent.press(await view.findByText('Suchdaten abrufen'));

  expect(await view.findByText(
    'Für diese Seite wurden im Zeitraum keine sichtbaren Suchbegriffe gemeldet.',
  )).toBeTruthy();
  expect(view.getByText(/Google blendet seltene oder anonymisierte Suchanfragen/)).toBeTruthy();
});
