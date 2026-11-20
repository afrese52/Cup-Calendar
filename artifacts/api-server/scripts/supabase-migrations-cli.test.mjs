import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDir = path.join(projectDir, "supabase/migrations");
const supabaseCliVersion = "3.1.0";
const accountId = "10000000-0000-0000-0000-000000000001";
const preexistingAccountId = "20000000-0000-0000-0000-000000000002";
const eventId = "supabase-cli-migration-test-event";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    ...options,
  });
  assert.ifError(result.error, `${command} konnte nicht ausgeführt werden.`);
  return result;
}

function sanitizedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split("\n")
    .filter(
      (line) =>
        !/DB_URL|PUBLISHABLE_KEY|SECRET_KEY|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY/.test(
          line,
        ),
    )
    .join("\n")
    .trim();
}

function expectSuccess(command, args, options) {
  const result = run(command, args, options);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} schlug fehl:\n${sanitizedOutput(result)}`,
  );
  return result;
}

function cliArgs(workDir, ...args) {
  return ["--yes", `supabase@${supabaseCliVersion}`, ...args, "--workdir", workDir];
}

function runSupabase(workDir, ...args) {
  return expectSuccess("npx", cliArgs(workDir, ...args), {
    cwd: workDir,
    env: { ...localEnvironment },
  });
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const localEnvironment = { ...process.env };
for (const key of Object.keys(localEnvironment)) {
  if (key.startsWith("SUPABASE_") || key.startsWith("SB_")) {
    delete localEnvironment[key];
  }
}
localEnvironment.SUPABASE_TELEMETRY_DISABLED = "true";

test(
  "alle Migrationen funktionieren mit Auth, Realtime und Standardrollen des Supabase-CLI",
  { timeout: 25 * 60 * 1000 },
  async () => {
    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    assert.ok(migrationFiles.length > 0, "Keine Supabase-Migrationen gefunden.");
    const profileMigration = migrationFiles.find((file) =>
      /^0006_.*user_profiles\.sql$/.test(file),
    );
    assert.ok(profileMigration, "Migration 0006 für Profile wurde nicht gefunden.");
    const profileMigrationIndex = migrationFiles.indexOf(profileMigration);

    const workDir = await mkdtemp(
      path.join(os.tmpdir(), "cupcal-supabase-cli-migrations-"),
    );
    const supabaseDir = path.join(workDir, "supabase");
    const migrationTarget = path.join(supabaseDir, "migrations");
    const projectId = `cupcal-test-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const [databasePort, shadowPort, apiPort] = await Promise.all([
      findAvailablePort(),
      findAvailablePort(),
      findAvailablePort(),
    ]);
    let startAttempted = false;

    try {
      await mkdir(migrationTarget, { recursive: true });
      await Promise.all(
        migrationFiles.slice(0, profileMigrationIndex).map((file) =>
          copyFile(path.join(migrationsDir, file), path.join(migrationTarget, file)),
        ),
      );
      await writeLocalConfig(supabaseDir, projectId, {
        databasePort,
        shadowPort,
        apiPort,
      });

      startAttempted = true;
      const start = run(
        "npx",
        cliArgs(
          workDir,
          "--debug",
          "start",
          "--exclude",
          "studio,storage-api,imgproxy,mailpit,postgres-meta,edge-runtime,logflare,vector,supavisor",
        ),
        { cwd: workDir, env: { ...localEnvironment } },
      );
      if (start.status !== 0) {
        const container = `supabase_db_${projectId}`;
        const details = run("docker", [
          "inspect",
          "--format",
          "{{.State.Status}} exit={{.State.ExitCode}} {{.State.Error}}",
          container,
        ]);
        const containerLogs = run("docker", ["logs", container]);
        assert.equal(
          start.status,
          0,
          `Supabase-CLI konnte die isolierte Umgebung nicht starten:\n${sanitizedOutput(start)}\nDatenbankcontainer: ${sanitizedOutput(details)}\n${sanitizedOutput(containerLogs)}`,
        );
      }
      const psql = (sql) => {
        const result = expectSuccess(
          "psql",
          [
            "-X",
            "-q",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-h",
            "127.0.0.1",
            "-p",
            String(databasePort),
            "-U",
            "postgres",
            "-d",
            "postgres",
          ],
          {
            cwd: workDir,
            env: {
              ...localEnvironment,
              PGCONNECT_TIMEOUT: "5",
              PGPASSWORD: "postgres",
            },
            input: sql,
          },
        );
        return result.stdout.trim();
      };

      assert.equal(
        psql(`
          SELECT to_regclass('auth.users') IS NOT NULL
            AND to_regprocedure('auth.uid()') IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'auth'
                AND table_name = 'users'
                AND column_name = 'raw_user_meta_data'
            );
        `),
        "t",
        "Die echten Supabase-Auth-Tabellen und auth.uid() müssen verfügbar sein.",
      );

      assert.equal(
        psql(`
          SELECT count(*) = 3 AND bool_and(NOT rolcanlogin)
          FROM (
            SELECT roles.rolcanlogin
            FROM pg_roles AS roles
            WHERE roles.rolname IN ('anon', 'authenticated', 'service_role')
          ) AS supabase_roles;
        `),
        "t",
        "Die Supabase-API-Rollen müssen ohne direkte Anmeldung vorhanden sein.",
      );
      assert.equal(
        psql(`
          SELECT EXISTS (
            SELECT 1
            FROM pg_auth_members AS membership
            JOIN pg_roles AS member ON member.oid = membership.member
            JOIN pg_roles AS granted ON granted.oid = membership.roleid
            WHERE member.rolname = 'authenticator'
              AND granted.rolname = 'authenticated'
          )
          AND EXISTS (
            SELECT 1
            FROM pg_auth_members AS membership
            JOIN pg_roles AS member ON member.oid = membership.member
            JOIN pg_roles AS granted ON granted.oid = membership.roleid
            WHERE member.rolname = 'authenticator'
              AND granted.rolname = 'anon'
          );
        `),
        "t",
        "Die authenticator-Rolle muss die Supabase-API-Rollen übernehmen können.",
      );

      assert.equal(
        psql(`
          SELECT EXISTS (
            SELECT 1 FROM pg_publication
            WHERE pubname = 'supabase_realtime'
          )
          AND EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'user_event_bookmarks'
          );
        `),
        "t",
        "Die Migration muss die Favoriten in der echten Realtime-Publikation registrieren.",
      );

      psql(`
        INSERT INTO auth.users (
          id, aud, role, email, encrypted_password, raw_user_meta_data
        ) VALUES (
          '${preexistingAccountId}', 'authenticated', 'authenticated',
          'existing-migration-test@cupcal.invalid', '',
          '{"display_name":"Bestandskonto"}'
        );
      `);

      await Promise.all(
        migrationFiles.slice(profileMigrationIndex).map((file) =>
          copyFile(path.join(migrationsDir, file), path.join(migrationTarget, file)),
        ),
      );
      runSupabase(workDir, "migration", "up", "--local");

      assert.equal(
        psql(`
          SELECT id::text || ':' || display_name
          FROM public.user_profiles
          WHERE id = '${preexistingAccountId}';
        `),
        `${preexistingAccountId}:Bestandskonto`,
        "Migration 0006 muss bestehende Auth-Konten mit ihren Metadaten zurückbefüllen.",
      );

      psql(`
        INSERT INTO auth.users (
          id, aud, role, email, encrypted_password, raw_user_meta_data
        ) VALUES (
          '${accountId}', 'authenticated', 'authenticated',
          'migration-test@cupcal.invalid', '', '{"display_name":"CLI-Konto"}'
        );
        SET ROLE authenticated;
        SET request.jwt.claim.sub = '${accountId}';
        SELECT public.sync_user_event_bookmark(
          '${eventId}', TRUE, '1900-01-01 00:00:00+00'::timestamptz
        );
        RESET ROLE;
      `);

      assert.equal(
        psql(`
          SELECT user_id::text || ':' || event_id || ':' || is_favorite::text
          FROM public.user_event_bookmarks;
        `),
        `${accountId}:${eventId}:true`,
        "Die Favoriten-RPC muss mit der echten Auth-Rolle und auth.uid() funktionieren.",
      );
      assert.equal(
        psql(`
          SELECT display_name
          FROM public.user_profiles
          WHERE id = '${accountId}';
        `),
        "CLI-Konto",
        "Der Trigger muss Profile aus tatsächlichen auth.users-Einträgen erstellen.",
      );
      console.info(
        `Supabase-CLI ${supabaseCliVersion}: ${migrationFiles.length} Migrationen in isolierter lokaler Datenbank geprüft.`,
      );
    } finally {
      if (startAttempted) {
        const stop = run("npx", cliArgs(workDir, "stop", "--no-backup"), {
          cwd: workDir,
          env: { ...localEnvironment },
        });
        assert.equal(
          stop.status,
          0,
          `Die isolierte Supabase-Umgebung konnte nicht beendet werden:\n${sanitizedOutput(stop)}`,
        );
      }
      await rm(workDir, { recursive: true, force: true });
    }
  },
);

async function writeLocalConfig(
  supabaseDir,
  projectId,
  { databasePort, shadowPort, apiPort },
) {
  await writeFile(
    path.join(supabaseDir, "config.toml"),
    `project_id = "${projectId}"

[api]
enabled = true
port = ${apiPort}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${databasePort}
shadow_port = ${shadowPort}
major_version = 17

[db.migrations]
enabled = true
schema_paths = []

[db.seed]
enabled = false
sql_paths = []

[realtime]
enabled = true

[studio]
enabled = false

[local_smtp]
enabled = false

[storage]
enabled = false

[edge_runtime]
enabled = false

[analytics]
enabled = false
`,
    "utf8",
  );
}
