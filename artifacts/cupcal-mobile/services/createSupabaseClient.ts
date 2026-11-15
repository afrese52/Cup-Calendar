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
  const sessionStorage: SessionStorage = {
    ...storage,
    getItem: async (key) => {
      const value = await storage.getItem(key);
      if (value === null || !key.endsWith('-auth-token')) return value;

      try {
        JSON.parse(value);
        return value;
      } catch {
        // A malformed persisted session must never block startup or be logged.
        // Cleanup is best-effort; this read still fails closed if removal fails.
        try {
          await storage.removeItem(key);
        } catch {
          // Supabase will continue with no session for this read.
        }
        return null;
      }
    },
  };

  return createClient(url, publishableKey, {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      experimental: {
        appendPkceFlowIdToRedirects: true,
      },
    },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}
