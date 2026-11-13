export interface ParsedMhtEvent {
  id: string;
  title: string;
  description: string;
  poster_url: string | null;
  region: string;
  game_mode: "Battle Royale" | "Zero Build" | "Reload" | "Community";
  team_format: "Solo" | "Duos" | "Trios" | "Squads";
  tournament_type: "FNCS" | "Cash Cup" | "Ranked Cup" | "Community";
  category: "Turnier" | "Liga" | "Qualifikation" | "Trainingsrunde";
  start_time: string;
  end_time: string;
  is_featured: boolean;
  review_warnings: string[];
}

export interface ParsedMhtIssue {
  anchorId?: string;
  id?: string;
  title?: string;
  errors: string[];
}

export interface ParsedMhtSchedule {
  sourceUrl: string | null;
  snapshotAt: string | null;
  snapshotAgeMs: number | null;
  isSnapshotStale: boolean;
  region: string;
  timeZone: string;
  cardCount: number;
  validCount: number;
  invalidCount: number;
  upcomingAtSnapshot: number | null;
  events: ParsedMhtEvent[];
  issues: ParsedMhtIssue[];
}

export const MAX_SNAPSHOT_AGE_MS: number;

export function getSnapshotFreshness(
  snapshotAt: string | null,
  now?: Date | number,
): { snapshotAgeMs: number | null; isSnapshotStale: boolean };

export function parseMhtSchedule(
  buffer: Uint8Array,
  options?: { timeZone?: string; region?: string | null; now?: Date | number },
): ParsedMhtSchedule;

export function mapTeamFormat(
  cardText: string,
): "Solo" | "Duos" | "Trios" | "Squads" | null;
