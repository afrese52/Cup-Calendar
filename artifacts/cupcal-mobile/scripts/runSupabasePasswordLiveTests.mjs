import { spawnSync } from 'node:child_process';

const suite = process.argv[2] === '--suite' ? process.argv[3] : 'all';
if (!['all', 'recovery'].includes(suite) || process.argv.length > (suite === 'all' ? 2 : 4)) {
  console.error('Ungültiger Aufruf. Verwende den dokumentierten pnpm-Live-Testbefehl.');
  process.exit(2);
}

const supabaseUrl = (
  process.env.SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  ''
).trim();
const publicKey = (
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  ''
).trim();
const required = [
  ['SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_URL', supabaseUrl],
  ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY oder SUPABASE_ANON_KEY', publicKey],
  ['CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL', process.env.CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL?.trim()],
  ['CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD', process.env.CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD],
  ['CUPCAL_SUPABASE_PASSWORD_RECOVERY_TEST_LINK', process.env.CUPCAL_SUPABASE_PASSWORD_RECOVERY_TEST_LINK?.trim()],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`Live-Prüfung abgebrochen. Es fehlen geschützte Umgebungswerte: ${missing.join(', ')}.`);
  process.exit(2);
}

if (isPrivilegedSupabaseKey(publicKey)) {
  console.error('Live-Prüfung abgebrochen. Erlaubt ist ausschließlich ein öffentlicher Publishable- oder Anon-Key.');
  process.exit(2);
}

try {
  new URL(supabaseUrl);
  new URL(process.env.CUPCAL_SUPABASE_PASSWORD_RECOVERY_TEST_LINK.trim());
} catch {
  console.error('Live-Prüfung abgebrochen. Die Supabase- oder Recovery-Adresse ist ungültig.');
  process.exit(2);
}

const testPatterns = suite === 'recovery'
  ? ['Passwortgrenze in einer echten Supabase-Wiederherstellungssitzung']
  : [
      'Unicode-Mindestlänge mit Supabase',
      'Unterscheidung von NFC- und NFD-Passwörtern',
      'Passwortgrenze in einer echten Supabase-Wiederherstellungssitzung',
    ];
const childEnvironment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: process.env.LANG,
  LC_ALL: process.env.LC_ALL,
  NODE_OPTIONS: process.env.NODE_OPTIONS,
  NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
  SSL_CERT_FILE: process.env.SSL_CERT_FILE,
  HTTPS_PROXY: process.env.HTTPS_PROXY,
  HTTP_PROXY: process.env.HTTP_PROXY,
  ALL_PROXY: process.env.ALL_PROXY,
  NO_PROXY: process.env.NO_PROXY,
  SUPABASE_URL: supabaseUrl,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL: process.env.CUPCAL_SUPABASE_PASSWORD_TEST_EMAIL.trim(),
  CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD: process.env.CUPCAL_SUPABASE_PASSWORD_TEST_PASSWORD,
  CUPCAL_SUPABASE_PASSWORD_RECOVERY_TEST_LINK:
    process.env.CUPCAL_SUPABASE_PASSWORD_RECOVERY_TEST_LINK.trim(),
  CUPCAL_RUN_SUPABASE_PASSWORD_LIVE_TEST: '1',
  CUPCAL_RUN_SUPABASE_PASSWORD_RECOVERY_LIVE_TEST: '1',
};
for (const [name, value] of Object.entries(childEnvironment)) {
  if (value === undefined) delete childEnvironment[name];
}

const child = spawnSync(
  process.execPath,
  [
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--experimental-strip-types',
    '--test',
    `--test-name-pattern=${testPatterns.join('|')}`,
    'services/passwordRecovery.test.mjs',
  ],
  {
    cwd: process.cwd(),
    env: childEnvironment,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  },
);

// Never forward the test runner's output: assertion and network errors can
// contain credentials, recovery tokens, or other account-specific data.
const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
const restorations = [...output.matchAll(/CUPCAL_RESTORE_STATUS: (restored|unchanged|failed)/g)]
  .map(([, status]) => status);
const expectedRestorations = testPatterns.length;
const restoredCount = restorations.filter((status) => status === 'restored').length;
const unchangedCount = restorations.filter((status) => status === 'unchanged').length;
const failedRestoreCount = restorations.filter((status) => status === 'failed').length;

if (child.error || child.status !== 0) {
  console.error('Die Supabase-Live-Prüfung ist fehlgeschlagen. Fehlerdetails wurden zum Schutz der Zugangsdaten ausgeblendet.');
  console.error(
    `Passwort-Wiederherstellung: ${restoredCount} erfolgreich, ${failedRestoreCount} fehlgeschlagen, ` +
      `${unchangedCount} unverändert; ` +
      `${Math.max(0, expectedRestorations - restorations.length)} Statusmeldungen nicht bestätigt.`,
  );
} else if (
  restorations.length !== expectedRestorations ||
  failedRestoreCount > 0 ||
  (suite === 'all' && (restoredCount !== 3 || unchangedCount !== 0)) ||
  (suite === 'recovery' && restoredCount !== 1)
) {
  console.error(
    `Die Live-Prüfung endete, aber die Passwort-Wiederherstellung konnte nicht vollständig bestätigt werden: ` +
      `${restoredCount} erfolgreich, ${failedRestoreCount} fehlgeschlagen, ${unchangedCount} unverändert.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Supabase-Live-Prüfung erfolgreich: ${expectedRestorations} Test${expectedRestorations === 1 ? '' : 's'} bestanden.`);
  console.log(`Ursprüngliches Passwort nach ${restoredCount} von ${restorations.length} verändernden Tests wiederhergestellt.`);
  if (unchangedCount > 0) {
    console.log(`Konto unverändert; Wiederherstellung nicht erforderlich: ${unchangedCount} Test${unchangedCount === 1 ? '' : 's'}.`);
  }
}

if (child.error || child.status !== 0) process.exitCode = child.status || 1;

function isPrivilegedSupabaseKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const [, payload] = key.split('.');
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}
