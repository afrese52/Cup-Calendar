import { createClient } from '@supabase/supabase-js';
import { getRateLimitRetryAfterSeconds } from './accountAuth.ts';

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

  const baseFetch = fetchImpl ?? globalThis.fetch;
  const fetchWithRetryAfter: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    const retryAfterSeconds = response.status === 429
      ? getRateLimitRetryAfterSeconds({ headers: response.headers })
      : null;
    if (retryAfterSeconds !== null) {
      const readJson = response.json.bind(response);
      Object.defineProperty(response, 'json', {
        configurable: true,
        value: async () => {
          const body: unknown = await readJson();
          if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
          const errorBody = body as Record<string, unknown>;
          const messageKey = ['msg', 'message', 'error_description', 'error']
            .find((key) => typeof errorBody[key] === 'string') ?? 'message';
          return {
            ...errorBody,
            [messageKey]: `${typeof errorBody[messageKey] === 'string' ? errorBody[messageKey] : 'Anfrage gedrosselt'} retry after ${retryAfterSeconds} seconds`,
          };
        },
      });
    }
    return response;
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
    global: { fetch: fetchWithRetryAfter },
  });
}
