import type { Session, SupabaseClient } from '@supabase/supabase-js';

type AuthApi = SupabaseClient['auth'];

export type AccountAuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

export function friendlyAuthError(
  error: unknown,
  fallback = 'Das hat nicht geklappt. Bitte versuche es erneut.',
): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('invalid email')) {
    return 'Bitte prüfe deine E-Mail-Adresse.';
  }
  if (
    message.includes('expired')
    || message.includes('invalid token')
    || message.includes('otp')
    || message.includes('email link is invalid')
  ) {
    return 'Der Wiederherstellungslink ist ungültig oder abgelaufen. Fordere bitte einen neuen Link an.';
  }
  if (
    message.includes('password should be at least')
    || message.includes('password is too short')
    || message.includes('weak password')
  ) {
    return 'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.';
  }
  if (
    message.includes('network')
    || message.includes('fetch failed')
    || message.includes('failed to fetch')
  ) {
    return 'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.';
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
