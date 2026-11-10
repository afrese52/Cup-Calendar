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
  title?: string;
  errors: string[];
}

export interface ParsedMhtSchedule {
  sourceUrl: string | null;
  snapshotAt: string | null;
  region: string;
  timeZone: string;
  cardCount: number;
  validCount: number;
  invalidCount: number;
  upcomingAtSnapshot: number | null;
  events: ParsedMhtEvent[];
  issues: ParsedMhtIssue[];
}

export function parseMhtSchedule(
  buffer: Uint8Array,
  options?: { timeZone?: string; region?: string | null },
): ParsedMhtSchedule;
