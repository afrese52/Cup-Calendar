import { createClient } from '@supabase/supabase-js';

type SessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export function createCupCalSupabaseClient(
  url: string,
  publishableKey: string,
  storage: SessionStorage,
  fetchImpl?: typeof fetch,
) {
  return createClient(url, publishableKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}
