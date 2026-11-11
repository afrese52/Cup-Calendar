import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookmarkSyncErrorMessage } from './bookmarkSyncErrors.ts';

test('erklärt fehlende Supabase-Bookmark-Migrationen', () => {
  for (const code of ['42703', 'PGRST202', 'PGRST204', 'PGRST205']) {
    assert.match(
      getBookmarkSyncErrorMessage({ code }),
      /Migrationen 0002 und 0003/,
    );
  }
});

test('erklärt abgewiesene Bookmark-Zugriffe', () => {
  assert.match(
    getBookmarkSyncErrorMessage({ code: '42501' }),
    /RLS-Richtlinien der Migration 0002/,
  );
});

test('gibt für unbekannte Sync-Fehler eine lokale Speicher-Rückmeldung', () => {
  assert.match(
    getBookmarkSyncErrorMessage(new Error('network failed')),
    /Favoriten bleiben auf diesem Gerät gespeichert/,
  );
});
