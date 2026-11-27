import AsyncStorage from '@react-native-async-storage/async-storage';
import { calendarRegionFilters, type CalendarRegionFilter } from '../data/events.ts';

const REGION_PREFERENCE_KEY = 'cupcal.calendar-region-filter.v1';
const LOCATION_DISCLOSURE_KEY = 'cupcal.location-disclosure-shown.v1';
const storage = (AsyncStorage as typeof AsyncStorage & { default?: typeof AsyncStorage }).default
  ?? AsyncStorage;

export type CalendarRegionPreference = {
  region: CalendarRegionFilter;
  source: 'automatic' | 'manual';
};

function isCalendarRegionFilter(value: unknown): value is CalendarRegionFilter {
  return (
    typeof value === 'string' &&
    calendarRegionFilters.includes(value as CalendarRegionFilter)
  );
}

export async function loadCalendarRegionPreference(): Promise<CalendarRegionPreference | null> {
  const raw = await storage.getItem(REGION_PREFERENCE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('region' in parsed) ||
      !('source' in parsed) ||
      !isCalendarRegionFilter(parsed.region) ||
      (parsed.source !== 'automatic' && parsed.source !== 'manual') ||
      (parsed.source === 'automatic' && parsed.region === 'Alle Regionen')
    ) {
      return null;
    }

    return {
      region: parsed.region,
      source: parsed.source,
    };
  } catch {
    return null;
  }
}

export async function saveCalendarRegionPreference(
  preference: CalendarRegionPreference,
  storageApi: Pick<typeof storage, 'setItem'> = storage,
): Promise<void> {
  await storageApi.setItem(
    REGION_PREFERENCE_KEY,
    JSON.stringify({
      region: preference.region,
      source: preference.source,
    }),
  );
}

export async function hasSeenLocationDisclosure(): Promise<boolean> {
  return (await storage.getItem(LOCATION_DISCLOSURE_KEY)) === 'true';
}

export async function saveLocationDisclosureShown(): Promise<void> {
  await storage.setItem(LOCATION_DISCLOSURE_KEY, 'true');
}
