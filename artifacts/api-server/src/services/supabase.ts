import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export interface MhtImportEvent {
  id: string;
  title: string;
  region: string;
  game_mode: string;
  game_ruleset: string | null;
  tournament_series: string | null;
  team_format: string;
  tournament_type: string;
  category: string;
  start_time: string;
  end_time: string;
  description: string;
  poster_url: string | null;
  is_featured: boolean;
  review_warnings: string[];
}

export interface ExistingMhtEvent {
  title: string;
  game_mode: string;
  game_ruleset: string | null;
  tournament_series: string | null;
  team_format: string;
  tournament_type: string;
  category: string;
  start_time: string;
  end_time: string;
}

export function isMissingEventMetadataColumns(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  if (candidate.code !== "42703") return false;
  const diagnostic = `${candidate.message ?? ""} ${candidate.details ?? ""}`;
  return /game_ruleset|tournament_series/.test(diagnostic);
}

export class EventMetadataMigrationRequiredError extends Error {
  constructor() {
    super("Die Datenbank benötigt zuerst die Migration für Turnierserie und Regelwerk.");
    this.name = "EventMetadataMigrationRequiredError";
  }
}

export function getMhtEventChanges(
  event: Pick<
    MhtImportEvent,
    | "title"
    | "game_mode"
    | "game_ruleset"
    | "tournament_series"
    | "team_format"
    | "tournament_type"
    | "category"
    | "start_time"
    | "end_time"
  >,
  existing: ExistingMhtEvent | null,
): {
  previousTitle: string | null;
  previousGameMode: string | null;
  previousGameRuleset: string | null;
  previousTournamentSeries: string | null;
  previousTeamFormat: string | null;
  previousTournamentType: string | null;
  previousCategory: string | null;
  previousStartTime: string | null;
  previousEndTime: string | null;
} {
  if (!existing) {
    return {
      previousTitle: null,
      previousGameMode: null,
      previousGameRuleset: null,
      previousTournamentSeries: null,
      previousTeamFormat: null,
      previousTournamentType: null,
      previousCategory: null,
      previousStartTime: null,
      previousEndTime: null,
    };
  }

  return {
    previousTitle: existing.title === event.title ? null : existing.title,
    previousGameMode: existing.game_mode === event.game_mode ? null : existing.game_mode,
    previousGameRuleset: existing.game_ruleset === event.game_ruleset
      ? null
      : existing.game_ruleset ?? "Nicht angegeben",
    previousTournamentSeries: existing.tournament_series === event.tournament_series
      ? null
      : existing.tournament_series ?? "Keine",
    previousTeamFormat: existing.team_format === event.team_format ? null : existing.team_format,
    previousTournamentType: existing.tournament_type === event.tournament_type
      ? null
      : existing.tournament_type,
    previousCategory: existing.category === event.category ? null : existing.category,
    previousStartTime: Date.parse(existing.start_time) === Date.parse(event.start_time)
      ? null
      : existing.start_time,
    previousEndTime: Date.parse(existing.end_time) === Date.parse(event.end_time)
      ? null
      : existing.end_time,
  };
}

export interface MhtImportHistoryEntry {
  id: number;
  importedAt: string;
  adminUserId: string;
  adminEmail: string;
  sourceHint: string | null;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedWarningCount: number | null;
  skippedPastCount: number | null;
  skippedInvalidCount: number | null;
}

export interface MhtImportHistoryInput {
  adminUserId: string;
  adminEmail: string;
  sourceHint: string | null;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  skippedWarningCount: number;
  skippedPastCount: number;
  skippedInvalidCount: number;
}

export class ImportHistoryWriteError extends Error {
  constructor() {
    super("Der Import wurde gespeichert, aber die Historie konnte nicht geschrieben werden.");
    this.name = "ImportHistoryWriteError";
  }
}

const SUPABASE_API_PATH_SUFFIX = /\/(?:auth|rest|storage|functions)\/v1$/i;

export function normalizeSupabaseBaseUrl(value: string): string {
  const withoutTrailingSlashes = value.trim().replace(/\/+$/, "");
  return withoutTrailingSlashes.replace(SUPABASE_API_PATH_SUFFIX, "");
}

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const configuredUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!configuredUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.");
  }

  const url = normalizeSupabaseBaseUrl(configuredUrl);
  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function buildMhtEventUpsertRows(events: MhtImportEvent[]) {
  return events
    .filter((event) => event.review_warnings.length === 0)
    .map((event) => ({
      id: event.id,
      title: event.title,
      region: event.region,
      game_mode: event.game_mode,
      game_ruleset: event.game_ruleset,
      tournament_series: event.tournament_series,
      team_format: event.team_format,
      tournament_type: event.tournament_type,
      category: event.category,
      start_time: event.start_time,
      end_time: event.end_time,
      updated_at: new Date().toISOString(),
    }));
}

export async function upsertMhtEvents(
  events: MhtImportEvent[],
  admin: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const rows = buildMhtEventUpsertRows(events);
  if (rows.length === 0) return;

  const { error } = await admin
    .from("fortnite_events")
    .upsert(rows, { onConflict: "id", defaultToNull: false });
  if (error) {
    if (isMissingEventMetadataColumns(error)) {
      throw new EventMetadataMigrationRequiredError();
    }
    // Do not expose provider error payloads, which may contain sensitive values.
    throw new Error("Die geprüften Termine konnten nicht gespeichert werden.");
  }
}

export async function recordMhtImportHistory(
  input: MhtImportHistoryInput,
  admin: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await admin
    .from("admin_import_history")
    .insert({
      admin_user_id: input.adminUserId,
      admin_email: input.adminEmail,
      source_hint: input.sourceHint,
      inserted_count: input.insertedCount,
      updated_count: input.updatedCount,
      skipped_count: input.skippedCount,
      skipped_warning_count: input.skippedWarningCount,
      skipped_past_count: input.skippedPastCount,
      skipped_invalid_count: input.skippedInvalidCount,
    });
  if (error) {
    throw new ImportHistoryWriteError();
  }
}

export async function listRecentMhtImports(
  limit = 20,
  admin: SupabaseClient = getSupabaseAdmin(),
): Promise<MhtImportHistoryEntry[]> {
  const { data, error } = await admin
    .from("admin_import_history")
    .select("id, imported_at, admin_user_id, admin_email, source_hint, inserted_count, updated_count, skipped_count, skipped_warning_count, skipped_past_count, skipped_invalid_count")
    .order("imported_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error("Die Importhistorie konnte nicht geladen werden.");
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    importedAt: row.imported_at,
    adminUserId: row.admin_user_id,
    adminEmail: row.admin_email,
    sourceHint: row.source_hint,
    insertedCount: row.inserted_count,
    updatedCount: row.updated_count,
    skippedCount: row.skipped_count,
    // Older rows predate the breakdown and keep NULL for these columns.
    skippedWarningCount: row.skipped_warning_count ?? null,
    skippedPastCount: row.skipped_past_count ?? null,
    skippedInvalidCount: row.skipped_invalid_count ?? null,
  }));
}
