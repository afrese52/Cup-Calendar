import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordRecovery } from './passwordRecovery.ts';
import { friendlyAuthError } from './accountAuth.ts';

const validSession = {
  access_token: 'recovery-access-token',
  refresh_token: 'recovery-refresh-token',
  user: { id: 'account-a' },
};
const recoveryUrl = 'cupcal://auth/reset?flow=cupcal-password-reset&code=one-time-code';

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
      'cupcal://auth/reset?flow=cupcal-password-reset&error_code=access_denied',
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
