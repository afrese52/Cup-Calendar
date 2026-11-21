import React from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'cupcal-session-token' } },
        error: null,
      })),
    },
  },
}));

beforeEach(() => {
  process.env.EXPO_PUBLIC_DOMAIN = 'cupcal.example.test';
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  if (originalDomain === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
  else process.env.EXPO_PUBLIC_DOMAIN = originalDomain;
});

test('zeigt den Hinweis, wenn Google-Zugangsdaten noch nicht eingerichtet sind', async () => {
  mockFetch.mockResolvedValueOnce(Response.json({
    configured: false,
    property: 'https://cupcal.af-software.app/',
    serviceAccountEmail: null,
  }));

  const view = await render(<SearchConsoleScreen />);

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
      }],
    }));

  const view = await render(<SearchConsoleScreen />);
  expect(await view.findByText('Google-Dienstkonto ist eingerichtet.')).toBeTruthy();
  await fireEvent.press(view.getByText('Suchdaten abrufen'));

  expect(await view.findByText('Eingereicht und indexiert')).toBeTruthy();
  expect(await view.findByText('12 Klicks · 340 Impressionen')).toBeTruthy();
  await waitFor(() => {
    const reportRequest = mockFetch.mock.calls[1]?.[1];
    expect(reportRequest?.headers).toMatchObject({ authorization: 'Bearer cupcal-session-token' });
    expect(reportRequest?.method).toBe('POST');
  });
});
