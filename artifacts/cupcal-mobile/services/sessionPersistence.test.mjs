import assert from 'node:assert/strict';
import test from 'node:test';
import { createCupCalSupabaseClient } from './createSupabaseClient.ts';
import { confirmEmailCode } from './accountAuth.ts';

const testUserId = '00000000-0000-4000-8000-000000000015';
const testEmail = 'restart-test@example.invalid';
const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

function encodeJwtPayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

const accessToken = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  encodeJwtPayload({
    sub: testUserId,
    email: testEmail,
    role: 'authenticated',
    aud: 'authenticated',
    exp: expiresAt,
  }),
  'test-signature',
].join('.');

function createPersistentStorage() {
  const values = new Map();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
}

const fakeUserFetch = async () => new Response(JSON.stringify({
  id: testUserId,
  email: testEmail,
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date(0).toISOString(),
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

for (const platform of ['Android', 'iOS']) {
  test(`stellt eine lokal gespeicherte Sitzung nach einem App-Neustart auf ${platform} wieder her`, async () => {
    const storage = createPersistentStorage();
    const url = `https://${platform.toLowerCase()}.supabase.co`;
    const firstClient = createCupCalSupabaseClient(
      url,
      'test-publishable-key',
      storage,
      fakeUserFetch,
    );

    const { error: saveError } = await firstClient.auth.setSession({
      access_token: accessToken,
      refresh_token: `test-refresh-token-${platform}`,
    });
    assert.equal(saveError, null);

    // Ein neuer Client steht für einen beendeten und erneut gestarteten Prozess.
    const restartedClient = createCupCalSupabaseClient(
      url,
      'test-publishable-key',
      storage,
      fakeUserFetch,
    );
    const { data, error } = await restartedClient.auth.getSession();

    assert.equal(error, null);
    assert.equal(data.session?.user.id, testUserId);
    assert.equal(data.session?.user.email, testEmail);

    await firstClient.auth.dispose();
    await restartedClient.auth.dispose();
  });
}

for (const platform of ['Android', 'iOS']) {
  test(`stellt die bestätigte E-Mail-Sitzung nach einem Neustart auf ${platform} wieder her`, async () => {
    const storage = createPersistentStorage();
    const projectRef = `confirmation-${platform.toLowerCase()}`;
    const flowId = `11111111-1111-4111-8111-${platform === 'Android' ? '111111111111' : '222222222222'}`;
    await storage.setItem(
      `sb-${projectRef}-auth-token-flow-${flowId}-code-verifier`,
      JSON.stringify('signup-verifier/signup'),
    );
    let tokenRequest;
    const confirmationFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/token')) {
        tokenRequest = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          access_token: accessToken,
          refresh_token: `confirmed-refresh-token-${platform}`,
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: testUserId,
            email: testEmail,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: new Date(0).toISOString(),
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return fakeUserFetch(input, init);
    };
    const url = `https://${projectRef}.supabase.co`;
    const client = createCupCalSupabaseClient(
      url,
      'test-publishable-key',
      storage,
      confirmationFetch,
    );

    const confirmedSession = await confirmEmailCode(
      client.auth,
      'test-confirmation-code',
      flowId,
    );
    assert.equal(confirmedSession.user.email, testEmail);
    assert.deepEqual(tokenRequest, {
      auth_code: 'test-confirmation-code',
      code_verifier: 'signup-verifier',
    });

    // Ein neuer Client bildet den Prozess nach einem erzwungenen App-Ende ab.
    const restartedClient = createCupCalSupabaseClient(
      url,
      'test-publishable-key',
      storage,
      fakeUserFetch,
    );
    const restored = await restartedClient.auth.getSession();
    assert.equal(restored.error, null);
    assert.equal(restored.data.session?.user.id, testUserId);
    assert.equal(restored.data.session?.user.email, testEmail);

    await client.auth.dispose();
    await restartedClient.auth.dispose();
  });
}

test('ordnet zwei offene Registrierungslinks den Konten zu und meldet zuletzt das zweite an', async () => {
  const storage = createPersistentStorage();
  const signUpRedirects = [];
  const tokenRequests = [];
  const accountByCode = new Map([
    ['account-a-code', {
      id: '00000000-0000-4000-8000-000000000021',
      email: 'account-a@example.invalid',
    }],
    ['account-b-code', {
      id: '00000000-0000-4000-8000-000000000022',
      email: 'account-b@example.invalid',
    }],
  ]);
  const multiAccountFetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/signup')) {
      signUpRedirects.push(url.searchParams.get('redirect_to'));
      return new Response(JSON.stringify({
        id: '00000000-0000-4000-8000-000000000020',
        email: 'pending@example.invalid',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: new Date(0).toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.pathname.endsWith('/token')) {
      const request = JSON.parse(String(init?.body));
      tokenRequests.push(request);
      const user = accountByCode.get(request.auth_code);
      if (!user) return new Response(JSON.stringify({ message: 'Unknown test code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(JSON.stringify({
        access_token: accessToken,
        refresh_token: `confirmed-${user.id}`,
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          ...user,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: new Date(0).toISOString(),
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return fakeUserFetch(input, init);
  };
  const client = createCupCalSupabaseClient(
    'https://multi-account-confirmation.supabase.co',
    'test-publishable-key',
    storage,
    multiAccountFetch,
  );

  try {
    const redirectTo = 'cupcal-android://auth/confirm?flow=cupcal-email-confirmation';
    const signUpA = await client.auth.signUp({
      email: 'account-a@example.invalid',
      password: 'test-password-a',
      options: { emailRedirectTo: redirectTo },
    });
    const signUpB = await client.auth.signUp({
      email: 'account-b@example.invalid',
      password: 'test-password-b',
      options: { emailRedirectTo: redirectTo },
    });

    assert.equal(signUpA.error, null);
    assert.equal(signUpB.error, null);
    const callbackA = new URL(signUpRedirects[0]);
    const callbackB = new URL(signUpRedirects[1]);
    const flowIdA = callbackA.searchParams.get('sb_flow_id');
    const flowIdB = callbackB.searchParams.get('sb_flow_id');
    assert.ok(flowIdA);
    assert.ok(flowIdB);
    assert.notEqual(flowIdA, flowIdB);

    const verifierA = JSON.parse(await storage.getItem(
      `sb-multi-account-confirmation-auth-token-flow-${flowIdA}-code-verifier`,
    ));
    const verifierB = JSON.parse(await storage.getItem(
      `sb-multi-account-confirmation-auth-token-flow-${flowIdB}-code-verifier`,
    ));
    assert.notEqual(verifierA, verifierB);

    const sessionA = await confirmEmailCode(client.auth, 'account-a-code', flowIdA);
    assert.equal(sessionA.user.id, accountByCode.get('account-a-code').id);
    assert.equal(tokenRequests[0].code_verifier, verifierA);
    assert.equal((await client.auth.getSession()).data.session?.user.email, 'account-a@example.invalid');

    const sessionB = await confirmEmailCode(client.auth, 'account-b-code', flowIdB);
    assert.equal(sessionB.user.id, accountByCode.get('account-b-code').id);
    assert.equal(tokenRequests[1].code_verifier, verifierB);
    const finalSession = await client.auth.getSession();
    assert.equal(finalSession.data.session?.user.id, accountByCode.get('account-b-code').id);
    assert.equal(finalSession.data.session?.user.email, 'account-b@example.invalid');
  } finally {
    await client.auth.dispose();
  }
});
