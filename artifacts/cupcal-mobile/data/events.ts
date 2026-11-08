export type TournamentRegion = 'EU' | 'NAE' | 'NAW' | 'BR' | 'ASIA' | 'OCE' | 'ME' | 'GLOBAL';
export type TournamentMode = 'Battle Royale' | 'Zero Build' | 'Reload' | 'Community';
export type TournamentType = 'FNCS' | 'Cash Cup' | 'Ranked Cup' | 'Community';
export type TeamFormat = 'Solo' | 'Duos' | 'Trios' | 'Squads';

export interface TournamentEvent {
  id: string;
  title: string;
  description: string;
  region: TournamentRegion;
  gameMode: TournamentMode;
  teamFormat: TeamFormat;
  tournamentType: TournamentType;
  startTime: string;
  endTime: string;
  featured: boolean;
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
    teamFormat,
    tournamentType,
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
    26,
  ),
  sampleEvent(
    'preview-reload-nae-duos',
    'Reload Cash Cup',
    'Beispieltermin für einen Reload-Cup in NAE.',
    'NAE',
    'Reload',
    'Duos',
    'Cash Cup',
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
    76,
  ),
];
