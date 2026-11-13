import type { Session, SupabaseClient } from '@supabase/supabase-js';

type DeletionAuth = Pick<SupabaseClient['auth'], 'signInWithOtp'>;

export async function requestAccountDeletionConfirmation(
  auth: DeletionAuth,
  email: string,
  redirectTo: string,
): Promise<void> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) throw new Error('Für dieses Konto ist keine E-Mail-Adresse hinterlegt.');
  if (!redirectTo) throw new Error('Der Rücksprung für den Bestätigungslink fehlt.');

  const { error } = await auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export type AuthCallbackParams = {
  code?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  flowId?: string | null;
  flow?: string | null;
  deletionToken?: string | null;
  error?: string | null;
  errorDescription?: string | null;
};

export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  try {
    const parsed = new URL(url);
    const query = parsed.searchParams;
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, '').replace(/^\?/, ''));
    const read = (...keys: string[]) => {
      for (const key of keys) {
        const value = query.get(key) ?? hash.get(key);
        if (value) return value;
      }
      return null;
    };
    return {
      code: read('code'),
      accessToken: read('access_token'),
      refreshToken: read('refresh_token'),
      flowId: read('sb_flow_id', 'flow_id'),
      flow: read('flow'),
      deletionToken: read('deletion_token'),
      error: read('error', 'error_code'),
      errorDescription: read('error_description'),
    };
  } catch {
    return {};
  }
}

type CallbackAuth = Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'setSession'>;

export async function establishAuthCallbackSession(
  auth: CallbackAuth,
  params: AuthCallbackParams,
): Promise<Session> {
  if (params.code) {
    const { data, error } = await auth.exchangeCodeForSession(
      params.code,
      params.flowId ? { flowId: params.flowId } : undefined,
    );
    if (error) throw error;
    if (!data.session) throw new Error('Es wurde keine gültige Sitzung erstellt.');
    return data.session;
  }

  if (!params.accessToken || !params.refreshToken) {
    throw new Error('Der Bestätigungslink enthält keine gültige Sitzung.');
  }
  const { data, error } = await auth.setSession({
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Es wurde keine gültige Sitzung erstellt.');
  return data.session;
}
