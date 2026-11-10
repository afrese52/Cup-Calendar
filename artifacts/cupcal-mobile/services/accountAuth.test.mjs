import assert from 'node:assert/strict';
import test from 'node:test';
import {
  friendlyAuthError,
  signOutAccount,
  submitAccountAuth,
  watchAuthSession,
} from './accountAuth.ts';

const savedSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 1_900_000_000,
  user: { id: 'test-user-id', email: 'test@example.invalid' },
};

function createAuth(overrides = {}) {
  return {
    signInWithPassword: async () => ({ error: null }),
    signUp: async () => ({ data: { session: savedSession }, error: null }),
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe() {} } },
    }),
    ...overrides,
  };
}

test('meldet mit bereinigter E-Mail erfolgreich an', async () => {
  let receivedCredentials;
  const result = await submitAccountAuth(createAuth({
    signInWithPassword: async (credentials) => {
      receivedCredentials = credentials;
      return { error: null };
    },
  }), {
    mode: 'sign-in',
    email: '  test@example.invalid ',
    password: 'test-password',
    requestPasswordReset: async () => {},
  });

  assert.deepEqual(receivedCredentials, {
    email: 'test@example.invalid',
    password: 'test-password',
  });
  assert.deepEqual(result, { ok: true, message: 'Du bist angemeldet.' });
});

test('zeigt einen verständlichen Fehler bei abgelehnter Anmeldung', async () => {
  const result = await submitAccountAuth(createAuth({
    signInWithPassword: async () => ({
      error: new Error('Invalid login credentials'),
    }),
  }), {
    mode: 'sign-in',
    email: 'test@example.invalid',
    password: 'wrong-password',
    requestPasswordReset: async () => {},
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.',
  });
});

test('registriert erfolgreich mit und ohne sofortige Sitzung', async (t) => {
  await t.test('Konto wird direkt angemeldet', async () => {
    const result = await submitAccountAuth(createAuth(), {
      mode: 'sign-up',
      email: 'test@example.invalid',
      password: 'test-password',
      requestPasswordReset: async () => {},
    });

    assert.deepEqual(result, {
      ok: true,
      message: 'Dein Konto ist erstellt und du bist angemeldet.',
      clearPassword: true,
    });
  });

  await t.test('E-Mail-Bestätigung ist noch erforderlich', async () => {
    const result = await submitAccountAuth(createAuth({
      signUp: async () => ({ data: { session: null }, error: null }),
    }), {
      mode: 'sign-up',
      email: 'test@example.invalid',
      password: 'test-password',
      requestPasswordReset: async () => {},
    });

    assert.deepEqual(result, {
      ok: true,
      message: 'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
      clearPassword: true,
    });
  });
});

test('zeigt Fehler bei abgelehnter Registrierung verständlich an', async () => {
  const result = await submitAccountAuth(createAuth({
    signUp: async () => ({ data: { session: null }, error: new Error('weak password') }),
  }), {
    mode: 'sign-up',
    email: 'test@example.invalid',
    password: 'weak',
    requestPasswordReset: async () => {},
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'Das Passwort ist zu kurz oder zu unsicher. Bitte wähle ein stärkeres Passwort.',
  });
});

test('erklärt typische Ursachen, wenn Supabase die Registrierung ablehnt', async (t) => {
  const cases = [
    [
      'User already registered',
      'Für diese E-Mail-Adresse gibt es bereits ein Konto. Melde dich an oder fordere einen neuen Passwort-Link an.',
    ],
    [
      'Signups not allowed for this instance',
      'Neue Registrierungen sind im Supabase-Projekt deaktiviert. Aktiviere E-Mail-Anmeldungen in den Auth-Einstellungen.',
    ],
    [
      'Email rate limit exceeded',
      'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
    ],
    [
      'Database error saving new user',
      'Supabase konnte das Konto nicht in der Datenbank anlegen. Prüfe die Auth-Datenbanktrigger und die Supabase-Protokolle.',
    ],
    [
      'Invalid API key',
      'Die Supabase-Verbindung wird abgelehnt. Prüfe die Projekt-URL und den öffentlichen Supabase-Schlüssel in den Replit-Secrets.',
    ],
    [
      'Password should be at least 10 characters',
      'Das Passwort muss mindestens 10 Zeichen lang sein.',
    ],
  ];

  for (const [serverMessage, expected] of cases) {
    await t.test(serverMessage, () => {
      assert.equal(friendlyAuthError(new Error(serverMessage)), expected);
    });
  }
});

test('validiert leere Anmeldedaten ohne Serveraufruf', async () => {
  let called = false;
  const result = await submitAccountAuth(createAuth({
    signInWithPassword: async () => {
      called = true;
      return { error: null };
    },
  }), {
    mode: 'sign-in',
    email: ' ',
    password: '',
    requestPasswordReset: async () => {},
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'Bitte gib E-Mail-Adresse und Passwort ein.',
  });
  assert.equal(called, false);
});

test('fordert einen Wiederherstellungslink an und zeigt Fehler an', async (t) => {
  await t.test('Anfrage erfolgreich', async () => {
    let requestedEmail;
    const result = await submitAccountAuth(createAuth(), {
      mode: 'forgot-password',
      email: ' test@example.invalid ',
      password: '',
      requestPasswordReset: async (email) => { requestedEmail = email; },
    });

    assert.equal(requestedEmail, 'test@example.invalid');
    assert.deepEqual(result, {
      ok: true,
      message: 'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink.',
    });
  });

  await t.test('Netzwerkfehler verständlich', async () => {
    const result = await submitAccountAuth(createAuth(), {
      mode: 'forgot-password',
      email: 'test@example.invalid',
      password: '',
      requestPasswordReset: async () => { throw new Error('network request failed'); },
    });

    assert.deepEqual(result, {
      ok: false,
      error: 'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
    });
  });
});

test('meldet erfolgreich ab und zeigt Abmeldefehler an', async (t) => {
  await t.test('Abmeldung erfolgreich', async () => {
    assert.deepEqual(await signOutAccount(createAuth()), {
      ok: true,
      message: 'Du bist abgemeldet.',
      clearPassword: true,
    });
  });

  await t.test('Abmeldung wird vom Server abgelehnt', async () => {
    assert.deepEqual(await signOutAccount(createAuth({
      signOut: async () => ({ error: new Error('Abmeldung fehlgeschlagen') }),
    })), {
      ok: false,
      error: 'Abmeldung fehlgeschlagen',
    });
  });
});

test('stellt die gespeicherte Sitzung beim Start wieder her', async () => {
  const sessions = [];
  let readyCount = 0;
  const stop = watchAuthSession(createAuth({
    getSession: async () => ({ data: { session: savedSession }, error: null }),
  }), {
    onSession: (session) => sessions.push(session),
    onError: (error) => assert.fail(`Unerwarteter Fehler: ${error}`),
    onReady: () => { readyCount += 1; },
  });

  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.deepEqual(sessions, [savedSession]);
  assert.equal(sessions[0].user.email, 'test@example.invalid');
  assert.equal(readyCount, 1);
});

test('ignoriert ein veraltetes gespeichertes Ergebnis nach einem Auth-Ereignis', async () => {
  let emitAuthEvent;
  let resolveStoredSession;
  const sessions = [];
  const storedSessionPromise = new Promise((resolve) => {
    resolveStoredSession = resolve;
  });
  const stop = watchAuthSession(createAuth({
    getSession: () => storedSessionPromise,
    onAuthStateChange: (callback) => {
      emitAuthEvent = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  }), {
    onSession: (session) => sessions.push(session),
    onError: (error) => assert.fail(`Unerwarteter Fehler: ${error}`),
    onReady: () => {},
  });
  const latestSession = { ...savedSession, user: { ...savedSession.user, id: 'new-user' } };

  emitAuthEvent('SIGNED_IN', latestSession);
  resolveStoredSession({ data: { session: null }, error: null });
  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.deepEqual(sessions, [latestSession]);
});

test('beendet den Ladezustand auch bei Fehlern beim Sitzungsabruf', async () => {
  const errors = [];
  let readyCount = 0;
  const stop = watchAuthSession(createAuth({
    getSession: async () => { throw new Error('storage unavailable'); },
  }), {
    onSession: () => assert.fail('Keine Sitzung erwartet'),
    onError: (error) => errors.push(error),
    onReady: () => { readyCount += 1; },
  });

  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.equal(errors[0].message, 'storage unavailable');
  assert.equal(readyCount, 1);
});

test('zeigt einen von Supabase gemeldeten Sitzungsfehler an', async () => {
  const errors = [];
  let readyCount = 0;
  const stop = watchAuthSession(createAuth({
    getSession: async () => ({
      data: { session: null },
      error: new Error('stored session could not be refreshed'),
    }),
  }), {
    onSession: () => assert.fail('Keine Sitzung erwartet'),
    onError: (error) => errors.push(error),
    onReady: () => { readyCount += 1; },
  });

  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.equal(errors[0].message, 'stored session could not be refreshed');
  assert.equal(readyCount, 1);
});
