import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import {
  createPasswordRecovery,
  passwordLengthRequirementError,
  PASSWORD_MIN_LENGTH,
} from './passwordRecovery.ts';
import { friendlyAuthError } from './accountAuth.ts';

const validSession = {
  access_token: 'recovery-access-token',
  refresh_token: 'recovery-refresh-token',
  user: { id: 'account-a' },
};
const recoveryUrl = 'cupcal-android://auth/reset?flow=cupcal-password-reset&code=one-time-code';

function createAuth(overrides = {}) {
  return {
    exchangeCodeForSession: async () => ({ error: null }),
    setSession: async () => ({ error: null }),
    getSession: async () => ({ data: { session: validSession }, error: null }),
    updateUser: async () => ({ error: null }),
    ...overrides,
  };
}

test('weist ungültige Wiederherstellungslinks ab und sperrt den Passwortwechsel', async () => {
  let updateCalled = false;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async () => {
      updateCalled = true;
      return { error: null };
    },
  }));

  await assert.rejects(
    recovery.handlePasswordResetUrl(
      'cupcal-android://auth/reset?flow=cupcal-password-reset&error_code=access_denied',
    ),
    /ungültig, abgelaufen oder wurde bereits verwendet/i,
  );
  assert.equal(recovery.isPending(), false);
  await assert.rejects(recovery.saveNewPassword('new-password'), /gültigen Wiederherstellungslink/i);
  assert.equal(updateCalled, false);
  assert.match(
    friendlyAuthError(new Error('Dieser Link ist kein gültiger Wiederherstellungslink.')),
    /ungültig, abgelaufen oder wurde bereits verwendet/,
  );
});

test('weist Fehlerparameter in Query und Fragment ohne Sitzungsaustausch ab', async (t) => {
  const expectedMessage =
    'Der Wiederherstellungslink ist ungültig, abgelaufen oder wurde bereits verwendet.';
  const cases = [
    {
      name: 'error_description in Query',
      url: 'cupcal-android://auth/reset?code=must-not-exchange&error_description=Email+link+is+invalid',
    },
    {
      name: 'error_description im Fragment',
      url: 'cupcal-android://auth/reset#code=must-not-exchange&error_description=Email+link+is+invalid',
    },
    {
      name: 'error_code in Query',
      url: 'cupcal-android://auth/reset?code=must-not-exchange&error_code=otp_expired',
    },
    {
      name: 'error_code im Fragment',
      url: 'cupcal-android://auth/reset#code=must-not-exchange&error_code=otp_expired',
    },
    {
      name: 'leere error_description vor error_code in Query',
      url: 'cupcal-android://auth/reset?code=must-not-exchange&error_description=&error_code=otp_expired',
    },
    {
      name: 'leere error_description vor error_code im Fragment',
      url: 'cupcal-android://auth/reset#code=must-not-exchange&error_description=&error_code=otp_expired',
    },
  ];
  const messages = new Map();

  for (const { name, url } of cases) {
    await t.test(name, async () => {
      const calls = {
        exchangeCodeForSession: 0,
        setSession: 0,
        getSession: 0,
        updateUser: 0,
      };
      const recovery = createPasswordRecovery(createAuth(
        Object.fromEntries(
          Object.keys(calls).map((method) => [
            method,
            async () => {
              calls[method] += 1;
              return method === 'getSession'
                ? { data: { session: validSession }, error: null }
                : { error: null };
            },
          ]),
        ),
      ));

      await assert.rejects(
        recovery.handlePasswordResetUrl(url),
        (error) => {
          messages.set(name, error.message);
          return error.message === expectedMessage;
        },
      );
      assert.equal(recovery.isPending(), false);
      assert.deepEqual(calls, {
        exchangeCodeForSession: 0,
        setSession: 0,
        getSession: 0,
        updateUser: 0,
      });
    });
  }

  assert.equal(messages.get('error_description im Fragment'), messages.get('error_description in Query'));
  assert.equal(messages.get('error_code im Fragment'), messages.get('error_code in Query'));
  assert.equal(
    messages.get('leere error_description vor error_code im Fragment'),
    messages.get('error_code im Fragment'),
  );
});

test('weist abgelaufene Codes ab und zeigt eine verständliche Meldung', async () => {
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async () => ({
      error: new Error('Email link is invalid or has expired'),
    }),
  }));

  await assert.rejects(recovery.handlePasswordResetUrl(recoveryUrl), /expired/i);
  assert.equal(recovery.isPending(), false);
  assert.equal(
    friendlyAuthError(new Error('Email link is invalid or has expired')),
    'Der Wiederherstellungslink ist ungültig, abgelaufen oder wurde bereits verwendet. Fordere bitte einen neuen Link an.',
  );
});

test('weist bereits verwendete Codes ab', async () => {
  let updateCalled = false;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async () => ({
      error: new Error('Token has already been used'),
    }),
    updateUser: async () => {
      updateCalled = true;
      return { error: null };
    },
  }));

  await assert.rejects(recovery.handlePasswordResetUrl(recoveryUrl), /already been used/i);
  assert.equal(recovery.isPending(), false);
  await assert.rejects(recovery.saveNewPassword('new-password'), /gültigen Wiederherstellungslink/i);
  assert.equal(updateCalled, false);
  assert.match(
    friendlyAuthError(new Error('Token has already been used')),
    /ungültig, abgelaufen oder wurde bereits verwendet/,
  );
});

test('erlaubt nach einem vorübergehenden Linkfehler denselben Link erneut', async () => {
  let exchangeAttempts = 0;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async () => {
      exchangeAttempts += 1;
      if (exchangeAttempts === 1) {
        return { error: new Error('Network request failed') };
      }
      return { error: null };
    },
  }));

  await assert.rejects(
    recovery.handlePasswordResetUrl(recoveryUrl),
    /Network request failed/i,
  );
  assert.equal(recovery.isPending(), false);

  assert.equal(await recovery.handlePasswordResetUrl(recoveryUrl), true);
  assert.equal(exchangeAttempts, 2);
  assert.equal(recovery.isPending(), true);
});

test('erlaubt nach einem vorübergehenden Supabase-Fehlerobjekt denselben Link erneut', async () => {
  let exchangeAttempts = 0;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async () => {
      exchangeAttempts += 1;
      if (exchangeAttempts === 1) {
        return { error: { message: 'Network request failed' } };
      }
      return { error: null };
    },
  }));

  await assert.rejects(
    recovery.handlePasswordResetUrl(recoveryUrl),
    (error) => error.message === 'Network request failed',
  );
  assert.equal(recovery.isPending(), false);

  assert.equal(await recovery.handlePasswordResetUrl(recoveryUrl), true);
  assert.equal(exchangeAttempts, 2);
  assert.equal(recovery.isPending(), true);
});

test('erlaubt nach vorübergehenden HTTP-Fehlern denselben Link erneut', async (t) => {
  const cases = [
    ['Zeitüberschreitung', 408],
    ['zu frühe Anfrage', 425],
    ['Drosselung', 429],
    ['Serverfehler', 500],
    ['Dienst nicht verfügbar', 503],
    ['Gateway-Zeitüberschreitung', 504],
    ['oberer Serverfehlerbereich', 599],
    ['Status in einer HTTP-Antwort', { response: { status: 503 } }],
  ];

  for (const [name, statusDetails] of cases) {
    await t.test(name, async () => {
      let exchangeAttempts = 0;
      const recovery = createPasswordRecovery(createAuth({
        exchangeCodeForSession: async () => {
          exchangeAttempts += 1;
          if (exchangeAttempts === 1) {
            const details = typeof statusDetails === 'number'
              ? { status: statusDetails }
              : statusDetails;
            return { error: Object.assign(new Error('Request rejected'), details) };
          }
          return { error: null };
        },
      }));

      await assert.rejects(recovery.handlePasswordResetUrl(recoveryUrl), /Request rejected/i);
      assert.equal(recovery.isPending(), false);
      assert.equal(await recovery.handlePasswordResetUrl(recoveryUrl), true);
      assert.equal(exchangeAttempts, 2);
      assert.equal(recovery.isPending(), true);
    });
  }
});

test('verhindert die Wiederholung desselben Links nach einem dauerhaften HTTP-Fehler', async () => {
  let exchangeAttempts = 0;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async () => {
      exchangeAttempts += 1;
      return {
        error: Object.assign(new Error('Invalid recovery request'), { status: 400 }),
      };
    },
  }));

  await assert.rejects(recovery.handlePasswordResetUrl(recoveryUrl), /Invalid recovery request/i);
  await assert.rejects(recovery.handlePasswordResetUrl(recoveryUrl), /Invalid recovery request/i);
  assert.equal(exchangeAttempts, 1);
  assert.equal(recovery.isPending(), false);
});

test('weist den Passwortwechsel ohne gültige Wiederherstellungssitzung ab', async () => {
  let updateCalled = false;
  const recovery = createPasswordRecovery(createAuth({
    getSession: async () => ({ data: { session: null }, error: null }),
    updateUser: async () => {
      updateCalled = true;
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  await assert.rejects(
    recovery.saveNewPassword('new-password'),
    /Wiederherstellungssitzung ist abgelaufen oder ungültig/i,
  );
  assert.equal(recovery.isPending(), false);
  assert.equal(updateCalled, false);
  assert.match(
    friendlyAuthError(new Error('Die Wiederherstellungssitzung ist abgelaufen oder ungültig.')),
    /ungültig, abgelaufen oder wurde bereits verwendet/,
  );
});

test('weist fünf Emoji-Codepoints vor der Serveranfrage ab', async () => {
  let updateCalled = false;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async () => {
      updateCalled = true;
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  await assert.rejects(
    recovery.saveNewPassword('😀'.repeat(PASSWORD_MIN_LENGTH - 1)),
    new RegExp(`mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`, 'i'),
  );
  assert.equal(updateCalled, false);
  assert.equal(recovery.isPending(), true);
});

test('zählt Unicode-Passwörter lokal nach Unicode-Codepoints', () => {
  const passwords = [
    { value: '😀'.repeat(5), accepted: false },
    { value: '😀'.repeat(6), accepted: true },
    { value: 'é'.repeat(6), accepted: true },
    { value: 'e\u0301'.repeat(3), accepted: true },
  ];

  for (const { value, accepted } of passwords) {
    assert.equal(
      passwordLengthRequirementError(value) === null,
      accepted,
      `Unerwartete lokale Mindestlängenprüfung für ${JSON.stringify(value)}.`,
    );
  }
});

test('akzeptiert sechs Buchstaben ohne zusätzliche Zeichenregeln', async () => {
  let updatedPassword;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async ({ password }) => {
      updatedPassword = password;
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  const password = 'a'.repeat(PASSWORD_MIN_LENGTH);
  await recovery.saveNewPassword(password);

  assert.equal(updatedPassword, password);
  assert.equal(recovery.isPending(), false);
});

test('akzeptiert genau sechs Emoji-Codepoints beim Passwortwechsel', async () => {
  let updatedPassword;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async ({ password }) => {
      updatedPassword = password;
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  const password = '😀'.repeat(PASSWORD_MIN_LENGTH);
  await recovery.saveNewPassword(password);

  assert.equal(updatedPassword, password);
  assert.equal(recovery.isPending(), false);
});

test('erlaubt nur den einmaligen Passwortwechsel mit aktueller Sitzung', async () => {
  let updatedPassword;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async (code) => {
      assert.equal(code, 'one-time-code');
      return { error: null };
    },
    updateUser: async ({ password }) => {
      updatedPassword = password;
      return { error: null };
    },
  }));

  assert.equal(await recovery.handlePasswordResetUrl(recoveryUrl), true);
  assert.equal(recovery.isPending(), true);
  await recovery.saveNewPassword('strong-new-password');
  assert.equal(updatedPassword, 'strong-new-password');
  assert.equal(recovery.isPending(), false);
  await assert.rejects(recovery.saveNewPassword('another-password'), /gültigen Wiederherstellungslink/i);
});

test('weist parallele Passwortwechsel verständlich ab und sendet nur eine Serveranfrage', async () => {
  let updateCalls = 0;
  let finishUpdate;
  let markUpdateStarted;
  const updateStarted = new Promise((resolve) => {
    markUpdateStarted = resolve;
  });
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async () => {
      updateCalls += 1;
      markUpdateStarted();
      return new Promise((resolve) => {
        finishUpdate = resolve;
      });
    },
  }));
  recovery.markRecoverySession(true);

  const firstSave = recovery.saveNewPassword('strong-new-password');
  await updateStarted;
  await assert.rejects(
    recovery.saveNewPassword('another-password'),
    /Passwortwechsel läuft bereits\. Bitte warte/i,
  );
  assert.equal(
    friendlyAuthError(new Error('Der Passwortwechsel läuft bereits. Bitte warte, bis er abgeschlossen ist.')),
    'Der Passwortwechsel läuft bereits. Bitte warte, bis er abgeschlossen ist.',
  );
  assert.equal(updateCalls, 1);

  finishUpdate({ error: null });
  await firstSave;
  assert.equal(updateCalls, 1);
  assert.equal(recovery.isPending(), false);
});

test('behält die Wiederherstellungssitzung nach einem Netzwerkfehler für den erneuten Versuch', async () => {
  let updateAttempts = 0;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async () => {
      updateAttempts += 1;
      if (updateAttempts === 1) throw new Error('Network request failed');
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  await assert.rejects(
    recovery.saveNewPassword('strong-new-password'),
    /Network request failed/i,
  );
  assert.equal(recovery.isPending(), true);
  assert.equal(
    friendlyAuthError(new Error('Network request failed')),
    'Keine Verbindung möglich. Prüfe deine Internetverbindung und versuche es erneut.',
  );

  await recovery.saveNewPassword('strong-new-password');
  assert.equal(updateAttempts, 2);
  assert.equal(recovery.isPending(), false);
});

test('behält die Wiederherstellungssitzung nach einer vorübergehenden Drosselung', async () => {
  let updateAttempts = 0;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async () => {
      updateAttempts += 1;
      if (updateAttempts === 1) {
        return {
          error: Object.assign(new Error('Too many requests'), {
            code: 'over_request_rate_limit',
            status: 429,
          }),
        };
      }
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  await assert.rejects(
    recovery.saveNewPassword('strong-new-password'),
    /Too many requests/i,
  );
  assert.equal(recovery.isPending(), true);
  assert.equal(
    friendlyAuthError(Object.assign(new Error('Too many requests'), {
      code: 'over_request_rate_limit',
      status: 429,
    })),
    'Zu viele Versuche in kurzer Zeit. Warte bitte einige Minuten und versuche es dann erneut.',
  );

  await recovery.saveNewPassword('strong-new-password');
  assert.equal(updateAttempts, 2);
  assert.equal(recovery.isPending(), false);
});

test('behält die Wiederherstellungssitzung bei einem vorübergehenden Sitzungs-Netzwerkfehler', async () => {
  let sessionAttempts = 0;
  const recovery = createPasswordRecovery(createAuth({
    getSession: async () => {
      sessionAttempts += 1;
      if (sessionAttempts === 1) throw new Error('Network request failed');
      return { data: { session: validSession }, error: null };
    },
  }));
  recovery.markRecoverySession(true);

  await assert.rejects(recovery.saveNewPassword('strong-new-password'), /Network request failed/i);
  assert.equal(recovery.isPending(), true);

  await recovery.saveNewPassword('strong-new-password');
  assert.equal(sessionAttempts, 2);
  assert.equal(recovery.isPending(), false);
});

test('verarbeitet Supabase-Recovery-Links ohne CupCal-Flow-Parameter', async () => {
  let exchangedCode;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async (code) => {
      exchangedCode = code;
      return { error: null };
    },
  }));

  assert.equal(
    await recovery.handlePasswordResetUrl(
      'cupcal-android://auth/reset?code=recovery-code&type=recovery',
    ),
    true,
  );
  assert.equal(exchangedCode, 'recovery-code');
  assert.equal(recovery.isPending(), true);
});

test('übergibt aktuelle und ältere Flow-IDs aus Query und Fragment an Supabase', async (t) => {
  const cases = [
    {
      name: 'sb_flow_id in der Query',
      parameters: '?code=code-query-sb&type=recovery&sb_flow_id=query-sb',
      code: 'code-query-sb',
      flowId: 'query-sb',
    },
    {
      name: 'sb_flow_id im Fragment',
      parameters: '#code=code-fragment-sb&type=recovery&sb_flow_id=fragment-sb',
      code: 'code-fragment-sb',
      flowId: 'fragment-sb',
    },
    {
      name: 'älteres flow_id in der Query',
      parameters: '?code=code-query-legacy&type=recovery&flow_id=query-legacy',
      code: 'code-query-legacy',
      flowId: 'query-legacy',
    },
    {
      name: 'älteres flow_id im Fragment',
      parameters: '#code=code-fragment-legacy&type=recovery&flow_id=fragment-legacy',
      code: 'code-fragment-legacy',
      flowId: 'fragment-legacy',
    },
  ];

  for (const { name, parameters, code, flowId } of cases) {
    await t.test(name, async () => {
      let exchangeArguments;
      const recovery = createPasswordRecovery(createAuth({
        exchangeCodeForSession: async (...args) => {
          exchangeArguments = args;
          return { error: null };
        },
      }));

      assert.equal(
        await recovery.handlePasswordResetUrl(`cupcal-android://auth/reset${parameters}`),
        true,
      );
      assert.deepEqual(exchangeArguments, [
        code,
        { flowId },
      ]);
    });
  }
});

test('ordnet gleichzeitige Wiederherstellungslinks auch bei möglicher umgekehrter Abschlussreihenfolge', async () => {
  let releaseFirstExchange;
  const firstExchange = new Promise((resolve) => {
    releaseFirstExchange = resolve;
  });
  const calls = [];
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: (code, options) => {
      calls.push({ code, options });
      if (code === 'older-code') return firstExchange;
      return Promise.resolve({ error: null });
    },
  }));
  const olderUrl =
    'cupcal-android://auth/reset?code=older-code&type=recovery&flow_id=older-flow';
  const newerUrl =
    'cupcal-android://auth/reset?code=newer-code&type=recovery&flow_id=newer-flow';

  const olderRequest = recovery.handlePasswordResetUrl(olderUrl);
  await Promise.resolve();
  assert.deepEqual(calls, [{
    code: 'older-code',
    options: { flowId: 'older-flow' },
  }]);

  const newerRequest = recovery.handlePasswordResetUrl(newerUrl);
  assert.equal(recovery.isPending(), false);
  await Promise.resolve();
  assert.equal(calls.length, 1);

  // The newer exchange would finish immediately, so it must wait rather than
  // letting an older result overwrite Supabase's active recovery session.
  releaseFirstExchange({ error: null });
  assert.equal(await olderRequest, true);
  assert.equal(await newerRequest, true);
  assert.deepEqual(calls, [
    { code: 'older-code', options: { flowId: 'older-flow' } },
    { code: 'newer-code', options: { flowId: 'newer-flow' } },
  ]);
  assert.equal(recovery.isPending(), true);
});

test('ordnet gleichzeitige Wiederherstellungslinks mit Flow-IDs im Fragment korrekt zu', async () => {
  let releaseFirstExchange;
  const firstExchange = new Promise((resolve) => {
    releaseFirstExchange = resolve;
  });
  const calls = [];
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: (code, options) => {
      calls.push({ code, options });
      if (code === 'older-code') return firstExchange;
      return Promise.resolve({ error: null });
    },
  }));
  const olderUrl =
    'cupcal-android://auth/reset#code=older-code&type=recovery&flow_id=older-flow';
  const newerUrl =
    'cupcal-android://auth/reset#code=newer-code&type=recovery&flow_id=newer-flow';

  const olderRequest = recovery.handlePasswordResetUrl(olderUrl);
  await Promise.resolve();
  assert.deepEqual(calls, [{
    code: 'older-code',
    options: { flowId: 'older-flow' },
  }]);

  const newerRequest = recovery.handlePasswordResetUrl(newerUrl);
  assert.equal(recovery.isPending(), false);
  await Promise.resolve();
  assert.equal(calls.length, 1);

  releaseFirstExchange({ error: null });
  assert.equal(await olderRequest, true);
  assert.equal(await newerRequest, true);
  assert.deepEqual(calls, [
    { code: 'older-code', options: { flowId: 'older-flow' } },
    { code: 'newer-code', options: { flowId: 'newer-flow' } },
  ]);
  assert.equal(recovery.isPending(), true);
});

test('verarbeitet ältere Reset-Links mit Code im auth/reset-Pfad', async () => {
  let exchangedCode;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async (code) => {
      exchangedCode = code;
      return { error: null };
    },
  }));

  assert.equal(
    await recovery.handlePasswordResetUrl(
      'cupcal-android://auth/reset?code=legacy-recovery-code',
    ),
    true,
  );
  assert.equal(exchangedCode, 'legacy-recovery-code');
  assert.equal(recovery.isPending(), true);
});

test('ignoriert Codes auf anderen Deep-Link-Routen', async () => {
  let exchangeCalled = false;
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async () => {
      exchangeCalled = true;
      return { error: null };
    },
  }));

  assert.equal(
    await recovery.handlePasswordResetUrl('cupcal-android://auth/confirm?code=confirmation-code'),
    false,
  );
  assert.equal(
    await recovery.handlePasswordResetUrl('cupcal-android://auth/confirm#error_code=otp_expired'),
    false,
  );
  assert.equal(exchangeCalled, false);
});

test('verarbeitet Supabase-Recovery-Sitzungen in URL-Fragmenten ohne CupCal-Flow-Parameter', async () => {
  let receivedSession;
  const recovery = createPasswordRecovery(createAuth({
    setSession: async (session) => {
      receivedSession = session;
      return { error: null };
    },
  }));

  assert.equal(
    await recovery.handlePasswordResetUrl(
      'cupcal-android://auth/reset#access_token=recovery-access&refresh_token=recovery-refresh&type=recovery',
    ),
    true,
  );
  assert.deepEqual(receivedSession, {
    access_token: 'recovery-access',
    refresh_token: 'recovery-refresh',
  });
  assert.equal(recovery.isPending(), true);
});

test('verarbeitet denselben Link aus Kaltstart und URL-Ereignis nur einmal', async () => {
  let exchangeCount = 0;
  let finishExchange;
  let markExchangeStarted;
  const exchangeStarted = new Promise((resolve) => {
    markExchangeStarted = resolve;
  });
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async (code) => {
      assert.equal(code, 'one-time-code');
      exchangeCount += 1;
      markExchangeStarted();
      return new Promise((resolve) => {
        finishExchange = resolve;
      });
    },
  }));

  const coldStart = recovery.handlePasswordResetUrl(recoveryUrl);
  await exchangeStarted;
  const runningAppEvent = recovery.handlePasswordResetUrl(recoveryUrl);

  assert.equal(exchangeCount, 1);
  finishExchange({ error: null });
  assert.equal(await coldStart, true);
  assert.equal(await runningAppEvent, true);
  assert.equal(exchangeCount, 1);
  assert.equal(recovery.isPending(), true);
});

test('verarbeitet ältere Wiederherstellungslinks mit Token im URL-Fragment', async () => {
  let suppliedSession;
  const recovery = createPasswordRecovery(createAuth({
    setSession: async (session) => {
      suppliedSession = session;
      return { error: null };
    },
  }));

  assert.equal(
    await recovery.handlePasswordResetUrl(
      'cupcal-android://auth/reset?flow=cupcal-password-reset#access_token=access&refresh_token=refresh&type=recovery',
    ),
    true,
  );
  assert.deepEqual(suppliedSession, {
    access_token: 'access',
    refresh_token: 'refresh',
  });
  assert.equal(recovery.isPending(), true);
});

const livePasswordTestEnabled =
  process.env.CUPCAL_RUN_SUPABASE_PASSWORD_LIVE_TEST === '1';

function isPrivilegedSupabaseKey(key) {
  if (key.startsWith('sb_secret_')) return true;

  const [, payload] = key.split('.');
  if (!payload) return false;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}

test(
  'vergleicht die Unicode-Mindestlänge mit Supabase über ein entbehrliches Testkonto',
  { skip: !livePasswordTestEnabled },
  async () => {
    const supabaseUrl = (
      process.env.SUPABASE_URL ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      ''
    ).trim();
    const publishableKey =
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_ANON_KEY;
    const missingEnv = [
      !supabaseUrl && 'SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL',
      !process.env.CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL?.trim() &&
        'CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL',
      !process.env.CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD &&
        'CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD',
      !publishableKey?.trim() && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY',
    ].filter(Boolean);
    assert.deepEqual(
      missingEnv,
      [],
      `Für den opt-in Live-Test fehlen: ${missingEnv.join(', ')}`,
    );
    assert.equal(
      isPrivilegedSupabaseKey(publishableKey.trim()),
      false,
      'Der Live-Test akzeptiert ausschließlich einen öffentlichen Publishable- oder Anon-Key, keinen Service-Role- oder Secret-Key.',
    );

    const testClient = createClient(
      supabaseUrl,
      publishableKey.trim(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const email = process.env.CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL.trim();
    const initialPassword = process.env.CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD;
    let signedInDisposableAccount = false;

    try {
      const { data: signedIn, error: signInError } = await testClient.auth.signInWithPassword({
        email,
        password: initialPassword,
      });
      assert.ifError(signInError);
      assert.equal(
        signedIn.user?.user_metadata?.cupcal_disposable_password_test,
        true,
        'Das angemeldete Konto ist nicht als cupcal_disposable_password_test markiert. Verwende ausschließlich ein eigens dafür angelegtes Wegwerf-Konto.',
      );
      signedInDisposableAccount = true;

      // Supabase counts UTF-8 bytes; CupCal intentionally keeps its six-codepoint
      // UI rule, which is stricter for multibyte passwords but cannot pass a
      // value that Supabase rejects for being shorter than six UTF-8 bytes.
      const cases = [
        {
          label: 'fünf ASCII-Zeichen',
          password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1),
          localAccepted: false,
          supabaseAccepted: false,
        },
        {
          label: 'sechs ASCII-Zeichen',
          password: 'a'.repeat(PASSWORD_MIN_LENGTH),
          localAccepted: true,
          supabaseAccepted: true,
        },
        {
          label: 'ein Emoji',
          password: '😀',
          localAccepted: false,
          supabaseAccepted: false,
        },
        {
          label: 'Emoji plus ein ASCII-Zeichen (fünf UTF-8-Bytes)',
          password: '😀a',
          localAccepted: false,
          supabaseAccepted: false,
        },
        {
          label: 'Emoji plus zwei ASCII-Zeichen (sechs UTF-8-Bytes)',
          password: '😀aa',
          localAccepted: false,
          supabaseAccepted: true,
        },
        {
          label: 'drei vorkomponierte Akzente (sechs UTF-8-Bytes)',
          password: 'é'.repeat(3),
          localAccepted: false,
          supabaseAccepted: true,
        },
        {
          label: 'zwei Emoji',
          password: '😀'.repeat(2),
          localAccepted: false,
          supabaseAccepted: true,
        },
        {
          label: 'fünf vorkomponierte Akzente',
          password: 'é'.repeat(5),
          localAccepted: false,
          supabaseAccepted: true,
        },
        {
          label: 'fünf Emoji',
          password: '😀'.repeat(PASSWORD_MIN_LENGTH - 1),
          localAccepted: false,
          supabaseAccepted: true,
        },
        {
          label: 'sechs Emoji',
          password: '😀'.repeat(PASSWORD_MIN_LENGTH),
          localAccepted: true,
          supabaseAccepted: true,
        },
        {
          label: 'sechs vorkomponierte Akzente',
          password: 'é'.repeat(PASSWORD_MIN_LENGTH),
          localAccepted: true,
          supabaseAccepted: true,
        },
        {
          label: 'drei zerlegte Akzente',
          password: 'e\u0301'.repeat(3),
          localAccepted: true,
          supabaseAccepted: true,
        },
      ];

      for (const sample of cases) {
        const localAccepted = passwordLengthRequirementError(sample.password) === null;
        assert.equal(
          localAccepted,
          sample.localAccepted,
          `${sample.label}: lokale Codepoint-Zählung ergab ein unerwartetes Ergebnis.`,
        );

        const { error } = await testClient.auth.updateUser({ password: sample.password });
        assert.equal(
          error === null,
          sample.supabaseAccepted,
          `${sample.label}: unerwartete Supabase-Entscheidung${error ? ` (Supabase: ${error.message})` : ''}.`,
        );
      }
    } finally {
      try {
        if (signedInDisposableAccount) {
          const { error } = await testClient.auth.updateUser({ password: initialPassword });
          assert.equal(
            error,
            null,
            `Das ursprüngliche Passwort des Wegwerf-Kontos konnte nicht wiederhergestellt werden${error?.message ? `: ${error.message}` : '.'}`,
          );
          await testClient.auth.signOut();
        }
      } finally {
        await testClient.auth.dispose();
      }
    }
  },
);
