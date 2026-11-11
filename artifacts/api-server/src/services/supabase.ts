import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export interface MhtImportEvent {
  id: string;
  title: string;
  region: string;
  game_mode: string;
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

export interface MhtImportHistoryEntry {
  id: number;
  imported_at: string;
  admin_user_id: string;
  admin_email: string;
  source_hint: string | null;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
}

export interface MhtImportHistoryInput {
  adminUserId: string;
  adminEmail: string;
  sourceHint: string | null;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
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
    .select("id, imported_at, admin_user_id, admin_email, source_hint, inserted_count, updated_count, skipped_count")
    .order("imported_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error("Die Importhistorie konnte nicht geladen werden.");
  }
  return (data ?? []) as MhtImportHistoryEntry[];
}
