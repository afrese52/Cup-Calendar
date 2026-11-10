import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

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
