import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { getBuildConfigurationErrors } from './validate-build-config.mjs';

const validEnv = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://cupcal-build-test.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_not_a_real_key',
};
const urlKey = 'EXPO_PUBLIC_SUPABASE_URL';
const publicKey = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (role, alg = 'HS256') =>
  `${encode({ alg, typ: 'JWT' })}.${encode({ role })}.test_signature`;

test('accepts a public publishable key and an HTTPS project base', () => {
  assert.deepEqual(getBuildConfigurationErrors(validEnv), []);
  assert.deepEqual(getBuildConfigurationErrors({
    [urlKey]: `  ${validEnv[urlKey]}/  `,
    [publicKey]: ` ${validEnv[publicKey]} `,
  }), []);
});

test('accepts a structurally valid legacy anon JWT and custom HTTPS domain', () => {
  assert.deepEqual(getBuildConfigurationErrors({
    [urlKey]: 'https://auth.cupcal.example',
    [publicKey]: jwt('anon'),
  }), []);
});

test('reports both absent variables without falling back to server secrets', () => {
  const errors = getBuildConfigurationErrors({
    SUPABASE_URL: validEnv[urlKey],
    SUPABASE_ANON_KEY: validEnv[publicKey],
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-fixture',
  });
  assert.equal(errors.length, 2);
  assert.ok(errors.some((error) => error.includes(urlKey)));
  assert.ok(errors.some((error) => error.includes(publicKey)));
  assert.equal(getBuildConfigurationErrors({ ...validEnv, [urlKey]: ' ' }).length, 1);
  assert.equal(getBuildConfigurationErrors({ ...validEnv, [publicKey]: ' ' }).length, 1);
});

test('rejects insecure, malformed or non-base project URLs', () => {
  for (const url of [
    'http://cupcal-build-test.supabase.co',
    'not-a-url',
    'https://localhost',
    'https://supabase',
    'https://user:password@cupcal-build-test.supabase.co',
    'https://cupcal-build-test.supabase.co/rest/v1',
    'https://cupcal-build-test.supabase.co/auth/v1/',
    'https://cupcal-build-test.supabase.co/?key=fixture',
    'https://cupcal-build-test.supabase.co/#fixture',
    'https://cupcal-build-test.supabase.co\\rest',
  ]) {
    const errors = getBuildConfigurationErrors({ ...validEnv, [urlKey]: url });
    assert.equal(errors.length, 1, `must reject URL fixture: ${url}`);
    assert.ok(errors[0].includes(urlKey));
  }
});

test('rejects secret, service-role, malformed and unsigned keys', () => {
  for (const key of [
    'sb_secret_must_not_be_embedded',
    jwt('service_role'),
    jwt('authenticated'),
    jwt('anon', 'none'),
    jwt('anon').slice(0, -'test_signature'.length),
    'sb_publishable_',
    'sb_publishable_has spaces',
    'not-a-public-key',
    'invalid.invalid.invalid',
    `${encode(null)}.${encode({ role: 'anon' })}.fixture`,
    `${encode({ alg: 'HS256' })}.${encode(null)}.fixture`,
  ]) {
    const errors = getBuildConfigurationErrors({ ...validEnv, [publicKey]: key });
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes(publicKey));
    assert.ok(!errors[0].includes(key), 'never echo rejected key values');
  }
});

function runGuard(env) {
  // Do not inherit workspace secrets into these CLI tests.
  return spawnSync(process.execPath, [
    fileURLToPath(new URL('./validate-build-config.mjs', import.meta.url)),
  ], { encoding: 'utf8', env });
}

test('CLI fails before a build when configuration is absent', () => {
  const result = runGuard({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Build abgebrochen/);
  assert.match(result.stderr, /EXPO_PUBLIC_SUPABASE_URL fehlt/);
  assert.match(result.stderr, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt/);
  assert.match(result.stderr, /preview → preview, production → production/);
  assert.match(result.stderr, /niemals einen Service-Role- oder Secret-Key/);
});

test('CLI succeeds with fixtures and never prints URLs or keys', () => {
  const result = runGuard(validEnv);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /formal geprüft/);
  for (const value of Object.values(validEnv)) {
    assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  }
});

test('CLI errors never expose submitted values', () => {
  const invalidEnv = {
    [urlKey]: 'https://sensitive-user:private-password@example.invalid/rest/v1',
    [publicKey]: 'sb_secret_private_test_fixture',
  };
  const result = runGuard(invalidEnv);
  assert.equal(result.status, 1);
  for (const value of [...Object.values(invalidEnv), 'private-password', 'sensitive-user']) {
    assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  }
});

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('EAS pre-install hook invokes the guard without changing the development command', () => {
  const pkg = readJson('../package.json');
  assert.equal(pkg.scripts['eas-build-pre-install'], 'node scripts/validate-build-config.mjs');
  assert.ok(pkg.scripts.test.includes('scripts/validate-build-config.test.mjs'));
  assert.match(pkg.scripts.dev, /create-launch login/);
  assert.ok(!pkg.scripts.dev.includes('validate-build-config'));
});

test('blocks unneeded Android permissions without blocking GPS, network or imports', () => {
  const { expo } = readJson('../app.json');
  for (const permission of ['CAMERA', 'RECORD_AUDIO', 'SYSTEM_ALERT_WINDOW',
    'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
    assert.ok(expo.android.blockedPermissions.includes(`android.permission.${permission}`));
  }
  for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION',
    'INTERNET', 'ACCESS_NETWORK_STATE']) {
    assert.ok(!expo.android.blockedPermissions.includes(`android.permission.${permission}`));
  }
  assert.ok(expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location'));
  assert.equal(expo.android.package, 'de.cup.calendar');
});

test('production keeps store AAB output, remote version increments and the chosen environment', () => {
  const { build, cli } = readJson('../eas.json');
  assert.equal(build.production.extends, 'preview');
  assert.equal(build.preview.environment, 'preview');
  assert.equal(build.production.environment, 'production');
  assert.equal(build.production.distribution, 'store');
  assert.equal(build.production.android.buildType, 'app-bundle');
  assert.equal(build.production.android.autoIncrement, 'versionCode');
  assert.equal(cli.appVersionSource, 'remote');
});

test('EAS Update uses distinct preview and production channels with a fingerprint runtime', () => {
  const { expo } = readJson('../app.json');
  const { build } = readJson('../eas.json');
  assert.equal(expo.updates.url, `https://u.expo.dev/${expo.extra.eas.projectId}`);
  assert.deepEqual(expo.runtimeVersion, { policy: 'fingerprint' });
  assert.equal(build.preview.channel, 'preview');
  assert.equal(build.production.channel, 'production');
  assert.ok(readJson('../package.json').dependencies['expo-updates']);
});
