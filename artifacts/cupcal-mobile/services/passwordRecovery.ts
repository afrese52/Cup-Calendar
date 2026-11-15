import type { SupabaseClient } from '@supabase/supabase-js';

type PasswordRecoveryAuth = Pick<
  SupabaseClient['auth'],
  'exchangeCodeForSession' | 'setSession' | 'getSession' | 'updateUser'
>;

export const PASSWORD_MIN_LENGTH = 6;

const passwordResetFlowMarker = 'cupcal-password-reset';

export function passwordLengthRequirementError(password: string): string | null {
  return [...password].length < PASSWORD_MIN_LENGTH
    ? `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`
    : null;
}

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

function isPasswordResetRoute(url: string): boolean {
  try {
    const parsed = new URL(url);
    const routePath = parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.pathname
      : `/${parsed.hostname}${parsed.pathname}`;
    return routePath.replace(/\/+$/, '').endsWith('/auth/reset');
  } catch {
    return false;
  }
}

function isUnusableRecoveryError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function getHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;

  const errorDetails = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown } | null;
  };
  if (typeof errorDetails.status === 'number') return errorDetails.status;
  if (typeof errorDetails.statusCode === 'number') return errorDetails.statusCode;
  if (
    typeof errorDetails.response === 'object'
    && errorDetails.response !== null
    && typeof errorDetails.response.status === 'number'
  ) {
    return errorDetails.response.status;
  }
  return null;
}

function isTransientConnectionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const status = getHttpStatus(error);
  return (
    status === 408
    || status === 425
    || status === 429
    || (status !== null && status >= 500 && status < 600)
    || message.includes('network')
    || message.includes('fetch failed')
    || message.includes('failed to fetch')
    || message.includes('connection')
    || message.includes('timed out')
    || message.includes('timeout')
  );
}

export function createPasswordRecovery(auth: PasswordRecoveryAuth) {
  let recoverySessionPending = false;
  let passwordSavePending = false;
  let lastPasswordResetUrl: string | null = null;
  let lastPasswordResetPromise: Promise<boolean> | null = null;
  let latestPasswordResetRequest = 0;
  let passwordResetQueue: Promise<void> = Promise.resolve();

  function getPasswordResetParams(url: string): {
    query: URLSearchParams;
    hash: URLSearchParams;
    isResetLink: boolean;
  } {
    const { query, hash } = getResetUrlParams(url);
    const getParameter = (key: string) => query.get(key) ?? hash.get(key);
    const isRecoveryType = getParameter('type') === 'recovery';
    const code = getParameter('code');
    const isCupCalReset = getParameter('flow') === passwordResetFlowMarker;
    return {
      query,
      hash,
      isResetLink: isCupCalReset || isRecoveryType || Boolean(code && isPasswordResetRoute(url)),
    };
  }

  async function processPasswordResetUrl(
    url: string,
    requestId: number,
  ): Promise<boolean> {
    const { query, hash } = getPasswordResetParams(url);
    const getParameter = (key: string) => query.get(key) ?? hash.get(key);
    const isRecoveryType = getParameter('type') === 'recovery';
    const code = getParameter('code');
    const isCupCalReset = getParameter('flow') === passwordResetFlowMarker;
    if (!isCupCalReset && !isRecoveryType && !(code && isPasswordResetRoute(url))) return false;

    const linkError = getParameter('error_description') ?? getParameter('error_code');
    if (linkError) {
      throw new Error('Der Wiederherstellungslink ist ungültig, abgelaufen oder wurde bereits verwendet.');
    }

    if (!isRecoveryType && !code) {
      throw new Error('Dieser Link ist kein gültiger Wiederherstellungslink.');
    }

    if (code) {
      const flowId = getParameter('flow_id');
      const { error } = await auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error) throw error;
      if (requestId === latestPasswordResetRequest) recoverySessionPending = true;
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
    if (requestId === latestPasswordResetRequest) recoverySessionPending = true;
    return true;
  }

  function handlePasswordResetUrl(url: string): Promise<boolean> {
    const { isResetLink } = getPasswordResetParams(url);
    if (!isResetLink) return Promise.resolve(false);

    if (lastPasswordResetUrl === url && lastPasswordResetPromise) {
      return lastPasswordResetPromise;
    }

    const requestId = ++latestPasswordResetRequest;
    recoverySessionPending = false;
    const requestPromise = passwordResetQueue.then(async () => {
      try {
        return await processPasswordResetUrl(url, requestId);
      } catch (error) {
        if (requestId === latestPasswordResetRequest) recoverySessionPending = false;
        if (
          isTransientConnectionError(error)
          && lastPasswordResetUrl === url
          && lastPasswordResetPromise === requestPromise
        ) {
          lastPasswordResetUrl = null;
          lastPasswordResetPromise = null;
        }
        throw error;
      }
    });
    lastPasswordResetUrl = url;
    lastPasswordResetPromise = requestPromise;
    passwordResetQueue = requestPromise.then(
      () => undefined,
      () => undefined,
    );
    return requestPromise;
  }

  return {
    isPending: () => recoverySessionPending,
    markRecoverySession: (hasSession: boolean) => {
      recoverySessionPending = hasSession;
    },
    handlePasswordResetUrl,
    async saveNewPassword(password: string): Promise<void> {
      const passwordError = passwordLengthRequirementError(password);
      if (passwordError) throw new Error(passwordError);
      if (passwordSavePending) {
        throw new Error('Der Passwortwechsel läuft bereits. Bitte warte, bis er abgeschlossen ist.');
      }
      passwordSavePending = true;

      try {
        if (!recoverySessionPending) {
          throw new Error('Bitte öffne zuerst einen gültigen Wiederherstellungslink.');
        }

        let sessionResult: Awaited<ReturnType<PasswordRecoveryAuth['getSession']>>;
        try {
          sessionResult = await auth.getSession();
        } catch (error) {
          if (!isTransientConnectionError(error)) recoverySessionPending = false;
          throw error;
        }
        if (sessionResult.error) {
          if (!isTransientConnectionError(sessionResult.error)) recoverySessionPending = false;
          throw sessionResult.error;
        }
        if (!sessionResult.data.session) {
          recoverySessionPending = false;
          throw new Error('Die Wiederherstellungssitzung ist abgelaufen oder ungültig. Fordere bitte einen neuen Link an.');
        }

        let error: Awaited<ReturnType<PasswordRecoveryAuth['updateUser']>>['error'];
        try {
          ({ error } = await auth.updateUser({ password }));
        } catch (caughtError) {
          if (isUnusableRecoveryError(caughtError)) recoverySessionPending = false;
          throw caughtError;
        }
        if (error) {
          if (isUnusableRecoveryError(error)) recoverySessionPending = false;
          throw error;
        }
        recoverySessionPending = false;
      } finally {
        passwordSavePending = false;
      }
    },
  };
}
