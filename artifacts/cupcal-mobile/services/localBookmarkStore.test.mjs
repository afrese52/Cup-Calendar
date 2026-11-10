import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  loadAnonymousBookmarks,
  loadBookmarksForUser,
  prepareBookmarksForSync,
  reconcileBookmarks,
  setBookmarksFavorite,
  shouldUploadBookmarkChange,
} from './localBookmarkStore.ts';

const storedValues = new Map();
const localStorage = {
  get length() { return storedValues.size; },
  clear() { storedValues.clear(); },
  getItem(key) { return storedValues.get(key) ?? null; },
  key(index) { return [...storedValues.keys()][index] ?? null; },
  removeItem(key) { storedValues.delete(key); },
  setItem(key, value) { storedValues.set(key, String(value)); },
};
globalThis.window = { localStorage };

beforeEach(async () => {
  localStorage.clear();
});

test('sichert Offline-Favoriten und -Entfernungen bis zur Bestätigung', async () => {
  const first = new Date(Date.now() - 10_000).toISOString();
  const [eventId] = await setBookmarksFavorite('konto-a', ['turnier-a'], true);
  const firstChange = (await prepareBookmarksForSync('konto-a'))[eventId];

  assert.equal(firstChange.isFavorite, true);
  const afterAddingOffline = await reconcileBookmarks('konto-a', []);
  assert.deepEqual(afterAddingOffline.eventIds, ['turnier-a']);
  assert.equal(afterAddingOffline.pendingCount, 1);

  await setBookmarksFavorite('konto-a', ['turnier-a'], false);
  const removal = (await prepareBookmarksForSync('konto-a'))[eventId];
  assert.equal(removal.isFavorite, false);
  assert.ok(Date.parse(removal.updatedAt) > Date.parse(firstChange.updatedAt));

  const afterRemovingOffline = await reconcileBookmarks('konto-a', [{
    event_id: eventId,
    is_favorite: true,
    updated_at: first,
  }]);
  assert.deepEqual(afterRemovingOffline.eventIds, []);
  assert.equal(afterRemovingOffline.pendingCount, 1);

  const afterServerAcknowledgesRemoval = await reconcileBookmarks('konto-a', [{
    event_id: eventId,
    is_favorite: false,
    updated_at: removal.updatedAt,
  }]);
  assert.deepEqual(afterServerAcknowledgesRemoval.eventIds, []);
  assert.equal(afterServerAcknowledgesRemoval.pendingCount, 0);
});

test('migriert alte anonyme Einträge nur in das erste angemeldete Konto', async () => {
  localStorage.setItem('cupcal.bookmarks.v1', JSON.stringify(['turnier-alt']));

  assert.deepEqual(await loadBookmarksForUser('konto-a'), ['turnier-alt']);
  const firstAccountChanges = await prepareBookmarksForSync('konto-a');
  assert.equal(firstAccountChanges['turnier-alt']?.isFavorite, true);
  assert.deepEqual(await loadAnonymousBookmarks(), []);

  await reconcileBookmarks('konto-a', [{
    event_id: 'turnier-alt',
    is_favorite: true,
    updated_at: firstAccountChanges['turnier-alt'].updatedAt,
  }]);
  assert.deepEqual(await loadBookmarksForUser('konto-a'), ['turnier-alt']);
  assert.deepEqual(await prepareBookmarksForSync('konto-b'), {});
  assert.deepEqual(await loadBookmarksForUser('konto-b'), []);
});

test('löst gleichzeitige Zeitstempel deterministisch zugunsten einer Entfernung', async () => {
  const eventId = 'turnier-a';
  await setBookmarksFavorite('konto-a', [eventId], false);
  const removal = (await prepareBookmarksForSync('konto-a'))[eventId];
  const simultaneousFavorite = {
    event_id: eventId,
    is_favorite: true,
    updated_at: removal.updatedAt,
  };

  assert.equal(shouldUploadBookmarkChange(removal, simultaneousFavorite), true);
  const unresolved = await reconcileBookmarks('konto-a', [simultaneousFavorite]);
  assert.deepEqual(unresolved.eventIds, []);
  assert.equal(unresolved.pendingCount, 1);

  assert.equal(shouldUploadBookmarkChange({
    isFavorite: true,
    updatedAt: removal.updatedAt,
  }, { ...simultaneousFavorite, is_favorite: false }), false);
  const resolved = await reconcileBookmarks('konto-a', [{
    ...simultaneousFavorite,
    is_favorite: false,
  }]);
  assert.deepEqual(resolved.eventIds, []);
  assert.equal(resolved.pendingCount, 0);
});

test('hält Favoriten und ausstehende Änderungen pro Konto getrennt', async () => {
  await setBookmarksFavorite('konto-a', ['nur-a'], true);
  await setBookmarksFavorite('konto-b', ['nur-b'], true);
  await prepareBookmarksForSync('konto-a');
  await prepareBookmarksForSync('konto-b');

  assert.deepEqual(await loadBookmarksForUser('konto-a'), ['nur-a']);
  assert.deepEqual(await loadBookmarksForUser('konto-b'), ['nur-b']);
  await setBookmarksFavorite('konto-a', ['nur-a'], false);
  assert.deepEqual(await loadBookmarksForUser('konto-a'), []);
  assert.deepEqual(await loadBookmarksForUser('konto-b'), ['nur-b']);
});
