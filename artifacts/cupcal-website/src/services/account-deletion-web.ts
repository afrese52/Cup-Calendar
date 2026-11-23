import type { Session, SupabaseClient } from '@supabase/supabase-js';

const ACCOUNT_DELETION_FLOW = 'cupcal-account-deletion';

type AccountDeletionWebAuth = Pick<
  SupabaseClient['auth'],
  'signInWithPassword' | 'signInWithOtp' | 'exchangeCodeForSession' | 'setSession' | 'signOut'
>;

export type AccountDeletionWebCallback = {
  flow: string | null;
  deletionToken: string | null;
  code: string | null;
  flowId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function createAccountDeletionWebRedirectUrl(origin: string, confirmationToken: string): string {
  if (!confirmationToken) throw new Error('Der Kontolöschungs-Bestätigungscode fehlt.');

  const url = new URL('/konto-loeschen/bestaetigen/', origin);
  url.searchParams.set('flow', ACCOUNT_DELETION_FLOW);
  url.searchParams.set('deletion_token', confirmationToken);
  return url.toString();
}

export function parseAccountDeletionWebCallback(url: string): AccountDeletionWebCallback {
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
      flow: read('flow'),
      deletionToken: read('deletion_token'),
      code: read('code'),
      flowId: read('sb_flow_id', 'flow_id'),
      accessToken: read('access_token'),
      refreshToken: read('refresh_token'),
      error: read('error', 'error_code'),
      errorDescription: read('error_description'),
    };
  } catch {
    return {
      flow: null,
      deletionToken: null,
      code: null,
      flowId: null,
      accessToken: null,
      refreshToken: null,
      error: null,
      errorDescription: null,
    };
  }
}

async function readApiError(response: Response, fallback: string): Promise<Error> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body
      && typeof (body as { error?: unknown }).error === 'string') {
      return new Error((body as { error: string }).error);
    }
  } catch {
    // Keep the caller-facing message stable if the API returned no JSON.
  }
  return new Error(fallback);
}

export async function requestAccountDeletionWebLink(
  auth: AccountDeletionWebAuth,
  input: {
    email: string;
    password: string;
    origin: string;
    fetchImpl?: typeof fetch;
  },
): Promise<string> {
  const email = input.email.trim();
  if (!email || !input.password) {
    throw new Error('Gib bitte E-Mail-Adresse und Passwort für dein Konto ein.');
  }

  const { data, error } = await auth.signInWithPassword({ email, password: input.password });
  const session = data.session;
  if (error || !session?.access_token) {
    throw new Error('Die Anmeldung konnte nicht bestätigt werden. Prüfe E-Mail-Adresse und Passwort.');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let requestResponse: Response;
  try {
    requestResponse = await fetchImpl(new URL('/api/v1/account/deletion/request', input.origin), {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    throw new Error('Der Kontodienst ist gerade nicht erreichbar. Bitte versuche es erneut.');
  }
  if (!requestResponse.ok) {
    throw await readApiError(requestResponse, 'Der Löschlink konnte nicht angefordert werden.');
  }

  let responseData: unknown;
  try {
    responseData = await requestResponse.json();
  } catch {
    throw new Error('Der Löschlink konnte nicht angefordert werden.');
  }
  const confirmationToken = responseData && typeof responseData === 'object'
    ? (responseData as { confirmationToken?: unknown }).confirmationToken
    : null;
  if (typeof confirmationToken !== 'string' || !confirmationToken) {
    throw new Error('Der Löschlink konnte nicht angefordert werden.');
  }

  const emailRedirectTo = createAccountDeletionWebRedirectUrl(input.origin, confirmationToken);
  const { error: emailError } = await auth.signInWithOtp({
    email: session.user.email ?? email,
    options: {
      emailRedirectTo,
      shouldCreateUser: false,
    },
  });
  if (emailError) {
    throw new Error('Die Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.');
  }

  return session.user.email ?? email;
}

export async function confirmAccountDeletionFromWeb(
  auth: AccountDeletionWebAuth,
  callback: AccountDeletionWebCallback,
  input: {
    origin: string;
    fetchImpl?: typeof fetch;
  },
): Promise<void> {
  if (callback.error || callback.errorDescription) {
    throw new Error('Der Bestätigungslink konnte nicht verwendet werden. Fordere bitte einen neuen an.');
  }
  if (callback.flow !== ACCOUNT_DELETION_FLOW || !callback.deletionToken) {
    throw new Error('Der Bestätigungslink ist unvollständig oder ungültig. Fordere bitte einen neuen an.');
  }

  let session: Session | null = null;
  if (callback.code) {
    const { data, error } = await auth.exchangeCodeForSession(
      callback.code,
      callback.flowId ? { flowId: callback.flowId } : undefined,
    );
    if (error) throw new Error('Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet.');
    session = data.session;
  } else if (callback.accessToken && callback.refreshToken) {
    const { data, error } = await auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw new Error('Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet.');
    session = data.session;
  }
  if (!session?.access_token) {
    throw new Error('Der Bestätigungslink enthält keine gültige Sitzung. Fordere bitte einen neuen an.');
  }

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(
      new URL('/api/v1/account/deletion/confirm', input.origin),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmationToken: callback.deletionToken }),
      },
    );
  } catch {
    throw new Error('Das Konto konnte gerade nicht gelöscht werden. Fordere bitte später einen neuen Link an.');
  }
  if (!response.ok) {
    throw await readApiError(response, 'Das Konto konnte nicht gelöscht werden. Fordere bitte einen neuen Link an.');
  }

  await auth.signOut({ scope: 'local' }).catch(() => undefined);
}
