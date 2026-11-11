import assert from 'node:assert/strict';
import test from 'node:test';
import { createCupCalSupabaseClient } from './createSupabaseClient.ts';

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
