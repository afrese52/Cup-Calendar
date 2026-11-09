import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TournamentEvent } from '@/data/events';

const WEB_CACHE_KEY = 'cupcal.events.v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface WebEventCache {
  savedAt: number;
  events: TournamentEvent[];
}

function isEvent(value: unknown): value is TournamentEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    typeof event.title === 'string' &&
    typeof event.description === 'string' &&
    typeof event.region === 'string' &&
    typeof event.gameMode === 'string' &&
    typeof event.teamFormat === 'string' &&
    typeof event.tournamentType === 'string' &&
    typeof event.category === 'string' &&
    typeof event.startTime === 'string' &&
    typeof event.endTime === 'string' &&
    typeof event.featured === 'boolean'
  );
}

async function readWebEvents(): Promise<TournamentEvent[] | null> {
  const stored = await AsyncStorage.getItem(WEB_CACHE_KEY);
  if (!stored) return null;

  let cache: WebEventCache;
  try {
    cache = JSON.parse(stored) as WebEventCache;
  } catch {
    await AsyncStorage.removeItem(WEB_CACHE_KEY);
    return null;
  }

  if (
    !cache ||
    typeof cache.savedAt !== 'number' ||
    !Array.isArray(cache.events)
  ) {
    await AsyncStorage.removeItem(WEB_CACHE_KEY);
    return null;
  }

  if (Date.now() - cache.savedAt > CACHE_TTL_MS) return [];
  return cache.events.filter(isEvent);
}

export async function loadCachedEvents(): Promise<TournamentEvent[] | null> {
  return readWebEvents();
}

export async function saveEventsToCache(events: TournamentEvent[]): Promise<void> {
  const savedAt = Date.now();
  const existing = (await readWebEvents()) ?? [];
  const merged = new Map(existing.map((event) => [event.id, event]));
  for (const event of events) merged.set(event.id, event);
  const cache: WebEventCache = { savedAt, events: [...merged.values()] };
  await AsyncStorage.setItem(WEB_CACHE_KEY, JSON.stringify(cache));
}
