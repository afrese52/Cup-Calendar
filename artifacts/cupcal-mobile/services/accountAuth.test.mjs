import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS,
  confirmEmailCode,
  emailConfirmationLinkError,
  friendlyAuthError,
  getRateLimitRetryAfterSeconds,
  resendAccountConfirmation,
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

test('tauscht den Bestätigungscode nur mit einer gültigen Sitzung ein', async (t) => {
  await t.test('übergibt den Code an Supabase und liefert die Sitzung zurück', async () => {
    let exchangedCode;
    let exchangedOptions;
    const session = await confirmEmailCode({
      exchangeCodeForSession: async (code, options) => {
        exchangedCode = code;
        exchangedOptions = options;
        return { data: { session: savedSession }, error: null };
      },
    }, 'email-confirmation-code', 'confirmation-flow-id');

    assert.equal(exchangedCode, 'email-confirmation-code');
    assert.deepEqual(exchangedOptions, { flowId: 'confirmation-flow-id' });
    assert.equal(session, savedSession);
  });

  await t.test('lehnt einen fehlenden Code oder eine fehlende Sitzung ab', async () => {
    await assert.rejects(
      confirmEmailCode({ exchangeCodeForSession: async () => ({
        data: { session: null },
        error: null,
      }) }, ''),
      /Bestätigungslink enthält keinen gültigen Code/i,
    );
    await assert.rejects(
      confirmEmailCode({ exchangeCodeForSession: async () => ({
        data: { session: null },
        error: null,
      }) }, 'email-confirmation-code'),
      /keine gültige Sitzung/i,
    );
  });

  await t.test('reicht abgelaufene oder bereits verwendete Codes als Fehler durch', async () => {
    await assert.rejects(
      confirmEmailCode({ exchangeCodeForSession: async () => ({
        data: { session: null },
        error: new Error('Email link is invalid or has expired'),
      }) }, 'expired-code'),
      /invalid or has expired/i,
    );
  });
});

test('übersetzt Fehler aus Bestätigungslinks in klare deutsche Hinweise', async (t) => {
  await t.test('abgelaufener oder wiederverwendeter Link', () => {
    assert.equal(
      emailConfirmationLinkError('access_denied', 'Email link is invalid or has expired'),
      'Der Bestätigungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.',
    );
  });
  await t.test('bereits bestätigte Adresse', () => {
    assert.equal(
      emailConfirmationLinkError('email_already_confirmed'),
      'Diese E-Mail-Adresse ist bereits bestätigt. Melde dich in CupCal an.',
    );
  });
  await t.test('fehlender PKCE-Nachweis bei anderem Gerät', () => {
    assert.match(
      emailConfirmationLinkError(
        'pkce_code_verifier_not_found',
        'PKCE code verifier not found in storage',
      ),
      /Gerät, auf dem du CupCal registriert hast/,
    );
  });
  await t.test('unbekannte Fehler bleiben allgemein verständlich', () => {
    assert.equal(emailConfirmationLinkError('unknown_error'), null);
  });
});

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

test('übergibt NFC- und NFD-Passwörter bei der Anmeldung unverändert', async () => {
  const receivedPasswords = [];
  const passwordNfc = 'é'.repeat(6);
  const passwordNfd = 'e\u0301'.repeat(6);
  const auth = createAuth({
    signInWithPassword: async ({ password }) => {
      receivedPasswords.push(password);
      return { error: null };
    },
  });

  for (const password of [passwordNfc, passwordNfd]) {
    const result = await submitAccountAuth(auth, {
      mode: 'sign-in',
      email: 'test@example.invalid',
      password,
      requestPasswordReset: async () => {},
    });
    assert.equal(result.ok, true);
  }

  assert.notEqual(passwordNfc, passwordNfd);
  assert.equal(passwordNfc.normalize('NFD'), passwordNfd);
  assert.deepEqual(receivedPasswords, [passwordNfc, passwordNfd]);
});

test('lässt bestehende Konten mit einem kurzen Passwort anmelden', async () => {
  let receivedCredentials;
  const result = await submitAccountAuth(createAuth({
    signInWithPassword: async (credentials) => {
      receivedCredentials = credentials;
      return { error: null };
    },
  }), {
    mode: 'sign-in',
    email: 'test@example.invalid',
    password: '12345',
    requestPasswordReset: async () => {},
  });

  assert.deepEqual(receivedCredentials, {
    email: 'test@example.invalid',
    password: '12345',
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
    error: 'E-Mail-Adresse oder Passwort stimmen nicht. Prüfe deine Eingaben oder fordere einen neuen Passwort-Link an.',
  });
});

test('registriert erfolgreich mit und ohne sofortige Sitzung', async (t) => {
  await t.test('Konto wird direkt angemeldet', async () => {
    let receivedSignUpOptions;
    const result = await submitAccountAuth(createAuth({
      signUp: async (credentials) => {
        receivedSignUpOptions = credentials;
        return { data: { session: savedSession }, error: null };
      },
    }), {
      mode: 'sign-up',
      email: 'test@example.invalid',
      password: 'test-password',
      emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
      requestPasswordReset: async () => {},
    });

    assert.deepEqual(receivedSignUpOptions, {
      email: 'test@example.invalid',
      password: 'test-password',
      options: { emailRedirectTo: 'cupcal-android://auth/confirm' },
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
      emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
      requestPasswordReset: async () => {},
    });

    assert.deepEqual(result, {
      ok: true,
      message: 'Dein Konto ist erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.',
      clearPassword: true,
      emailConfirmationRequired: true,
    });
  });
});

test('prüft die Unicode-Mindestlänge vor der Registrierung', async (t) => {
  await t.test('weist fünf Emoji-Codepoints ohne Supabase-Aufruf ab', async () => {
    let called = false;
    const password = '😀'.repeat(5);
    const result = await submitAccountAuth(createAuth({
      signUp: async () => {
        called = true;
        return { data: { session: null }, error: null };
      },
    }), {
      mode: 'sign-up',
      email: 'test@example.invalid',
      password,
      emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
      requestPasswordReset: async () => {},
    });

    assert.deepEqual(result, {
      ok: false,
      error: 'Das Passwort muss mindestens 6 Zeichen lang sein. CupCal zählt einzelne Unicode-Zeichen: Manche Emojis bestehen aus mehreren Zeichen; Akzentbuchstaben zählen je nach Schreibweise als ein oder zwei Zeichen.',
    });
    assert.equal(called, false);
  });

  await t.test('akzeptiert genau sechs Emoji-Codepoints', async () => {
    let receivedPassword;
    const password = '😀'.repeat(6);
    const result = await submitAccountAuth(createAuth({
      signUp: async ({ password }) => {
        receivedPassword = password;
        return { data: { session: savedSession }, error: null };
      },
    }), {
      mode: 'sign-up',
      email: 'test@example.invalid',
      password,
      emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
      requestPasswordReset: async () => {},
    });

    assert.equal(receivedPassword, password);
    assert.equal(result.ok, true);
  });
});

test('zählt zusammengesetzte Emojis bei der Registrierung nach Codepoints', async (t) => {
  const cases = [
    {
      name: 'Hautfarbton-Emojis unter der Grenze',
      password: '👍🏽👍🏽',
      accepted: false,
    },
    {
      name: 'Hautfarbton-Emojis genau an der Grenze',
      password: '👍🏽'.repeat(3),
      accepted: true,
    },
    {
      name: 'ZWJ-Emoji unter der Grenze',
      password: '👩‍💻',
      accepted: false,
    },
    {
      name: 'ZWJ-Emojis genau an der Grenze',
      password: '👩‍💻'.repeat(2),
      accepted: true,
    },
  ];

  for (const { name, password, accepted } of cases) {
    await t.test(name, async () => {
      assert.equal(Array.from(password).length < 6, !accepted);
      let receivedPassword;
      const result = await submitAccountAuth(createAuth({
        signUp: async ({ password: submittedPassword }) => {
          receivedPassword = submittedPassword;
          return { data: { session: savedSession }, error: null };
        },
      }), {
        mode: 'sign-up',
        email: 'test@example.invalid',
        password,
        emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
        requestPasswordReset: async () => {},
      });

      assert.equal(result.ok, accepted);
      assert.equal(receivedPassword, accepted ? password : undefined);
    });
  }
});

test('weist dasselbe kurze Passwort vor der Registrierungsanfrage ab', async () => {
  let called = false;
  const result = await submitAccountAuth(createAuth({
    signUp: async () => {
      called = true;
      return { data: { session: null }, error: null };
    },
  }), {
    mode: 'sign-up',
    email: 'test@example.invalid',
    password: '12345',
    emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
    requestPasswordReset: async () => {},
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'Das Passwort muss mindestens 6 Zeichen lang sein. CupCal zählt einzelne Unicode-Zeichen: Manche Emojis bestehen aus mehreren Zeichen; Akzentbuchstaben zählen je nach Schreibweise als ein oder zwei Zeichen.',
  });
  assert.equal(called, false);
});

test('zeigt Fehler bei abgelehnter Registrierung verständlich an', async () => {
  const result = await submitAccountAuth(createAuth({
    signUp: async () => ({ data: { session: null }, error: new Error('weak password') }),
  }), {
    mode: 'sign-up',
    email: 'test@example.invalid',
    password: '123456',
    emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
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
      'Die Supabase-Verbindung wird abgelehnt. Die Projekt-URL muss auf die Projektbasis zeigen und darf keinen Endpfad wie /auth/v1 oder /rest/v1 enthalten. Prüfe außerdem den öffentlichen Schlüssel.',
    ],
    [
      'Invalid path specified in request URL',
      'Die Supabase-Verbindung wird abgelehnt. Die Projekt-URL muss auf die Projektbasis zeigen und darf keinen Endpfad wie /auth/v1 oder /rest/v1 enthalten. Prüfe außerdem den öffentlichen Schlüssel.',
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

test('erklärt vorübergehende Supabase-Drosselungen unabhängig von der Netzwerkverbindung', async (t) => {
  const expected = 'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.';
  const cases = [
    ['Auth-Rate-Limit-Code', Object.assign(new Error('Request rejected'), {
      code: 'over_request_rate_limit',
    })],
    ['HTTP 429 ohne aussagekräftige Fehlermeldung', Object.assign(new Error('Request rejected'), {
      status: 429,
    })],
    ['zu viele Anfragen im Nachrichtentext', new Error('Too many requests')],
  ];

  for (const [name, error] of cases) {
    await t.test(name, () => {
      assert.equal(friendlyAuthError(error), expected);
      assert.notEqual(
        friendlyAuthError(error),
        'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
      );
    });
  }
});

test('liest eine verlässliche Wartezeit aus Supabase-Fehlerdetails', async (t) => {
  const now = Date.UTC(2026, 10, 16, 12);
  const cases = [
    ['Retry-After als Sekunden', { headers: { 'retry-after': '45' } }, 45],
    ['Retry-After als HTTP-Datum', {
      response: { headers: new Headers({ 'Retry-After': new Date(now + 90_000).toUTCString() }) },
    }, 90],
    ['Supabase-Angabe im Fehlertext', { message: 'Please retry after 2 minutes' }, 120],
  ];
  for (const [name, error, expected] of cases) {
    await t.test(name, () => {
      assert.equal(getRateLimitRetryAfterSeconds(error, now), expected);
    });
  }
  await t.test('verwirft fehlende oder ungültige Wartezeiten', () => {
    assert.equal(getRateLimitRetryAfterSeconds({ headers: { 'retry-after': 'soon' } }, now), null);
    assert.equal(getRateLimitRetryAfterSeconds({ retryAfter: 90_000 }, now), null);
  });
  await t.test('zeigt konkrete Sekunden im verständlichen Hinweis an', () => {
    assert.equal(
      friendlyAuthError(Object.assign(new Error('Too many requests'), {
        code: 'over_request_rate_limit',
        headers: { 'retry-after': '45' },
      })),
      'Zu viele Versuche in kurzer Zeit. Bitte warte noch 45 Sekunden und versuche es dann erneut.',
    );
  });
});

test('erklärt vorübergehende Supabase-Serverfehler ohne Netzwerkfehler zu melden', () => {
  const error = Object.assign(new Error('Service unavailable'), { status: 503 });
  assert.equal(
    friendlyAuthError(error),
    'Supabase ist vorübergehend nicht verfügbar. Warte bitte kurz und versuche es dann erneut.',
  );
  assert.notEqual(
    friendlyAuthError(error),
    'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
  );
});

test('zeigt unbekannte Supabase-Fehler bereinigt mit Code und HTTP-Status', () => {
  const error = Object.assign(new Error('Fehler für person@example.com bei https://example.com'), {
    code: 'unexpected_auth_error',
    status: 400,
  });

  assert.equal(
    friendlyAuthError(error),
    'Supabase hat die Anfrage abgelehnt: Fehler für [E-Mail] bei [URL] · Code: unexpected_auth_error · HTTP 400',
  );
  const safeMessage = friendlyAuthError(error, 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.', {
    includeUnknownDetails: false,
  });
  assert.equal(safeMessage, 'Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.');
  assert.doesNotMatch(safeMessage, /person@example\.com|example\.com|unexpected_auth_error|HTTP 400/);
});

test('erklärt eine abgelaufene Sitzung und fordert zur erneuten Anmeldung auf', () => {
  assert.equal(
    friendlyAuthError(new Error('Invalid Refresh Token: Already Used')),
    'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  );
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
      message: 'Wenn zu dieser E-Mail ein CupCal-Konto besteht, erhältst du in Kürze einen Wiederherstellungslink. Der Versand kann etwas dauern. Prüfe auch deinen Spam-Ordner.',
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

test('fordert einen Bestätigungslink mit der CupCal-Rücksprungadresse erneut an', async (t) => {
  await t.test('E-Mail und Weiterleitung werden bereinigt und übergeben', async () => {
    let request;
    const result = await resendAccountConfirmation({
      email: ' test@example.invalid ',
      emailConfirmationRedirectTo: ' cupcal-android://auth/confirm ',
      requestEmailConfirmation: async (email, emailRedirectTo) => {
        request = { email, emailRedirectTo };
      },
    });

    assert.deepEqual(request, {
      email: 'test@example.invalid',
      emailRedirectTo: 'cupcal-android://auth/confirm',
    });
    assert.deepEqual(result, {
      ok: true,
      message: 'Wenn dein Konto noch nicht bestätigt ist, erhältst du in Kürze einen neuen Bestätigungslink.',
      resendCooldownSeconds: ACCOUNT_CONFIRMATION_RESEND_COOLDOWN_SECONDS,
    });
  });

  await t.test('leere E-Mail oder fehlende Weiterleitung löst keine Anfrage aus', async () => {
    let called = false;
    const requestEmailConfirmation = async () => { called = true; };

    assert.deepEqual(await resendAccountConfirmation({
      email: ' ',
      emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
      requestEmailConfirmation,
    }), {
      ok: false,
      error: 'Bitte gib deine E-Mail-Adresse ein.',
    });
    assert.deepEqual(await resendAccountConfirmation({
      email: 'test@example.invalid',
      requestEmailConfirmation,
    }), {
      ok: false,
      error: 'Der Bestätigungslink ist nicht konfiguriert. Bitte versuche es später erneut.',
    });
    assert.equal(called, false);
  });

  await t.test('zeigt Versandfehler verständlich an', async () => {
    const result = await resendAccountConfirmation({
      email: 'test@example.invalid',
      emailConfirmationRedirectTo: 'cupcal-android://auth/confirm',
      requestEmailConfirmation: async () => { throw new Error('Email rate limit exceeded'); },
    });

    assert.deepEqual(result, {
      ok: false,
      error: 'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
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
