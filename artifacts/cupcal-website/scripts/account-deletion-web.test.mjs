import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let vite;
let accountDeletion;

before(async () => {
  vite = await createServer({
    configFile: false,
    appType: 'custom',
    root: websiteRoot,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    logLevel: 'error',
  });
  accountDeletion = await vite.ssrLoadModule('/src/services/account-deletion-web.ts');
});

after(async () => {
  await vite?.close();
});

test('Erstellt einen Website-Rücksprung mit markiertem Löschablauf', () => {
  const url = new URL(
    accountDeletion.createAccountDeletionWebRedirectUrl(
      'https://cupcal.example',
      'signed-token',
    ),
  );

  assert.equal(url.pathname, '/konto-loeschen/bestaetigen/');
  assert.equal(url.searchParams.get('flow'), 'cupcal-account-deletion');
  assert.equal(url.searchParams.get('deletion_token'), 'signed-token');
});

test('Liest Supabase-Code, Flow-ID und Löschkennung aus dem Rücksprung', () => {
  const callback = accountDeletion.parseAccountDeletionWebCallback(
    'https://cupcal.example/konto-loeschen/bestaetigen/?flow=cupcal-account-deletion&deletion_token=token&code=auth-code&sb_flow_id=flow-7',
  );

  assert.equal(callback.flow, 'cupcal-account-deletion');
  assert.equal(callback.deletionToken, 'token');
  assert.equal(callback.code, 'auth-code');
  assert.equal(callback.flowId, 'flow-7');
});

test('Fordert nach Anmeldung den bestehenden Löschlink per E-Mail an', async () => {
  const calls = [];
  const auth = {
    signInWithPassword: async (credentials) => {
      calls.push(['password', credentials]);
      return {
        data: {
          session: {
            access_token: 'account-session-token',
            user: { id: 'account-id', email: 'owner@example.invalid' },
          },
        },
        error: null,
      };
    },
    signInWithOtp: async (request) => {
      calls.push(['otp', request]);
      return { error: null };
    },
  };

  const recipient = await accountDeletion.requestAccountDeletionWebLink(auth, {
    email: ' owner@example.invalid ',
    password: 'not-recorded',
    origin: 'https://cupcal.example',
    fetchImpl: async (url, options) => {
      calls.push(['api', url.pathname, options]);
      return Response.json({ confirmationToken: 'signed-token' });
    },
  });

  assert.equal(recipient, 'owner@example.invalid');
  assert.equal(calls[0][1].email, 'owner@example.invalid');
  assert.equal(calls[1][1], '/api/v1/account/deletion/request');
  assert.equal(calls[1][2].headers.Authorization, 'Bearer account-session-token');
  assert.equal(calls[2][1].options.shouldCreateUser, false);
  const redirect = new URL(calls[2][1].options.emailRedirectTo);
  assert.equal(redirect.pathname, '/konto-loeschen/bestaetigen/');
  assert.equal(redirect.searchParams.get('deletion_token'), 'signed-token');
});

test('Löscht nur nach Auth-Code-Austausch und meldet die lokale Sitzung ab', async () => {
  const calls = [];
  const auth = {
    exchangeCodeForSession: async (code, options) => {
      calls.push(['exchange', code, options]);
      return {
        data: { session: { access_token: 'confirmed-session', user: { id: 'account-id' } } },
        error: null,
      };
    },
    signOut: async (options) => {
      calls.push(['signOut', options]);
      return { error: null };
    },
  };
  const callback = accountDeletion.parseAccountDeletionWebCallback(
    'https://cupcal.example/konto-loeschen/bestaetigen/?flow=cupcal-account-deletion&deletion_token=signed-token&code=auth-code&sb_flow_id=flow-8',
  );

  await accountDeletion.confirmAccountDeletionFromWeb(auth, callback, {
    origin: 'https://cupcal.example',
    fetchImpl: async (url, options) => {
      calls.push(['confirm', url.pathname, options]);
      return new Response(null, { status: 204 });
    },
  });

  assert.deepEqual(calls[0], ['exchange', 'auth-code', { flowId: 'flow-8' }]);
  assert.equal(calls[1][1], '/api/v1/account/deletion/confirm');
  assert.equal(calls[1][2].headers.Authorization, 'Bearer confirmed-session');
  assert.deepEqual(JSON.parse(calls[1][2].body), { confirmationToken: 'signed-token' });
  assert.deepEqual(calls[2], ['signOut', { scope: 'local' }]);
});

test('Lehnt falsche Rücksprungkennung ab, ohne den Löschendpunkt aufzurufen', async () => {
  let requestCount = 0;
  const auth = {
    exchangeCodeForSession: async () => {
      requestCount++;
      return { data: { session: null }, error: null };
    },
    signOut: async () => {
      requestCount++;
      return { error: null };
    },
  };
  const callback = accountDeletion.parseAccountDeletionWebCallback(
    'https://cupcal.example/konto-loeschen/bestaetigen/?flow=other&deletion_token=signed-token&code=auth-code',
  );

  await assert.rejects(
    accountDeletion.confirmAccountDeletionFromWeb(auth, callback, {
      origin: 'https://cupcal.example',
      fetchImpl: async () => {
        requestCount++;
        return new Response(null, { status: 204 });
      },
    }),
    /unvollständig oder ungültig/,
  );
  assert.equal(requestCount, 0);
});
