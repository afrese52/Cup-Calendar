import type { SupabaseClient } from '@supabase/supabase-js';

type PasswordRecoveryAuth = Pick<
  SupabaseClient['auth'],
  'exchangeCodeForSession' | 'setSession' | 'getSession' | 'updateUser'
>;

const passwordResetFlowMarker = 'cupcal-password-reset';

function getResetUrlParams(url: string): {
  query: URLSearchParams;
  hash: URLSearchParams;
} {
  const [beforeHash, hash = ''] = url.split('#', 2);
  const queryString = beforeHash.includes('?')
    ? beforeHash.slice(beforeHash.indexOf('?') + 1)
    : '';

  return {
    query: new URLSearchParams(queryString),
    hash: new URLSearchParams(hash.replace(/^\?/, '')),
  };
}

function isUnusableRecoveryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('expired')
    || message.includes('invalid token')
    || message.includes('invalid grant')
    || message.includes('already been used')
    || message.includes('already used')
    || message.includes('email link is invalid')
    || message.includes('otp')
  );
}

export function createPasswordRecovery(auth: PasswordRecoveryAuth) {
  let recoverySessionPending = false;
  let lastPasswordResetUrl: string | null = null;
  let lastPasswordResetPromise: Promise<boolean> | null = null;

  async function processPasswordResetUrl(url: string): Promise<boolean> {
    recoverySessionPending = false;
    const { query, hash } = getResetUrlParams(url);
    const getParameter = (key: string) => query.get(key) ?? hash.get(key);
    if (getParameter('flow') !== passwordResetFlowMarker) return false;

    const linkError = getParameter('error_description') ?? getParameter('error_code');
    if (linkError) {
      throw new Error('Der Wiederherstellungslink ist ungültig, abgelaufen oder wurde bereits verwendet.');
    }

    const code = getParameter('code');
    const isRecoveryType = getParameter('type') === 'recovery';
    if (!isRecoveryType && !code) {
      throw new Error('Dieser Link ist kein gültiger Wiederherstellungslink.');
    }

    if (code) {
      const { error } = await auth.exchangeCodeForSession(code);
      if (error) throw error;
      recoverySessionPending = true;
      return true;
    }

    const accessToken = getParameter('access_token');
    const refreshToken = getParameter('refresh_token');
    if (!accessToken || !refreshToken) {
      throw new Error('Der Wiederherstellungslink enthält keine gültige Sitzung.');
    }

    const { error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    recoverySessionPending = true;
    return true;
  }

  function handlePasswordResetUrl(url: string): Promise<boolean> {
    if (lastPasswordResetUrl === url && lastPasswordResetPromise) {
      return lastPasswordResetPromise;
    }

    lastPasswordResetUrl = url;
    lastPasswordResetPromise = processPasswordResetUrl(url).catch((error: unknown) => {
      recoverySessionPending = false;
      throw error;
    });
    return lastPasswordResetPromise;
  }

  return {
    isPending: () => recoverySessionPending,
    markRecoverySession: (hasSession: boolean) => {
      recoverySessionPending = hasSession;
    },
    handlePasswordResetUrl,
    async saveNewPassword(password: string): Promise<void> {
      if (!recoverySessionPending) {
        throw new Error('Bitte öffne zuerst einen gültigen Wiederherstellungslink.');
      }

      let sessionResult: Awaited<ReturnType<PasswordRecoveryAuth['getSession']>>;
      try {
        sessionResult = await auth.getSession();
      } catch (error) {
        recoverySessionPending = false;
        throw error;
      }
      if (sessionResult.error) {
        recoverySessionPending = false;
        throw sessionResult.error;
      }
      if (!sessionResult.data.session) {
        recoverySessionPending = false;
        throw new Error('Die Wiederherstellungssitzung ist abgelaufen oder ungültig. Fordere bitte einen neuen Link an.');
      }

      const { error } = await auth.updateUser({ password });
      if (error) {
        if (isUnusableRecoveryError(error)) recoverySessionPending = false;
        throw error;
      }
      recoverySessionPending = false;
    },
  };
}
