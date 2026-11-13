import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordRecovery, PASSWORD_MIN_LENGTH } from './passwordRecovery.ts';
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

test('weist ein zu kurzes Passwort vor der Serveranfrage ab', async () => {
  let updateCalled = false;
  const recovery = createPasswordRecovery(createAuth({
    updateUser: async () => {
      updateCalled = true;
      return { error: null };
    },
  }));
  recovery.markRecoverySession(true);

  await assert.rejects(
    recovery.saveNewPassword('A1!xyz'.slice(0, PASSWORD_MIN_LENGTH - 1)),
    new RegExp(`mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`, 'i'),
  );
  assert.equal(updateCalled, false);
  assert.equal(recovery.isPending(), true);
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
  const recovery = createPasswordRecovery(createAuth({
    exchangeCodeForSession: async (code) => {
      assert.equal(code, 'one-time-code');
      exchangeCount += 1;
      return { error: null };
    },
  }));

  const coldStart = recovery.handlePasswordResetUrl(recoveryUrl);
  const runningAppEvent = recovery.handlePasswordResetUrl(recoveryUrl);

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
