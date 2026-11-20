import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  loadAnonymousBookmarks,
  loadBookmarksForUser,
  removeBookmarksForDeletedUser,
  getAnonymousBookmarksForImport,
  importAnonymousBookmarksForUser,
  keepAnonymousBookmarksLocal,
  prepareBookmarksForSync,
  reconcileBookmarks,
  setBookmarksFavorite,
  shouldUploadBookmarkChange,
} from './localBookmarkStore.ts';

const storedValues = new Map();
const storageFailures = { get: false, set: false, remove: false };
const localStorage = {
  get length() { return storedValues.size; },
  clear() { storedValues.clear(); },
  getItem(key) {
    if (storageFailures.get) throw new Error('device storage read failed');
    return storedValues.get(key) ?? null;
  },
  key(index) { return [...storedValues.keys()][index] ?? null; },
  removeItem(key) {
    if (storageFailures.remove) throw new Error('device storage remove failed');
    storedValues.delete(key);
  },
  setItem(key, value) {
    if (storageFailures.set) throw new Error('device storage write failed');
    storedValues.set(key, String(value));
  },
};
globalThis.window = { localStorage };

beforeEach(async () => {
  localStorage.clear();
  storageFailures.get = false;
  storageFailures.set = false;
  storageFailures.remove = false;
});

test('gibt Fehler beim Lesen des Gerätespeichers weiter', async () => {
  storageFailures.get = true;

  await assert.rejects(loadBookmarksForUser(null), /device storage read failed/);
});

test('meldet fehlgeschriebene Favoritenänderungen und speichert sie nicht', async () => {
  storageFailures.set = true;

  await assert.rejects(
    setBookmarksFavorite('konto-a', ['turnier-a'], true),
    /device storage write failed/,
  );

  storageFailures.set = false;
  assert.deepEqual(await loadBookmarksForUser('konto-a'), []);
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

test('verweigert das Speichern ohne angemeldetes Konto', async () => {
  await assert.rejects(
    setBookmarksFavorite(null, ['turnier-ohne-konto'], true),
    /angemeldet sein/,
  );
  assert.deepEqual(await loadAnonymousBookmarks(), []);
});

test('übernimmt alte anonyme Einträge erst nach ausdrücklicher Zustimmung', async () => {
  localStorage.setItem('cupcal.bookmarks.v1', JSON.stringify(['turnier-alt']));

  assert.deepEqual(await loadBookmarksForUser(null), ['turnier-alt']);
  assert.deepEqual(await loadBookmarksForUser('konto-a'), []);
  assert.deepEqual(await getAnonymousBookmarksForImport('konto-a'), ['turnier-alt']);
  assert.deepEqual(await prepareBookmarksForSync('konto-a'), {});
  assert.deepEqual(await loadAnonymousBookmarks(), ['turnier-alt']);

  const importedIds = await importAnonymousBookmarksForUser('konto-a');
  assert.deepEqual(importedIds, ['turnier-alt']);
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

test('führt alte Gastfavoriten mit Kontofavoriten und ausstehenden Entfernungen zusammen', async () => {
  localStorage.setItem('cupcal.bookmarks.v2', JSON.stringify({
    anonymousIds: [],
    anonymousImportDeclinedUserIds: [],
    accounts: {
      'konto-a': {
        eventIds: ['konto-favorit'],
        pending: {
          'ausstehende-entfernung': {
            isFavorite: false,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        initialized: true,
      },
    },
  }));
  localStorage.setItem(
    'cupcal.bookmarks.v1',
    JSON.stringify(['gast-favorit', 'ausstehende-entfernung']),
  );

  const importedIds = await importAnonymousBookmarksForUser('konto-a');
  assert.deepEqual(importedIds, ['konto-favorit', 'gast-favorit']);

  const pending = await prepareBookmarksForSync('konto-a');
  assert.equal(pending['ausstehende-entfernung']?.isFavorite, false);
  assert.deepEqual(await loadBookmarksForUser('konto-a'), ['konto-favorit', 'gast-favorit']);

  const savedStore = JSON.parse(localStorage.getItem('cupcal.bookmarks.v2'));
  assert.deepEqual(
    savedStore.accounts['konto-a'].eventIds,
    ['konto-favorit', 'gast-favorit'],
  );
  assert.equal(savedStore.accounts['konto-a'].pending['ausstehende-entfernung'].isFavorite, false);
  assert.equal(localStorage.getItem('cupcal.bookmarks.v1'), null);
});

test('behält abgelehnte alte Einträge lokal und fragt dasselbe Konto nicht erneut', async () => {
  localStorage.setItem('cupcal.bookmarks.v1', JSON.stringify(['turnier-alt']));

  await keepAnonymousBookmarksLocal('konto-a');

  assert.deepEqual(await getAnonymousBookmarksForImport('konto-a'), []);
  assert.deepEqual(await getAnonymousBookmarksForImport('konto-b'), ['turnier-alt']);
  assert.deepEqual(await loadBookmarksForUser('konto-a'), []);
  assert.deepEqual(await loadBookmarksForUser('konto-b'), []);
  assert.deepEqual(await loadBookmarksForUser(null), ['turnier-alt']);
});

test('übernimmt keine vorhandenen Gast-Einträge bei normalen Kontoschreibvorgängen', async () => {
  localStorage.setItem('cupcal.bookmarks.v1', JSON.stringify(['gast-eintrag']));

  await setBookmarksFavorite('konto-a', ['konto-eintrag'], true);

  assert.deepEqual(await loadBookmarksForUser('konto-a'), ['konto-eintrag']);
  assert.deepEqual(await loadAnonymousBookmarks(), ['gast-eintrag']);
  const pending = await prepareBookmarksForSync('konto-a');
  assert.deepEqual(Object.keys(pending), ['konto-eintrag']);
  assert.equal(pending['konto-eintrag'].isFavorite, true);
  assert.equal(typeof pending['konto-eintrag'].updatedAt, 'string');
});

test('gleiche Zeitstempel entscheiden nicht über die lokal gespeicherte Absicht', async () => {
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

  await setBookmarksFavorite('konto-a', [eventId], true);
  const laterFavorite = (await prepareBookmarksForSync('konto-a'))[eventId];
  const remoteRemoval = {
    ...simultaneousFavorite,
    is_favorite: false,
  };
  assert.equal(shouldUploadBookmarkChange(laterFavorite, remoteRemoval), true);
  const stillPending = await reconcileBookmarks('konto-a', [remoteRemoval]);
  assert.deepEqual(stillPending.eventIds, [eventId]);
  assert.equal(stillPending.pendingCount, 1);

  const resolved = await reconcileBookmarks('konto-a', [{
    ...simultaneousFavorite,
    is_favorite: true,
  }]);
  assert.deepEqual(resolved.eventIds, [eventId]);
  assert.equal(resolved.pendingCount, 0);
});

test('synchronisiert Änderungen trotz vor- oder nachgehender Geräteuhr', async () => {
  const realNow = Date.now;
  const cases = [
    { userId: 'uhr-geht-nach', deviceTime: 1_000, remoteTime: '2099-01-01T00:00:00.000Z' },
    { userId: 'uhr-geht-vor', deviceTime: 4_102_444_800_000, remoteTime: '2000-01-01T00:00:00.000Z' },
  ];

  try {
    for (const { userId, deviceTime, remoteTime } of cases) {
      Date.now = () => deviceTime;
      const eventId = `turnier-${userId}`;
      await setBookmarksFavorite(userId, [eventId], true);
      const change = (await prepareBookmarksForSync(userId))[eventId];
      const remote = {
        event_id: eventId,
        is_favorite: false,
        updated_at: remoteTime,
      };

      assert.equal(shouldUploadBookmarkChange(change, remote), true);
      const reconciled = await reconcileBookmarks(userId, [remote]);
      assert.deepEqual(reconciled.eventIds, [eventId]);
      assert.equal(reconciled.pendingCount, 1);
    }
  } finally {
    Date.now = realNow;
  }
});

test('behält eine neuere lokale Änderung, wenn der vorherige Sync noch aussteht', async () => {
  const eventId = 'turnier-a';
  await setBookmarksFavorite('konto-a', [eventId], true);
  const firstSyncSnapshot = await prepareBookmarksForSync('konto-a');
  assert.equal(firstSyncSnapshot[eventId].isFavorite, true);

  await setBookmarksFavorite('konto-a', [eventId], false);
  const nextSyncSnapshot = await prepareBookmarksForSync('konto-a');
  assert.equal(nextSyncSnapshot[eventId].isFavorite, false);

  const stillPending = await reconcileBookmarks('konto-a', [{
    event_id: eventId,
    is_favorite: true,
    updated_at: firstSyncSnapshot[eventId].updatedAt,
    revision: 1,
  }]);
  assert.deepEqual(stillPending.eventIds, []);
  assert.equal(stillPending.pendingCount, 1);
  assert.equal((await prepareBookmarksForSync('konto-a'))[eventId].isFavorite, false);
});

test('behält aktuelle Änderungen mehrerer Turniere bis zur jeweiligen Serverbestätigung', async () => {
  await setBookmarksFavorite('konto-a', ['turnier-a'], true);
  await setBookmarksFavorite('konto-a', ['turnier-b'], false);
  const firstSyncSnapshot = await prepareBookmarksForSync('konto-a');

  await setBookmarksFavorite('konto-a', ['turnier-a'], false);
  await setBookmarksFavorite('konto-a', ['turnier-b'], true);

  const staleRemote = await reconcileBookmarks('konto-a', [
    { event_id: 'turnier-a', is_favorite: true, updated_at: firstSyncSnapshot['turnier-a'].updatedAt, revision: 1 },
    { event_id: 'turnier-b', is_favorite: false, updated_at: firstSyncSnapshot['turnier-b'].updatedAt, revision: 2 },
  ]);
  assert.deepEqual(staleRemote.eventIds, ['turnier-b']);
  assert.equal(staleRemote.pendingCount, 2);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(await prepareBookmarksForSync('konto-a')).map(([eventId, change]) => [
        eventId,
        change.isFavorite,
      ]),
    ),
    { 'turnier-a': false, 'turnier-b': true },
  );

  const acknowledged = await reconcileBookmarks('konto-a', [
    { event_id: 'turnier-a', is_favorite: false, updated_at: '2026-01-02T00:00:00.000Z', revision: 3 },
    { event_id: 'turnier-b', is_favorite: true, updated_at: '2026-01-02T00:00:00.000Z', revision: 4 },
  ]);
  assert.deepEqual(acknowledged.eventIds, ['turnier-b']);
  assert.equal(acknowledged.pendingCount, 0);
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

test('entfernt gelöschte Kontofavoriten dauerhaft, ohne andere lokale Listen zu verändern', async () => {
  localStorage.setItem('cupcal.bookmarks.v1', JSON.stringify(['gast-favorit']));
  await setBookmarksFavorite('gelöschtes-konto', ['alter-favorit'], true);
  await prepareBookmarksForSync('gelöschtes-konto');
  await setBookmarksFavorite('weiteres-konto', ['anderer-favorit'], true);

  await removeBookmarksForDeletedUser('gelöschtes-konto');

  const savedStore = JSON.parse(localStorage.getItem('cupcal.bookmarks.v2'));
  assert.equal(savedStore.accounts['gelöschtes-konto'], undefined);
  assert.deepEqual(await loadBookmarksForUser('gelöschtes-konto'), []);
  assert.deepEqual(await loadBookmarksForUser('weiteres-konto'), ['anderer-favorit']);
  assert.deepEqual(await loadBookmarksForUser(null), ['gast-favorit']);

  // Ein verspäteter Sync darf den gelöschten Kontoeintrag nicht wiederherstellen.
  await reconcileBookmarks('gelöschtes-konto', [{
    event_id: 'alter-favorit',
    is_favorite: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    revision: 1,
  }]);
  assert.equal(JSON.parse(localStorage.getItem('cupcal.bookmarks.v2')).accounts['gelöschtes-konto'], undefined);
  assert.deepEqual(await loadBookmarksForUser('gelöschtes-konto'), []);
});
