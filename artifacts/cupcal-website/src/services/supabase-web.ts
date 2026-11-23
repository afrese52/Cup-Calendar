import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const __CUPCAL_SUPABASE_URL__: string;
declare const __CUPCAL_SUPABASE_PUBLISHABLE_KEY__: string;

let client: SupabaseClient | null = null;

export function getCupCalWebSupabase(): SupabaseClient {
  if (client) return client;
  if (!__CUPCAL_SUPABASE_URL__ || !__CUPCAL_SUPABASE_PUBLISHABLE_KEY__) {
    throw new Error('Die Kontofunktion ist derzeit nicht verfügbar.');
  }

  client = createClient(__CUPCAL_SUPABASE_URL__, __CUPCAL_SUPABASE_PUBLISHABLE_KEY__, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
