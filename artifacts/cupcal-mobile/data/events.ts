export type TournamentRegion = 'EU' | 'NAE' | 'NAW' | 'BR' | 'ASIA' | 'OCE' | 'ME' | 'GLOBAL';
export type TournamentMode = 'Battle Royale' | 'Zero Build' | 'Reload' | 'Community';
export type TournamentRuleset = 'Battle Royale' | 'Zero Build' | 'Community';
export type TournamentSeries = 'Reload';
export type TournamentType = 'FNCS' | 'Cash Cup' | 'Ranked Cup' | 'Community';
export type TeamFormat = 'Solo' | 'Duos' | 'Trios' | 'Squads';
export type EventCategory = 'Turnier' | 'Liga' | 'Qualifikation' | 'Trainingsrunde';
export type CalendarCategoryFilter = 'Alle Termine' | EventCategory;
export type CalendarGameFeatureFilter = 'Alle Spielmerkmale' | 'Reload' | 'Zero Build';

export interface TournamentEvent {
  id: string;
  title: string;
  description: string;
  region: TournamentRegion;
  gameMode: TournamentMode;
  gameRuleset?: TournamentRuleset | null;
  tournamentSeries?: TournamentSeries | null;
  teamFormat: TeamFormat;
  tournamentType: TournamentType;
  category: EventCategory;
  startTime: string;
  endTime: string;
  featured: boolean;
}

export function matchesEventFilter(
  event: TournamentEvent,
  categoryFilter: CalendarCategoryFilter,
  gameFeatureFilter: CalendarGameFeatureFilter = 'Alle Spielmerkmale',
): boolean {
  const matchesCategory =
    categoryFilter === 'Alle Termine' || event.category === categoryFilter;
  const matchesGameFeature =
    gameFeatureFilter === 'Alle Spielmerkmale' ||
    (gameFeatureFilter === 'Reload' &&
      (event.tournamentSeries === 'Reload' || event.gameMode === 'Reload')) ||
    (gameFeatureFilter === 'Zero Build' &&
      (event.gameRuleset === 'Zero Build' ||
        (!event.gameRuleset && event.gameMode === 'Zero Build')));

  return matchesCategory && matchesGameFeature;
}

export function toLocalDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function upcoming(hoursAhead: number): string {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

function endAfter(startTime: string, hours = 3): string {
  return new Date(new Date(startTime).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function sampleEvent(
  id: string,
  title: string,
  description: string,
  region: TournamentRegion,
  gameMode: TournamentMode,
  teamFormat: TeamFormat,
  tournamentType: TournamentType,
  category: EventCategory,
  hoursAhead: number,
  featured = false,
): TournamentEvent {
  const startTime = upcoming(hoursAhead);
  return {
    id,
    title,
    description,
    region,
    gameMode,
    gameRuleset: gameMode === 'Reload' ? 'Battle Royale' : gameMode,
    tournamentSeries: gameMode === 'Reload' ? 'Reload' : null,
    teamFormat,
    tournamentType,
    category,
    startTime,
    endTime: endAfter(startTime),
    featured,
  };
}

// Clearly labelled sample entries keep the first-run preview useful until a live
// tournament source is connected.
export const sampleEvents: TournamentEvent[] = [
  sampleEvent(
    'preview-fncs-eu-duos',
    'FNCS Challenger Cup',
    'Beispieltermin für ein Duos-Turnier in der EU-Region.',
    'EU',
    'Battle Royale',
    'Duos',
    'FNCS',
    'Turnier',
    9,
    true,
  ),
  sampleEvent(
    'preview-cash-eu-solo',
    'Victory Cash Cup',
    'Beispieltermin für einen Solo-Cash-Cup.',
    'EU',
    'Zero Build',
    'Solo',
    'Cash Cup',
    'Turnier',
    26,
  ),
  sampleEvent(
    'preview-reload-nae-duos',
    'Reload Ligaabend',
    'Beispieltermin für eine Liga-Runde in Reload.',
    'NAE',
    'Reload',
    'Duos',
    'Community',
    'Liga',
    40,
  ),
  sampleEvent(
    'preview-ranked-eu-solo',
    'Ranked Victory Cup',
    'Beispieltermin für einen Ranked-Cup in der EU-Region.',
    'EU',
    'Battle Royale',
    'Solo',
    'Ranked Cup',
    'Qualifikation',
    55,
  ),
  sampleEvent(
    'preview-community-global-trios',
    'Community Scrim',
    'Beispieltermin für ein Community-Event mit drei Spielern.',
    'GLOBAL',
    'Community',
    'Trios',
    'Community',
    'Trainingsrunde',
    76,
  ),
];
