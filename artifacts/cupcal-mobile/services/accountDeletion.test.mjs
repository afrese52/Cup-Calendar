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
      flow: 'cupcal-account-deletion',
      deletionToken: 'proof',
      error: null,
      errorDescription: null,
    },
  );
});

test('tauscht einen PKCE-Code gegen die bestätigte Sitzung', async () => {
  let exchanged;
  const session = { user: { id: 'user-id' } };
  const result = await establishAuthCallbackSession({
    exchangeCodeForSession: async (code) => {
      exchanged = code;
      return { data: { session }, error: null };
    },
    setSession: async () => ({ data: { session: null }, error: null }),
  }, { code: 'one-time-code' });

  assert.equal(exchanged, 'one-time-code');
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
