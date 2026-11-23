import assert from 'node:assert/strict';
import test from 'node:test';
import { createCupCalSupabaseClient } from './createSupabaseClient.ts';
import { confirmEmailCode, friendlyAuthError, signOutAccount } from './accountAuth.ts';

const testUserId = '00000000-0000-4000-8000-000000000015';
const testEmail = 'restart-test@example.invalid';
const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

test('übernimmt Retry-After aus einer echten Supabase-HTTP-Antwort', async () => {
  const client = createCupCalSupabaseClient(
    'https://retry-after.supabase.co',
    'test-publishable-key',
    {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    },
    async () => new Response(JSON.stringify({
      message: 'Too many requests',
      code: 'over_request_rate_limit',
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '30',
      },
    }),
  );

  const { error } = await client.auth.signUp({
    email: 'retry@example.invalid',
    password: 'test-password',
  });

  assert.ok(error);
  assert.equal(
    friendlyAuthError(error),
    'Zu viele Versuche in kurzer Zeit. Bitte warte noch 30 Sekunden und versuche es dann erneut.',
  );
});

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

test('verwirft beschädigte und unvollständige gespeicherte Sitzungen sicher', async () => {
  const storageKey = 'sb-damaged-session-auth-token';
  for (const [kind, storedValue] of [
    ['unlesbares JSON', '{not-json'],
    ['unvollständige Sitzung', JSON.stringify({ access_token: 'partial-test-token' })],
  ]) {
    const storage = createPersistentStorage();
    await storage.setItem(storageKey, storedValue);
    const client = createCupCalSupabaseClient(
      'https://damaged-session.supabase.co',
      'test-publishable-key',
      storage,
      fakeUserFetch,
    );

    try {
      const { data, error } = await client.auth.getSession();

      assert.equal(error, null, `${kind} darf den App-Start nicht abbrechen`);
      assert.equal(data.session, null, `${kind} darf kein angemeldetes Konto erzeugen`);
      assert.equal(await storage.getItem(storageKey), null, `${kind} muss entfernt werden`);
    } finally {
      await client.auth.dispose();
    }
  }
});

test('behält eine noch gültige Sitzung bei einem vorübergehenden Refresh-Netzwerkausfall und erholt sich danach', async () => {
  const storage = createPersistentStorage();
  const projectRef = 'startup-network-outage';
  const storageKey = `sb-${projectRef}-auth-token`;
  const initialExpiresAt = Math.floor(Date.now() / 1000) + 85;
  const initialAccessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    encodeJwtPayload({
      sub: testUserId,
      email: testEmail,
      role: 'authenticated',
      aud: 'authenticated',
      exp: initialExpiresAt,
    }),
    'initial-test-signature',
  ].join('.');
  const initialSession = {
    access_token: initialAccessToken,
    refresh_token: 'recoverable-refresh-token',
    token_type: 'bearer',
    expires_in: 85,
    expires_at: initialExpiresAt,
    user: {
      id: testUserId,
      email: testEmail,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };
  await storage.setItem(storageKey, JSON.stringify(initialSession));

  let refreshAttempts = 0;
  let networkAvailable = false;
  const recoveredAccessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    encodeJwtPayload({
      sub: testUserId,
      email: testEmail,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    'recovered-test-signature',
  ].join('.');
  const fetchDuringOutage = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/token')) {
      refreshAttempts += 1;
      if (!networkAvailable) throw new TypeError('Network request failed');
      return new Response(JSON.stringify({
        access_token: recoveredAccessToken,
        refresh_token: 'rotated-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: initialSession.user,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return fakeUserFetch(input);
  };
  const client = createCupCalSupabaseClient(
    `https://${projectRef}.supabase.co`,
    'test-publishable-key',
    storage,
    fetchDuringOutage,
  );
  let recoveredClient;

  try {
    const duringOutage = await client.auth.getSession();

    assert.equal(duringOutage.error, null);
    assert.equal(duringOutage.data.session?.access_token, initialAccessToken);
    assert.equal(duringOutage.data.session?.user.id, testUserId);
    assert.ok(refreshAttempts >= 1, 'der App-Start muss den Refresh-Endpunkt versuchen');
    assert.equal(
      JSON.parse(await storage.getItem(storageKey)).access_token,
      initialAccessToken,
      'ein fehlgeschlagener Refresh darf keine Sitzung als erneuert speichern',
    );

    // Ein neuer Client bildet einen späteren Wiederanlauf nach, ohne die interne
    // Schutzfrist für fehlgeschlagene Wiederholungen künstlich zu überspringen.
    await client.auth.dispose();
    networkAvailable = true;
    recoveredClient = createCupCalSupabaseClient(
      `https://${projectRef}.supabase.co`,
      'test-publishable-key',
      storage,
      fetchDuringOutage,
    );
    const afterRecovery = await recoveredClient.auth.getSession();

    assert.equal(afterRecovery.error, null);
    assert.equal(afterRecovery.data.session?.access_token, recoveredAccessToken);
    assert.equal(afterRecovery.data.session?.refresh_token, 'rotated-refresh-token');
    assert.ok(refreshAttempts > 1);
    assert.equal(
      JSON.parse(await storage.getItem(storageKey)).access_token,
      recoveredAccessToken,
      'nach Wiederherstellung der Verbindung muss die erneuerte Sitzung gespeichert sein',
    );
  } finally {
    await client.auth.dispose();
    await recoveredClient?.auth.dispose();
  }
});

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

test('verarbeitet den zweiten Bestätigungslink nach Ablehnung des ersten Kontos', async () => {
  const storage = createPersistentStorage();
  const flowIdA = '33333333-3333-4333-8333-333333333333';
  const flowIdB = '44444444-4444-4444-8444-444444444444';
  await storage.setItem(
    `sb-parallel-confirmation-auth-token-flow-${flowIdA}-code-verifier`,
    JSON.stringify('verifier-a/signup'),
  );
  await storage.setItem(
    `sb-parallel-confirmation-auth-token-flow-${flowIdB}-code-verifier`,
    JSON.stringify('verifier-b/signup'),
  );

  let resolveFirstResponse;
  const firstResponse = new Promise((resolve) => {
    resolveFirstResponse = resolve;
  });
  const tokenRequests = [];
  const userForCode = {
    'account-a-code': {
      id: '00000000-0000-4000-8000-000000000031',
      email: 'account-a@example.invalid',
      refreshToken: 'confirmed-refresh-token-a',
    },
    'account-b-code': {
      id: '00000000-0000-4000-8000-000000000032',
      email: 'account-b@example.invalid',
      refreshToken: 'confirmed-refresh-token-b',
    },
  };
  const delayedConfirmationFetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/token')) {
      const request = JSON.parse(String(init?.body));
      tokenRequests.push(request);
      const user = userForCode[request.auth_code];
      const response = new Response(JSON.stringify({
        access_token: accessToken,
        refresh_token: user.refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: user.id,
          email: user.email,
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

      if (request.auth_code === 'account-a-code') return firstResponse;
      return response;
    }
    return fakeUserFetch(input, init);
  };
  const client = createCupCalSupabaseClient(
    'https://parallel-confirmation.supabase.co',
    'test-publishable-key',
    storage,
    delayedConfirmationFetch,
  );

  try {
    const firstConfirmation = confirmEmailCode(client.auth, 'account-a-code', flowIdA);
    const secondConfirmation = confirmEmailCode(client.auth, 'account-b-code', flowIdB);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(tokenRequests.map(({ auth_code }) => auth_code), ['account-a-code']);
    resolveFirstResponse(new Response(JSON.stringify({
      message: 'The authorization code was rejected.',
      code: 'invalid_grant',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }));
    const [firstResult, secondResult] = await Promise.allSettled([
      firstConfirmation,
      secondConfirmation,
    ]);

    assert.equal(firstResult.status, 'rejected');
    assert.equal(secondResult.status, 'fulfilled');
    if (secondResult.status !== 'fulfilled') {
      throw new Error('Der zweite Bestätigungslink hätte erfolgreich sein müssen.');
    }
    assert.equal(secondResult.value.user.id, userForCode['account-b-code'].id);
    assert.deepEqual(tokenRequests.map(({ auth_code }) => auth_code), [
      'account-a-code',
      'account-b-code',
    ]);
    const finalSession = await client.auth.getSession();
    assert.equal(finalSession.data.session?.user.id, userForCode['account-b-code'].id);
    assert.equal(finalSession.data.session?.user.email, userForCode['account-b-code'].email);
  } finally {
    await client.auth.dispose();
  }
});

test('behält die aktive Sitzung nach abgelehnten Bestätigungscodes und akzeptiert danach einen gültigen Link', async () => {
  const storage = createPersistentStorage();
  const projectRef = 'rejected-confirmation-preserves-session';
  const desiredUser = {
    id: '00000000-0000-4000-8000-000000000041',
    email: 'confirmed-account@example.invalid',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
  const desiredAccessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    encodeJwtPayload({
      sub: desiredUser.id,
      email: desiredUser.email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    'desired-account-signature',
  ].join('.');
  const confirmationAttempts = [
    { code: 'rejected-code-one', flowId: '55555555-5555-4555-8555-555555555555' },
    { code: 'rejected-code-two', flowId: '66666666-6666-4666-8666-666666666666' },
    { code: 'valid-confirmation-code', flowId: '77777777-7777-4777-8777-777777777777' },
  ];
  for (const { flowId } of confirmationAttempts) {
    await storage.setItem(
      `sb-${projectRef}-auth-token-flow-${flowId}-code-verifier`,
      JSON.stringify('confirmation-verifier/signup'),
    );
  }

  const authFetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/token')) {
      const request = JSON.parse(String(init?.body));
      if (request.auth_code !== 'valid-confirmation-code') {
        return new Response(JSON.stringify({
          message: 'The authorization code was rejected.',
          code: 'invalid_grant',
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        access_token: desiredAccessToken,
        refresh_token: 'confirmed-desired-account',
        token_type: 'bearer',
        expires_in: 3600,
        user: desiredUser,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return fakeUserFetch(input, init);
  };
  const client = createCupCalSupabaseClient(
    `https://${projectRef}.supabase.co`,
    'test-publishable-key',
    storage,
    authFetch,
  );

  try {
    const { error: saveError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: 'existing-active-session',
    });
    assert.equal(saveError, null);
    const storageKey = `sb-${projectRef}-auth-token`;
    const initialStoredSession = await storage.getItem(storageKey);

    for (const { code, flowId } of confirmationAttempts.slice(0, 2)) {
      await assert.rejects(confirmEmailCode(client.auth, code, flowId));

      const currentSession = await client.auth.getSession();
      assert.equal(currentSession.error, null);
      assert.equal(currentSession.data.session?.user.id, testUserId);
      assert.equal(currentSession.data.session?.user.email, testEmail);
      assert.equal(
        await storage.getItem(storageKey),
        initialStoredSession,
        'ein abgelehnter Code darf die gespeicherte aktive Sitzung nicht verändern',
      );
    }

    const confirmedSession = await confirmEmailCode(
      client.auth,
      'valid-confirmation-code',
      confirmationAttempts[2].flowId,
    );
    assert.equal(confirmedSession.user.id, desiredUser.id);
    assert.equal(confirmedSession.user.email, desiredUser.email);

    const finalSession = await client.auth.getSession();
    assert.equal(finalSession.error, null);
    assert.equal(finalSession.data.session?.user.id, desiredUser.id);
    assert.equal(finalSession.data.session?.user.email, desiredUser.email);
  } finally {
    await client.auth.dispose();
  }
});

test('hält die Abmeldung wirksam, wenn die ausstehende Bestätigung danach erfolgreich zurückkehrt', async () => {
  const storage = createPersistentStorage();
  const projectRef = 'confirmation-after-sign-out';
  const flowId = '88888888-8888-4888-8888-888888888888';
  const storageKey = `sb-${projectRef}-auth-token`;
  await storage.setItem(
    `sb-${projectRef}-auth-token-flow-${flowId}-code-verifier`,
    JSON.stringify('confirmation-verifier/signup'),
  );

  let markRequestStarted;
  const requestStarted = new Promise((resolve) => {
    markRequestStarted = resolve;
  });
  let resolveConfirmationResponse;
  const confirmationResponse = new Promise((resolve) => {
    resolveConfirmationResponse = resolve;
  });
  const delayedFetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/token')) {
      markRequestStarted();
      return confirmationResponse;
    }
    if (url.pathname.endsWith('/logout')) {
      return new Response(null, { status: 204 });
    }
    return fakeUserFetch(input, init);
  };
  const client = createCupCalSupabaseClient(
    `https://${projectRef}.supabase.co`,
    'test-publishable-key',
    storage,
    delayedFetch,
  );

  try {
    const confirmation = confirmEmailCode(
      client.auth,
      'delayed-confirmation-code',
      flowId,
    );
    await requestStarted;

    const signOutResult = await signOutAccount(client.auth);
    assert.equal(signOutResult.ok, true);
    assert.equal((await client.auth.getSession()).data.session, null);

    resolveConfirmationResponse(new Response(JSON.stringify({
      access_token: accessToken,
      refresh_token: 'late-confirmation-refresh-token',
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
    }));

    await assert.rejects(confirmation, /durch die Abmeldung abgebrochen/);
    const finalSession = await client.auth.getSession();
    assert.equal(finalSession.error, null);
    assert.equal(finalSession.data.session, null);
    assert.equal(
      await storage.getItem(storageKey),
      null,
      'die verspätete Bestätigung darf keine Sitzung auf dem Gerät speichern',
    );
  } finally {
    await client.auth.dispose();
  }
});
