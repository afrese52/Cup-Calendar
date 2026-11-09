import { z } from "zod";
import { logger } from "../lib/logger";
import { getSupabaseAdmin } from "./supabase";

const REGION_VALUES = ["EU", "NAE", "NAW", "BR", "ASIA", "OCE", "ME", "GLOBAL"] as const;
const GAME_MODE_VALUES = ["Battle Royale", "Zero Build", "Reload", "Community"] as const;
const TEAM_FORMAT_VALUES = ["Solo", "Duos", "Trios", "Squads"] as const;
const TOURNAMENT_TYPE_VALUES = ["FNCS", "Cash Cup", "Ranked Cup", "Community"] as const;
const CATEGORY_VALUES = ["Turnier", "Liga", "Qualifikation", "Trainingsrunde"] as const;

const DatabaseEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  poster_url: z.string().url().nullable(),
  region: z.enum(REGION_VALUES),
  game_mode: z.enum(GAME_MODE_VALUES),
  team_format: z.enum(TEAM_FORMAT_VALUES),
  tournament_type: z.enum(TOURNAMENT_TYPE_VALUES),
  category: z.enum(CATEGORY_VALUES),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  is_featured: z.boolean(),
});

type DatabaseEvent = z.infer<typeof DatabaseEventSchema>;
type TournamentRegion = DatabaseEvent["region"];
type TournamentMode = DatabaseEvent["game_mode"];
type TeamFormat = DatabaseEvent["team_format"];
type TournamentType = DatabaseEvent["tournament_type"];
type EventCategory = DatabaseEvent["category"];

export interface TournamentSyncStatus {
  state: "unknown" | "running" | "ok" | "failed";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
}

let syncStatus: TournamentSyncStatus = {
  state: "unknown",
  lastAttemptAt: null,
  lastSuccessAt: null,
};

export function getTournamentSyncStatus(): TournamentSyncStatus {
  return { ...syncStatus };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getText(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getNestedText(
  record: Record<string, unknown>,
  nestedKey: string,
  ...keys: string[]
): string | null {
  const nested = asRecord(record[nestedKey]);
  return nested ? getText(nested, ...keys) : null;
}

function getRegionText(record: Record<string, unknown>): string {
  const region = record["region"] ?? record["regions"];
  if (typeof region === "string") return region;
  if (Array.isArray(region)) {
    const first = region.find((value): value is string => typeof value === "string");
    if (first) return first;
  }
  return "GLOBAL";
}

function mapRegion(value: string): TournamentRegion {
  const normalized = value.toUpperCase();
  if (normalized.includes("EU")) return "EU";
  if (normalized.includes("NAE") || normalized.includes("EAST")) return "NAE";
  if (normalized.includes("NAW") || normalized.includes("WEST")) return "NAW";
  if (normalized.includes("BR")) return "BR";
  if (normalized.includes("ASIA")) return "ASIA";
  if (normalized.includes("OCE")) return "OCE";
  if (normalized.includes("ME")) return "ME";
  return "GLOBAL";
}

function mapGameMode(title: string, rawMode: string | null): TournamentMode {
  const combined = `${title} ${rawMode ?? ""}`.toLowerCase();
  if (combined.includes("zero build") || combined.includes("null bauen")) return "Zero Build";
  if (combined.includes("reload")) return "Reload";
  if (combined.includes("creative") || combined.includes("community")) return "Community";
  return "Battle Royale";
}

function mapTeamFormat(rawFormat: string | null, title: string): TeamFormat {
  const combined = `${title} ${rawFormat ?? ""}`.toLowerCase();
  if (combined.includes("squad")) return "Squads";
  if (combined.includes("trio")) return "Trios";
  if (combined.includes("duo")) return "Duos";
  return "Solo";
}

function mapTournamentType(title: string): TournamentType {
  const upper = title.toUpperCase();
  if (upper.includes("FNCS")) return "FNCS";
  if (upper.includes("CASH CUP") || upper.includes("VICTORY CUP")) return "Cash Cup";
  if (upper.includes("RANKED")) return "Ranked Cup";
  return "Community";
}

function mapCategory(title: string, tournamentType: TournamentType): EventCategory {
  const lower = title.toLowerCase();
  if (lower.includes("qualifier") || lower.includes("qualification") || lower.includes("qualifikation")) {
    return "Qualifikation";
  }
  if (lower.includes("scrim") || lower.includes("training") || lower.includes("practice")) {
    return "Trainingsrunde";
  }
  if (tournamentType === "FNCS" && (lower.includes("league") || lower.includes("division"))) {
    return "Liga";
  }
  return "Turnier";
}

function parseExternalEvent(value: unknown): DatabaseEvent | null {
  const record = asRecord(value);
  if (!record) return null;

  const schedule = asRecord(record["schedule"]);
  const startValue =
    getText(schedule ?? {}, "beginTime", "startTime", "start_time") ??
    getText(record, "beginTime", "startTime", "start_time") ??
    getNestedText(record, "window", "beginTime", "startTime");
  const endValue =
    getText(schedule ?? {}, "endTime", "end_time") ??
    getText(record, "endTime", "end_time") ??
    getNestedText(record, "window", "endTime");
  const id = getText(record, "id", "eventId", "event_id");
  const title = getText(record, "name", "title", "eventName");

  if (!id || !title || !startValue || !endValue) return null;

  const start = new Date(startValue);
  const end = new Date(endValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return null;
  }

  const rawPoster = getText(record, "poster", "posterUrl", "poster_url");
  const posterUrl = rawPoster && z.string().url().safeParse(rawPoster).success ? rawPoster : null;
  const type = mapTournamentType(title);

  const normalized = {
    id,
    title,
    description: getText(record, "description") ?? "",
    poster_url: posterUrl,
    region: mapRegion(getRegionText(record)),
    game_mode: mapGameMode(title, getText(record, "mode", "gameMode", "game_mode")),
    team_format: mapTeamFormat(getText(record, "format", "teamFormat", "team_format"), title),
    tournament_type: type,
    category: mapCategory(title, type),
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    is_featured: false,
  };

  const parsed = DatabaseEventSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function extractEvents(payload: unknown): unknown[] {
  const root = asRecord(payload);
  const data = asRecord(root?.["data"]);
  const candidates = [root?.["events"], data?.["events"]];
  const events = candidates.find(Array.isArray);
  if (!events) throw new Error("FortniteAPI.io lieferte keine gültige events-Liste.");
  return events;
}

export async function syncTournaments(): Promise<{ synced: number; skipped: number }> {
  syncStatus = { ...syncStatus, state: "running", lastAttemptAt: new Date().toISOString() };
  try {
    const apiKey = process.env["FORTNITE_API_KEY"];
    if (!apiKey) throw new Error("FORTNITE_API_KEY ist nicht gesetzt.");

    const response = await fetch("https://fortniteapi.io/v1/events/list", {
      headers: {
        Authorization: apiKey,
        "User-Agent": "CupCal-IngestionEngine/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`FortniteAPI.io antwortete mit HTTP ${response.status}.`);
    }

    const externalEvents = extractEvents(await response.json());
    const mappedEvents: DatabaseEvent[] = [];
    let skipped = 0;

    for (const event of externalEvents) {
      const parsed = parseExternalEvent(event);
      if (parsed) mappedEvents.push(parsed);
      else skipped += 1;
    }

    if (mappedEvents.length > 0) {
      const { error } = await getSupabaseAdmin()
        .from("fortnite_events")
        .upsert(
          mappedEvents.map((event) => ({
            id: event.id,
            title: event.title,
            description: event.description,
            poster_url: event.poster_url,
            region: event.region,
            game_mode: event.game_mode,
            team_format: event.team_format,
            tournament_type: event.tournament_type,
            start_time: event.start_time,
            end_time: event.end_time,
            is_featured: event.is_featured,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" },
        );

      if (error) throw new Error(`Supabase konnte Turniere nicht speichern: ${error.message}`);
    }

    const syncedAt = new Date().toISOString();
    syncStatus = { state: "ok", lastAttemptAt: syncedAt, lastSuccessAt: syncedAt };
    logger.info({ synced: mappedEvents.length, skipped }, "Tournament sync completed");
    return { synced: mappedEvents.length, skipped };
  } catch (error) {
    syncStatus = { ...syncStatus, state: "failed" };
    throw error;
  }
}
