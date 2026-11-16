import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDir = path.join(projectDir, "supabase/migrations");
const databaseName = "cupcal_migration_test";
const accountId = "10000000-0000-0000-0000-000000000001";
const otherAccountId = "20000000-0000-0000-0000-000000000002";

let clusterDir;
let connection;
let postgresStarted = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  assert.ifError(result.error, `${command} konnte nicht ausgeführt werden.`);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} schlug fehl:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  );
  return result;
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

function psql(sql, database = databaseName) {
  return run(
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
      String(connection.port),
      "-U",
      "postgres",
      "-d",
      database,
    ],
    {
      env: {
        ...process.env,
        PGCONNECT_TIMEOUT: "5",
        PGPASSWORD: "",
      },
      input: sql,
    },
  ).stdout.trim();
}

before(async () => {
  for (const executable of ["initdb", "pg_ctl", "psql"]) {
    run(executable, ["--version"]);
  }

  clusterDir = await mkdtemp(
    path.join(os.tmpdir(), "cupcal-fresh-migrations-"),
  );
  const dataDir = path.join(clusterDir, "data");
  connection = { port: await findAvailablePort() };

  run("initdb", ["-D", dataDir, "--username=postgres", "--auth=trust"]);
  run("pg_ctl", [
    "-D",
    dataDir,
    "-o",
    `-h 127.0.0.1 -p ${connection.port} -k ${clusterDir} -F -c wal_level=logical`,
    "-w",
    "start",
    "-l",
    path.join(clusterDir, "postgres.log"),
  ]);
  postgresStarted = true;

  psql(`CREATE DATABASE ${databaseName};`, "postgres");
  psql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;

    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY,
      raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE SQL
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

    CREATE PUBLICATION supabase_realtime;
  `);
});

after(async () => {
  if (postgresStarted) {
    const stop = spawnSync(
      "pg_ctl",
      ["-D", path.join(clusterDir, "data"), "-m", "fast", "-w", "stop"],
      { encoding: "utf8" },
    );
    assert.equal(
      stop.status,
      0,
      `PostgreSQL konnte nicht beendet werden:\n${stop.stderr}`,
    );
  }
  if (clusterDir) await rm(clusterDir, { recursive: true, force: true });
});

test("alle Supabase-Migrationen laufen auf einer frischen Datenbank durch", async () => {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();

  assert.ok(
    migrationFiles.length > 0,
    "Es wurden keine Supabase-Migrationen gefunden.",
  );

  for (const file of migrationFiles) {
    if (file === "0008_event_series_and_ruleset.sql") {
      psql(`
        INSERT INTO public.fortnite_events (
          id, title, region, game_mode, team_format, tournament_type,
          category, start_time, end_time
        ) VALUES
        (
          'legacy-reload-event', 'Reload Cash Cup', 'EU', 'Reload', 'Solo',
          'Cash Cup', 'Turnier', '2026-11-14 18:00:00+00', '2026-11-14 20:00:00+00'
        ),
        (
          'legacy-reload-zero-build-event', 'Reload ZB Cash Cup Zero Build',
          'EU', 'Zero Build', 'Duos', 'Cash Cup', 'Turnier',
          '2026-11-14 18:00:00+00', '2026-11-14 20:00:00+00'
        );
      `);
    }
    const migration = await readFile(path.join(migrationsDir, file), "utf8");
    try {
      psql(migration);
    } catch (error) {
      error.message = `Migration ${file} ist fehlgeschlagen.\n${error.message}`;
      throw error;
    }
  }

  assert.equal(
    psql(`
      SELECT string_agg(
        id || ':' || tournament_series || ':' || COALESCE(game_ruleset, 'unknown'),
        ',' ORDER BY id
      )
      FROM public.fortnite_events
      WHERE id LIKE 'legacy-reload%';
    `),
    "legacy-reload-event:Reload:unknown,legacy-reload-zero-build-event:Reload:Zero Build",
    "Die Migration muss alte Reload-Varianten abbilden und unbekannte Regelwerke offenlassen.",
  );

  assert.equal(
    psql(`
      SELECT string_agg(tablename, ',' ORDER BY tablename)
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = ANY (ARRAY[
          'admin_import_history',
          'admin_tournament_type_correction_history',
          'fortnite_events',
          'user_event_bookmarks',
          'user_profiles'
        ]);
    `),
    "admin_import_history,admin_tournament_type_correction_history,fortnite_events,user_event_bookmarks,user_profiles",
    "Alle erwarteten Tabellen müssen angelegt sein.",
  );

  assert.equal(
    psql(`
      SELECT string_agg(column_name, ',' ORDER BY column_name)
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'admin_import_history'
        AND column_name = ANY (ARRAY[
          'skipped_invalid_count',
          'skipped_past_count',
          'skipped_warning_count',
          'start_date',
          'end_date'
        ]);
    `),
    "end_date,skipped_invalid_count,skipped_past_count,skipped_warning_count,start_date",
    "Die Importhistorie muss Zeitraum und Ausschlusskategorien speichern.",
  );

  assert.equal(
    psql(`
      SELECT string_agg(c.relname || ':' || c.relrowsecurity::text, ',' ORDER BY c.relname)
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY (ARRAY[
          'admin_import_history',
          'admin_tournament_type_correction_history',
          'fortnite_events',
          'user_event_bookmarks',
          'user_profiles'
        ]);
    `),
    "admin_import_history:true,admin_tournament_type_correction_history:true,fortnite_events:true,user_event_bookmarks:true,user_profiles:true",
    "RLS muss auf allen erwarteten Tabellen aktiviert sein.",
  );

  assert.equal(
    psql(`
      SELECT string_agg(tablename || ':' || policy_names, ',' ORDER BY tablename)
      FROM (
        SELECT tablename, string_agg(policyname, ',' ORDER BY policyname) AS policy_names
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY (ARRAY[
            'admin_import_history',
            'admin_tournament_type_correction_history',
            'fortnite_events',
            'user_event_bookmarks',
            'user_profiles'
          ])
        GROUP BY tablename
      ) AS policies;
    `),
    [
      "fortnite_events:Public read for fortnite_events",
      "user_event_bookmarks:Users insert own bookmarks,Users read own bookmarks,Users update own bookmarks",
      "user_profiles:Users read own profile",
    ].join(","),
    "Die erwarteten öffentlichen, Favoriten- und Profil-RLS-Regeln müssen vorhanden sein.",
  );

  assert.equal(
    psql(`
      SELECT has_table_privilege('service_role', 'public.admin_import_history', 'SELECT')
        AND has_table_privilege('service_role', 'public.admin_import_history', 'INSERT')
        AND NOT has_table_privilege('authenticated', 'public.admin_import_history', 'SELECT')
        AND NOT has_table_privilege('anon', 'public.admin_import_history', 'SELECT')
        AND has_table_privilege('service_role', 'public.admin_tournament_type_correction_history', 'SELECT')
        AND NOT has_table_privilege('authenticated', 'public.admin_tournament_type_correction_history', 'SELECT')
        AND NOT has_table_privilege('anon', 'public.admin_tournament_type_correction_history', 'SELECT');
    `),
    "t",
    "Adminhistorien müssen nur dem vertrauenswürdigen Servicerollen-Zugriff gewähren.",
  );
  assert.equal(
    psql(`
      SELECT has_function_privilege(
        'service_role',
        'public.correct_event_tournament_type(text,text,text,uuid,text)',
        'EXECUTE'
      ) AND NOT has_function_privilege(
        'authenticated',
        'public.correct_event_tournament_type(text,text,text,uuid,text)',
        'EXECUTE'
      ) AND NOT has_function_privilege(
        'anon',
        'public.correct_event_tournament_type(text,text,text,uuid,text)',
        'EXECUTE'
      );
    `),
    "t",
    "Die Änderungs-RPC darf ausschließlich vom vertrauenswürdigen Server aufgerufen werden.",
  );

  assert.equal(
    psql(`
      SELECT to_regprocedure(
        'public.sync_user_event_bookmark(text,boolean,timestamp with time zone)'
      ) IS NOT NULL;
    `),
    "t",
    "Die Favoriten-RPC muss vorhanden sein.",
  );
  assert.equal(
    psql(`
      SELECT has_function_privilege(
        'authenticated',
        'public.sync_user_event_bookmark(text,boolean,timestamp with time zone)',
        'EXECUTE'
      ) AND NOT has_function_privilege(
        'anon',
        'public.sync_user_event_bookmark(text,boolean,timestamp with time zone)',
        'EXECUTE'
      );
    `),
    "t",
    "Die Favoriten-RPC muss angemeldeten Konten und nicht anonymen Konten offenstehen.",
  );
  assert.equal(
    psql(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'user_event_bookmarks'
      );
    `),
    "t",
    "Die Favoritentabelle muss in Supabase Realtime veröffentlicht sein.",
  );

  psql(`
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES
      ('${accountId}', '{"display_name":"Erstes Konto"}'),
      ('${otherAccountId}', '{"display_name":"Zweites Konto"}');
    SET ROLE authenticated;
    SET request.jwt.claim.sub = '${accountId}';
    SELECT public.sync_user_event_bookmark(
      'fresh-database-event',
      TRUE,
      '1900-01-01 00:00:00+00'::timestamptz
    );
    RESET ROLE;
  `);

  psql(`
    INSERT INTO public.fortnite_events (
      id, title, region, game_mode, team_format, tournament_type,
      category, start_time, end_time
    ) VALUES (
      'fresh-correction-event', 'Korrekturtest', 'EU', 'Battle Royale', 'Solo',
      'FNCS', 'Turnier', '2026-12-01 18:00:00+00', '2026-12-01 20:00:00+00'
    );
    SELECT * FROM public.correct_event_tournament_type(
      'fresh-correction-event', 'FNCS', 'Community',
      '${accountId}', 'admin@cupcal.test'
    );
  `);

  assert.equal(
    psql(`
      SELECT event_id || ':' || event_title || ':' || previous_tournament_type || ':'
        || tournament_type || ':' || admin_user_id::text || ':' || admin_email || ':'
        || (corrected_at IS NOT NULL)::text
      FROM public.admin_tournament_type_correction_history;
    `),
    `fresh-correction-event:Korrekturtest:FNCS:Community:${accountId}:admin@cupcal.test:true`,
    "Die Turnierart-RPC muss die Korrektur samt Admin und Datenbankzeit speichern.",
  );

  psql(`
    DO $$
    BEGIN
      BEGIN
        PERFORM * FROM public.correct_event_tournament_type(
          'fresh-correction-event', 'Community', 'Cash Cup',
          '${accountId}', NULL
        );
        RAISE EXCEPTION 'A missing audit email should have rejected the correction';
      EXCEPTION
        WHEN not_null_violation THEN NULL;
      END;

      IF (
        SELECT tournament_type
        FROM public.fortnite_events
        WHERE id = 'fresh-correction-event'
      ) <> 'Community' THEN
        RAISE EXCEPTION 'A failed audit write must roll back the event correction';
      END IF;

      IF (
        SELECT count(*)
        FROM public.admin_tournament_type_correction_history
      ) <> 1 THEN
        RAISE EXCEPTION 'A failed correction must not add an audit entry';
      END IF;
    END
    $$;
  `);

  assert.equal(
    psql(`
      SELECT count(*)::text
      FROM public.user_profiles
      WHERE id IN ('${accountId}', '${otherAccountId}')
        AND display_name IS NOT NULL;
    `),
    "2",
    "Das Profil-Trigger muss für neu angelegte Auth-Konten Profile erzeugen.",
  );
  assert.equal(
    psql(`
      SELECT user_id::text || ':' || event_id || ':' || is_favorite::text || ':' || revision::text
      FROM public.user_event_bookmarks;
    `),
    `${accountId}:fresh-database-event:true:1`,
    "Die Favoriten-RPC muss auf dem frisch angelegten Schema funktionieren.",
  );

  console.info(`Erfolgreich angewendet: ${migrationFiles.join(", ")}`);
});
