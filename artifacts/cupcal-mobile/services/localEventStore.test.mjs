import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createLocalEventStore } from './localEventStoreCore.ts';

function createSQLiteAdapter(database) {
  const bindings = (params) => params === undefined
    ? []
    : Array.isArray(params) ? params : [params];

  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async getAllAsync(sql, params) {
      return database.prepare(sql).all(...bindings(params));
    },
    async getFirstAsync(sql, params) {
      return database.prepare(sql).get(...bindings(params));
    },
    async runAsync(sql, params) {
      return database.prepare(sql).run(...bindings(params));
    },
    async withTransactionAsync(callback) {
      database.exec('BEGIN');
      try {
        await callback();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function createLegacyDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      region TEXT NOT NULL,
      game_mode TEXT NOT NULL,
      team_format TEXT NOT NULL,
      tournament_type TEXT NOT NULL,
      category TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      featured INTEGER NOT NULL DEFAULT 0,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE cache_metadata (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      updated_at INTEGER NOT NULL
    );
  `);

  const now = Date.now();
  const futureStart = new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString();
  const futureEnd = new Date(now + 8 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString();
  const pastStart = new Date(now - 4 * 60 * 60 * 1000).toISOString();
  const pastEnd = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  database.prepare(`
    INSERT INTO events (
      id, title, description, region, game_mode, team_format, tournament_type,
      category, start_time, end_time, featured, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'legacy-event',
    'Alter Offline-Termin',
    'Vor der Spaltenmigration gespeichert',
    'EU',
    'Battle Royale',
    'Duos',
    'FNCS',
    'Turnier',
    futureStart,
    futureEnd,
    1,
    now,
  );
  database.prepare(`
    INSERT INTO events (
      id, title, description, region, game_mode, team_format, tournament_type,
      category, start_time, end_time, featured, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'expired-event',
    'Abgelaufener Offline-Termin',
    'Ist nicht mehr verfügbar',
    'EU',
    'Battle Royale',
    'Solo',
    'Cash Cup',
    'Turnier',
    pastStart,
    pastEnd,
    0,
    now,
  );
  database.prepare('INSERT INTO cache_metadata (id, updated_at) VALUES (1, ?)').run(now);

  return { database, futureStart, futureEnd, now };
}

test('migriert alte Offline-Kalender ohne Datenverlust und speichert neue Werte', async () => {
  const { database, futureStart, futureEnd, now } = createLegacyDatabase();
  const { loadCachedEvents, saveEventsToCache } = createLocalEventStore(
    async () => createSQLiteAdapter(database),
  );

  const legacyEvents = await loadCachedEvents();
  assert.deepEqual(legacyEvents, [{
    id: 'legacy-event',
    title: 'Alter Offline-Termin',
    description: 'Vor der Spaltenmigration gespeichert',
    region: 'EU',
    gameMode: 'Battle Royale',
    gameRuleset: null,
    tournamentSeries: null,
    teamFormat: 'Duos',
    tournamentType: 'FNCS',
    category: 'Turnier',
    startTime: futureStart,
    endTime: futureEnd,
    featured: true,
  }]);
  assert.deepEqual(
    database.prepare('PRAGMA table_info(events)').all().map((column) => column.name)
      .filter((name) => ['game_ruleset', 'tournament_series'].includes(name)).sort(),
    ['game_ruleset', 'tournament_series'],
  );
  assert.equal(database.prepare('SELECT id FROM events WHERE id = ?').get('expired-event'), undefined);

  await saveEventsToCache([{
    id: 'reload-event',
    title: 'Reload-Cup',
    description: 'Neuer Termin mit getrennten Regelwerkswerten',
    region: 'NAE',
    gameMode: 'Reload',
    gameRuleset: 'Battle Royale',
    tournamentSeries: 'Reload',
    teamFormat: 'Duos',
    tournamentType: 'Cash Cup',
    category: 'Turnier',
    startTime: new Date(now + 9 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(now + 9 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    featured: false,
  }]);

  const reloadedEvents = await loadCachedEvents();
  assert.equal(reloadedEvents.length, 2);
  assert.equal(reloadedEvents[0].id, 'legacy-event');
  assert.equal(reloadedEvents[1].id, 'reload-event');
  assert.equal(reloadedEvents[1].gameRuleset, 'Battle Royale');
  assert.equal(reloadedEvents[1].tournamentSeries, 'Reload');

  database.close();
});
