export type IcsImportIssue = {
  id: string | null;
  title: string | null;
  errors: string[];
};

export type IcsImportSchedule = {
  sourceUrl: null;
  snapshotAt: string;
  snapshotAgeMs: number;
  isSnapshotStale: false;
  region: string;
  timeZone: string;
  cardCount: number;
  validCount: number;
  invalidCount: number;
  upcomingAtSnapshot: number;
  events: {
    id: string;
    title: string;
    description: string;
    poster_url: string | null;
    region: string;
    game_mode: string;
    game_ruleset: string | null;
    tournament_series: string | null;
    team_format: string;
    tournament_type: string;
    category: string;
    start_time: string;
    end_time: string;
    is_featured: boolean;
    review_warnings: string[];
  }[];
  issues: IcsImportIssue[];
};

export function parseIcsSchedule(
  text: string,
  options?: { region?: string; timeZone?: string },
): IcsImportSchedule;
