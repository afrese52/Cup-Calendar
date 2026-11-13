import React from 'react';
import { afterEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { LegacyBookmarkImportPrompt } from '../components/LegacyBookmarkImportPrompt';

const mockContext: { current: Record<string, any> } = { current: {} };

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    foreground: '#111',
    mutedForeground: '#666',
    primary: '#06c',
    primaryForeground: '#fff',
    border: '#ddd',
  }),
}));
jest.mock('@/state/AppContext', () => ({
  useCupCal: () => mockContext.current,
}));

const importBookmarks = jest.fn(async () => undefined);
const keepLocal = jest.fn(async () => undefined);

afterEach(() => {
  importBookmarks.mockClear();
  keepLocal.mockClear();
});

test('erklärt die Kontozuordnung und lässt die Wahl zwischen Import und lokaler Ablage', async () => {
  mockContext.current = {
    legacyBookmarkImportCount: 3,
    importLegacyBookmarks: importBookmarks,
    keepLegacyBookmarksLocal: keepLocal,
  };
  const view = await render(<LegacyBookmarkImportPrompt />);

  expect(view.getByText('Alte Merkliste gefunden')).toBeTruthy();
  expect(view.getByText(/3 alte Favoriten/)).toBeTruthy();
  expect(view.getByText(/werden nicht hochgeladen/)).toBeTruthy();

  await fireEvent.press(view.getByTestId('legacy-bookmarks-import'));
  expect(importBookmarks).toHaveBeenCalledTimes(1);

  await fireEvent.press(view.getByTestId('legacy-bookmarks-keep-local'));
  expect(keepLocal).toHaveBeenCalledTimes(1);

  mockContext.current = { ...mockContext.current, legacyBookmarkImportCount: 1 };
  await view.rerender(<LegacyBookmarkImportPrompt />);
  expect(view.getByText(/Ein alter Favorit liegt/)).toBeTruthy();
});

