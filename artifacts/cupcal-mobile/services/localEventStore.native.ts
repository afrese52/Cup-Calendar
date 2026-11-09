import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { TournamentEvent } from '@/data/events';

const DATABASE_NAME = 'cupcal_offline.db';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedEventRow {
  id: string;
  title: string;
  description: string;
  region: TournamentEvent['region'];
  game_mode: TournamentEvent['gameMode'];
  team_format: TournamentEvent['teamFormat'];
  tournament_type: TournamentEvent['tournamentType'];
  category: TournamentEvent['category'];
  start_time: string;
  end_time: string;
  featured: number;
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await openDatabaseAsync(DATABASE_NAME);
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS events (
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
        CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
        CREATE TABLE IF NOT EXISTS cache_metadata (
          id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
          updated_at INTEGER NOT NULL
        );
      `);
      await database.runAsync("DELETE FROM events WHERE id LIKE 'preview-%'");
      return database;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function mapRow(row: CachedEventRow): TournamentEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    region: row.region,
    gameMode: row.game_mode,
    teamFormat: row.team_format,
    tournamentType: row.tournament_type,
    category: row.category,
    startTime: row.start_time,
    endTime: row.end_time,
    featured: row.featured === 1,
  };
}

export async function loadCachedEvents(): Promise<TournamentEvent[] | null> {
  const database = await getDatabase();
  const metadata = await database.getFirstAsync<{ updated_at: number }>(
    'SELECT updated_at FROM cache_metadata WHERE id = 1',
  );
  if (!metadata) return null;

  const expirationCutoff = Date.now() - CACHE_TTL_MS;
  await database.runAsync('DELETE FROM events WHERE cached_at < ?', expirationCutoff);
  if (Date.now() - metadata.updated_at > CACHE_TTL_MS) return [];

  const rows = await database.getAllAsync<CachedEventRow>(
    "SELECT * FROM events WHERE id NOT LIKE 'preview-%' ORDER BY start_time ASC",
  );
  return rows.map(mapRow);
}

export async function saveEventsToCache(events: TournamentEvent[]): Promise<void> {
  const database = await getDatabase();
  const savedAt = Date.now();

  await database.withTransactionAsync(async () => {
    for (const event of events) {
      await database.runAsync(
        `INSERT INTO events (
          id, title, description, region, game_mode, team_format,
          tournament_type, category, start_time, end_time, featured, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          region = excluded.region,
          game_mode = excluded.game_mode,
          team_format = excluded.team_format,
          tournament_type = excluded.tournament_type,
          category = excluded.category,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          featured = excluded.featured,
          cached_at = excluded.cached_at`,
        [
          event.id,
          event.title,
          event.description,
          event.region,
          event.gameMode,
          event.teamFormat,
          event.tournamentType,
          event.category,
          event.startTime,
          event.endTime,
          event.featured ? 1 : 0,
          savedAt,
        ],
      );
    }

    await database.runAsync(
      `INSERT INTO cache_metadata (id, updated_at) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      savedAt,
    );
  });
}
