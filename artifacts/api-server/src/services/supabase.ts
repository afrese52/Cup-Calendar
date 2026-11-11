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
