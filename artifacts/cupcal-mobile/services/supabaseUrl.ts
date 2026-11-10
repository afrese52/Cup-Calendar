const SUPABASE_API_PATH_SUFFIX = /\/(?:auth|rest|storage|functions)\/v1$/i;

export function normalizeSupabaseBaseUrl(value: string): string {
  const withoutTrailingSlashes = value.trim().replace(/\/+$/, '');
  return withoutTrailingSlashes.replace(SUPABASE_API_PATH_SUFFIX, '');
}
