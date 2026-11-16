import assert from 'node:assert/strict';
import test from 'node:test';
import { createCupCalSupabaseClient } from './createSupabaseClient.ts';
import { createMigratingSecureStorage } from './secureSessionStorage.ts';
import { confirmEmailCode } from './accountAuth.ts';

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
}

const userId = '00000000-0000-4000-8000-000000000093';
const email = 'secure-session-test@example.invalid';
const accessToken = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url'),
  'test-signature',
].join('.');

const fakeUserFetch = async () => new Response(JSON.stringify({
  id: userId,
  email,
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
  test(`migriert bestehende ${platform}-Sitzungen und erhält Anmeldung, Neustart und Abmeldung`, async () => {
    const legacyStorage = createStorage();
    const secureStorage = createStorage();
    const clientWithLegacyStorage = createCupCalSupabaseClient(
      'https://secure-session.supabase.co',
      'test-publishable-key',
      legacyStorage,
      fakeUserFetch,
    );

    const { error: setError } = await clientWithLegacyStorage.auth.setSession({
      access_token: accessToken,
      refresh_token: `legacy-refresh-token-${platform}`,
    });
    assert.equal(setError, null);
    const sessionKey = 'sb-secure-session-auth-token';
    assert.ok(await legacyStorage.getItem(sessionKey));

    const migratedStorage = createMigratingSecureStorage(secureStorage, legacyStorage);
    const clientAfterUpgrade = createCupCalSupabaseClient(
      'https://secure-session.supabase.co',
      'test-publishable-key',
      migratedStorage,
      fakeUserFetch,
    );
    const restored = await clientAfterUpgrade.auth.getSession();
    assert.equal(restored.error, null);
    assert.equal(restored.data.session?.user.id, userId);
    assert.equal(await legacyStorage.getItem(sessionKey), null);
    assert.ok(await secureStorage.getItem(sessionKey));

    const clientAfterRestart = createCupCalSupabaseClient(
      'https://secure-session.supabase.co',
      'test-publishable-key',
      createMigratingSecureStorage(secureStorage, legacyStorage),
      fakeUserFetch,
    );
    const restarted = await clientAfterRestart.auth.getSession();
    assert.equal(restarted.error, null);
    assert.equal(restarted.data.session?.user.email, email);

    const { error: signOutError } = await clientAfterRestart.auth.signOut({ scope: 'local' });
    assert.equal(signOutError, null);
    assert.equal(await secureStorage.getItem(sessionKey), null);
    assert.equal(await legacyStorage.getItem(sessionKey), null);

    await clientWithLegacyStorage.auth.dispose();
    await clientAfterUpgrade.auth.dispose();
    await clientAfterRestart.auth.dispose();
  });
}

for (const platform of ['Android', 'iOS']) {
  test(`startet nach Wiederherstellung ohne übertragbaren Geräteschlüssel auf ${platform} abgemeldet`, async () => {
    const oldSecureStorage = createStorage();
    const oldLegacyStorage = createStorage();
    const oldClient = createCupCalSupabaseClient(
      'https://restored-device.supabase.co',
      'test-publishable-key',
      createMigratingSecureStorage(oldSecureStorage, oldLegacyStorage),
      fakeUserFetch,
    );
    const { error: saveError } = await oldClient.auth.setSession({
      access_token: accessToken,
      refresh_token: `device-bound-refresh-token-${platform}`,
    });
    assert.equal(saveError, null);
    assert.ok(await oldSecureStorage.getItem('sb-restored-device-auth-token'));

    // Eine Gerätewiederherstellung überträgt den gerätegebundenen SecureStore
    // nicht. Der neue Gerätespeicher ist absichtlich leer.
    const restoredStorage = createMigratingSecureStorage(createStorage(), createStorage());
    const restoredClient = createCupCalSupabaseClient(
      'https://restored-device.supabase.co',
      'test-publishable-key',
      restoredStorage,
      fakeUserFetch,
    );

    try {
      const { data, error } = await restoredClient.auth.getSession();
      assert.equal(error, null);
      assert.equal(data.session, null);
    } finally {
      await oldClient.auth.dispose();
      await restoredClient.auth.dispose();
    }
  });
}

test('behält den alten Sitzungswert, wenn die sichere Migration fehlschlägt', async () => {
  const legacyStorage = createStorage();
  const secureStorage = createStorage();
  const oldValue = JSON.stringify({ refresh_token: 'must-not-be-lost' });
  await legacyStorage.setItem('sb-project-auth-token', oldValue);
  secureStorage.setItem = async () => {
    throw new Error('Protected storage unavailable');
  };
  const storage = createMigratingSecureStorage(secureStorage, legacyStorage);

  await assert.rejects(storage.getItem('sb-project-auth-token'), /Protected storage unavailable/);
  assert.equal(await legacyStorage.getItem('sb-project-auth-token'), oldValue);
});

test('löscht bei Abmeldung zuerst den alten Klartextwert', async () => {
  const legacyStorage = createStorage();
  const secureStorage = createStorage();
  const key = 'sb-project-auth-token';
  await legacyStorage.setItem(key, 'legacy');
  await secureStorage.setItem(key, 'protected');
  secureStorage.removeItem = async () => {
    throw new Error('Protected storage unavailable');
  };
  const storage = createMigratingSecureStorage(secureStorage, legacyStorage);

  await assert.rejects(storage.removeItem(key), /Protected storage unavailable/);
  assert.equal(await legacyStorage.getItem(key), null);
  assert.equal(await secureStorage.getItem(key), 'protected');
});

test('migriert einen vorhandenen PKCE-Verifier vor der E-Mail-Bestätigung', async () => {
  const legacyStorage = createStorage();
  const secureStorage = createStorage();
  const projectRef = 'secure-pkce-migration';
  const flowId = '11111111-1111-4111-8111-111111111093';
  const verifierKey = `sb-${projectRef}-auth-token-flow-${flowId}-code-verifier`;
  await legacyStorage.setItem(verifierKey, JSON.stringify('legacy-verifier/signup'));

  const secureWrites = [];
  const setSecureItem = secureStorage.setItem;
  secureStorage.setItem = async (key, value) => {
    secureWrites.push(key);
    await setSecureItem(key, value);
  };
  let tokenRequest;
  const confirmationFetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/token')) {
      tokenRequest = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        access_token: accessToken,
        refresh_token: 'confirmed-secure-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: userId,
          email,
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
  const client = createCupCalSupabaseClient(
    `https://${projectRef}.supabase.co`,
    'test-publishable-key',
    createMigratingSecureStorage(secureStorage, legacyStorage),
    confirmationFetch,
  );

  try {
    const session = await confirmEmailCode(client.auth, 'legacy-confirmation-code', flowId);
    assert.equal(session.user.id, userId);
    assert.deepEqual(tokenRequest, {
      auth_code: 'legacy-confirmation-code',
      code_verifier: 'legacy-verifier',
    });
    assert.ok(secureWrites.includes(verifierKey));
    assert.equal(await legacyStorage.getItem(verifierKey), null);
    assert.equal(await secureStorage.getItem(verifierKey), null);
  } finally {
    await client.auth.dispose();
  }
});
