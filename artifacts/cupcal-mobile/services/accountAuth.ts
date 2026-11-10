import type { Session, SupabaseClient } from '@supabase/supabase-js';

type AuthApi = SupabaseClient['auth'];

export type AccountAuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

export function friendlyAuthError(
  error: unknown,
  fallback = 'Das hat nicht geklappt. Bitte versuche es erneut.',
): string {
  const errorDetails =
    typeof error === 'object' && error !== null
      ? (error as { message?: unknown; code?: unknown; status?: unknown })
      : {};
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof errorDetails.message === 'string'
        ? errorDetails.message
        : '';
  const message = rawMessage.toLowerCase();
  const code = typeof errorDetails.code === 'string' ? errorDetails.code.toLowerCase() : '';

  if (code === 'email_address_invalid' || message.includes('invalid email')) {
    return 'Bitte prüfe deine E-Mail-Adresse.';
  }
  if (
    code === 'user_already_exists'
    || code === 'user_already_registered'
    || code === 'email_exists'
    ||
    message.includes('user already registered')
    || message.includes('already registered')
    || message.includes('already exists')
    || message.includes('email address is already in use')
  ) {
    return 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Melde dich an oder fordere einen neuen Passwort-Link an.';
  }
  if (
    code === 'signup_disabled'
    || code === 'email_provider_disabled'
    ||
    message.includes('signup is disabled')
    || message.includes('signups not allowed')
    || message.includes('sign up is disabled')
    || message.includes('email signups are disabled')
  ) {
    return 'Neue Registrierungen sind im Supabase-Projekt deaktiviert. Aktiviere E-Mail-Anmeldungen in den Auth-Einstellungen.';
  }
  if (
    code === 'over_email_send_rate_limit'
    || code === 'over_request_rate_limit'
    ||
    message.includes('email rate limit exceeded')
    || message.includes('rate limit')
    || message.includes('too many requests')
  ) {
    return 'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.';
  }
  if (
    message.includes('database error saving new user')
    || message.includes('error creating user')
  ) {
    return 'Supabase konnte das Konto nicht in der Datenbank anlegen. Prüfe die Auth-Datenbanktrigger und die Supabase-Protokolle.';
  }
  if (
    message.includes('invalid api key')
    || message.includes('no api key')
    || message.includes('project not found')
  ) {
    return 'Die Supabase-Verbindung wird abgelehnt. Prüfe die Projekt-URL und den öffentlichen Supabase-Schlüssel in den Replit-Secrets.';
  }
  if (
    message.includes('expired')
    || message.includes('invalid token')
    || message.includes('invalid grant')
    || message.includes('already been used')
    || message.includes('already used')
    || message.includes('otp')
    || message.includes('email link is invalid')
    || message.includes('ungültig, abgelaufen oder wurde bereits verwendet')
    || message.includes('wiederherstellungssitzung ist abgelaufen')
    || message.includes('kein gültiger wiederherstellungslink')
    || message.includes('keine gültige sitzung')
  ) {
    return 'Der Wiederherstellungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Fordere bitte einen neuen Link an.';
  }
  if (
    code === 'weak_password'
    || code === 'password_too_short'
    ||
    message.includes('password should be at least')
    || message.includes('password is too short')
    || message.includes('weak password')
  ) {
    const minimumLength = rawMessage.match(/(?:at least|minimum(?: of)?)\s+(\d+)\s+characters?/i)?.[1];
    return minimumLength
      ? `Das Passwort muss mindestens ${minimumLength} Zeichen lang sein.`
      : 'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.';
  }
  if (
    message.includes('network')
    || message.includes('fetch failed')
    || message.includes('failed to fetch')
  ) {
    return 'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.';
  }

  if (rawMessage || code || typeof errorDetails.status === 'number') {
    const safeMessage = rawMessage
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[E-Mail]')
      .replace(/https?:\/\/\S+/gi, '[URL]')
      .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[Schlüssel]');
    const details = [
      safeMessage,
      code ? `Code: ${code}` : '',
      typeof errorDetails.status === 'number' ? `HTTP ${errorDetails.status}` : '',
    ].filter(Boolean).join(' · ');
    return `Supabase hat die Anfrage abgelehnt: ${details || fallback}`;
  }

  return fallback;
}

export type AuthOperationResult =
  | { ok: true; message: string; clearPassword?: boolean }
  | { ok: false; error: string };

export function watchAuthSession(
  auth: AuthApi,
  callbacks: {
    onSession: (session: Session | null) => void;
    onError: (error: unknown) => void;
    onReady: () => void;
  },
): () => void {
  let active = true;
  let authEventCount = 0;
  const {
    data: { subscription },
  } = auth.onAuthStateChange((_event, session) => {
    if (!active) return;
    authEventCount += 1;
    callbacks.onSession(session);
    callbacks.onReady();
  });

  void auth.getSession().then(({ data, error }) => {
    if (!active) return;
    if (authEventCount === 0) {
      if (error) callbacks.onError(error);
      else callbacks.onSession(data.session);
    }
    callbacks.onReady();
  }).catch((error: unknown) => {
    if (!active) return;
    callbacks.onError(error);
    callbacks.onReady();
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}

export async function submitAccountAuth(
  auth: AuthApi,
  options: {
    mode: AccountAuthMode;
    email: string;
    password: string;
    requestPasswordReset: (email: string) => Promise<void>;
  },
): Promise<AuthOperationResult> {
  const { mode, password, requestPasswordReset } = options;
  const email = options.email.trim();
  if (!email || (mode !== 'forgot-password' && !password)) {
    return {
      ok: false,
      error: mode === 'forgot-password'
        ? 'Bitte gib deine E-Mail-Adresse ein.'
        : 'Bitte gib E-Mail-Adresse und Passwort ein.',
    };
  }

  try {
    if (mode === 'forgot-password') {
      await requestPasswordReset(email);
      return {
        ok: true,
        message: 'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink.',
      };
    }

    if (mode === 'sign-in') {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { ok: true, message: 'Du bist angemeldet.' };
    }

    const { data, error } = await auth.signUp({ email, password });
    if (error) throw error;
    return {
      ok: true,
      message: data.session
        ? 'Dein Konto ist erstellt und du bist angemeldet.'
        : 'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
      clearPassword: true,
    };
  } catch (error) {
    return {
      ok: false,
      error: friendlyAuthError(
        error,
        mode === 'forgot-password'
          ? 'Die E-Mail konnte nicht angefordert werden. Bitte versuche es erneut.'
          : mode === 'sign-up'
            ? 'Die Registrierung ist fehlgeschlagen. Bitte versuche es erneut.'
            : 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
      ),
    };
  }
}

export async function signOutAccount(auth: AuthApi): Promise<AuthOperationResult> {
  try {
    const { error } = await auth.signOut();
    if (error) throw error;
    return { ok: true, message: 'Du bist abgemeldet.', clearPassword: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'Die Abmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
    };
  }
}
