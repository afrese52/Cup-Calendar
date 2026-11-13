import assert from 'node:assert/strict';
import test from 'node:test';
import {
  establishAuthCallbackSession,
  parseAuthCallbackUrl,
  requestAccountDeletionConfirmation,
} from './accountDeletion.ts';

test('fordert den Bestätigungslink an die angemeldete E-Mail-Adresse an', async () => {
  let request;
  await requestAccountDeletionConfirmation({
    signInWithOtp: async (value) => {
      request = value;
      return { error: null };
    },
  }, ' user@example.invalid ', 'https://cupcal.example/auth/confirm?flow=delete');

  assert.deepEqual(request, {
    email: 'user@example.invalid',
    options: {
      emailRedirectTo: 'https://cupcal.example/auth/confirm?flow=delete',
      shouldCreateUser: false,
    },
  });
});

test('bricht ohne gültige E-Mail oder Rücksprung ab, bevor eine E-Mail gesendet wird', async () => {
  let sent = false;
  const auth = {
    signInWithOtp: async () => {
      sent = true;
      return { error: null };
    },
  };

  await assert.rejects(
    requestAccountDeletionConfirmation(auth, ' ', 'https://cupcal.example/auth/confirm'),
    /keine E-Mail-Adresse/i,
  );
  await assert.rejects(
    requestAccountDeletionConfirmation(auth, 'user@example.invalid', ''),
    /Rücksprung/i,
  );
  assert.equal(sent, false);
});

test('liest Auth-Codes aus Query und Sitzungstoken aus dem URL-Fragment', () => {
  assert.deepEqual(
    parseAuthCallbackUrl(
      'https://cupcal.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=proof#access_token=access&refresh_token=refresh',
    ),
    {
      code: null,
      accessToken: 'access',
      refreshToken: 'refresh',
      flowId: null,
      flow: 'cupcal-account-deletion',
      deletionToken: 'proof',
      error: null,
      errorDescription: null,
    },
  );
});

test('behält Löschkennung und aktuelle PKCE-Flow-ID bei einem nativen Rücksprung', () => {
  const callback = parseAuthCallbackUrl(
    'cupcal-android://auth/confirm?flow=cupcal-account-deletion&deletion_token=signed.proof&sb_flow_id=deletion-flow&code=one-time-code',
  );

  assert.equal(callback.flow, 'cupcal-account-deletion');
  assert.equal(callback.deletionToken, 'signed.proof');
  assert.equal(callback.flowId, 'deletion-flow');
  assert.equal(callback.code, 'one-time-code');
});

test('liest die aktuelle PKCE-Flow-ID auch aus dem Fragment', () => {
  assert.equal(
    parseAuthCallbackUrl('cupcal-android://auth/confirm#sb_flow_id=fragment-flow&code=code').flowId,
    'fragment-flow',
  );
});

test('tauscht einen PKCE-Code gegen die bestätigte Sitzung', async () => {
  let exchanged;
  let exchangedOptions;
  const session = { user: { id: 'user-id' } };
  const result = await establishAuthCallbackSession({
    exchangeCodeForSession: async (code, options) => {
      exchanged = code;
      exchangedOptions = options;
      return { data: { session }, error: null };
    },
    setSession: async () => ({ data: { session: null }, error: null }),
  }, { code: 'one-time-code', flowId: 'callback-flow' });

  assert.equal(exchanged, 'one-time-code');
  assert.deepEqual(exchangedOptions, { flowId: 'callback-flow' });
  assert.equal(result, session);
});

test('stellt eine implizite Sitzung aus den Fragmenttoken her', async () => {
  let sessionInput;
  const session = { user: { id: 'user-id' } };
  const result = await establishAuthCallbackSession({
    exchangeCodeForSession: async () => ({ data: { session: null }, error: null }),
    setSession: async (value) => {
      sessionInput = value;
      return { data: { session }, error: null };
    },
  }, { accessToken: 'access', refreshToken: 'refresh' });

  assert.deepEqual(sessionInput, { access_token: 'access', refresh_token: 'refresh' });
  assert.equal(result, session);
});

for (const reason of ['abgelaufen', 'bereits verwendet']) {
  test(`verwendet nach einem ${reason}en Auth-Code keine bestehende Sitzung als Ersatz`, async () => {
    const providerError = new Error(`Der Auth-Code ist ${reason}.`);
    let fallbackCalled = false;
    await assert.rejects(
      establishAuthCallbackSession({
        exchangeCodeForSession: async () => ({
          data: { session: null },
          error: providerError,
        }),
        setSession: async () => {
          fallbackCalled = true;
          return { data: { session: { user: { id: 'account-id' } } }, error: null };
        },
      }, { code: 'invalid-one-time-code' }),
      (error) => error === providerError,
    );
    assert.equal(fallbackCalled, false);
  });
}

test('verlangt einen Auth-Code oder vollständige Sitzungstoken statt nur einer Löschkennung', async () => {
  let authCalled = false;
  await assert.rejects(
    establishAuthCallbackSession({
      exchangeCodeForSession: async () => {
        authCalled = true;
        return { data: { session: null }, error: null };
      },
      setSession: async () => {
        authCalled = true;
        return { data: { session: null }, error: null };
      },
    }, { flow: 'cupcal-account-deletion', deletionToken: 'signed.proof' }),
    /keine gültige Sitzung/i,
  );
  assert.equal(authCalled, false);
});
