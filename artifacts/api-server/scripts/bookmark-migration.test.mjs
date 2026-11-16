import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectDir, "scripts/fixtures/bookmark-schema-before-0003.sql");
const legacyFixturePath = path.join(
  projectDir,
  "scripts/fixtures/bookmark-schema-legacy-before-0002.sql",
);
const migrationPath = path.join(
  projectDir,
  "supabase/migrations/0003_clock_independent_bookmark_order.sql",
);
const legacyMigrationPath = path.join(
  projectDir,
  "supabase/migrations/0002_user_event_bookmarks.sql",
);
const legacyDatabase = "legacy_bookmark_migration";
const legacyAccountId = "10000000-0000-0000-0000-000000000001";
const otherAccountId = "20000000-0000-0000-0000-000000000002";
const deletionAccountId = "30000000-0000-0000-0000-000000000003";
const deletionOtherAccountId = "40000000-0000-0000-0000-000000000004";

let clusterDir;
let connection;
let postgresStarted = false;
let postgresAvailable = true;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error?.code === "ENOENT") {
    postgresAvailable = false;
    return result;
  }
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
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

function psql(sql, database = "postgres") {
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

before(async (context) => {
  for (const executable of ["initdb", "pg_ctl", "psql"]) {
    const check = spawnSync(executable, ["--version"], { encoding: "utf8" });
    if (check.error?.code === "ENOENT") {
      context.skip(`PostgreSQL-Befehl ${executable} ist nicht installiert.`);
      postgresAvailable = false;
      return;
    }
    assert.equal(check.status, 0, `${executable} --version konnte nicht ausgeführt werden.`);
  }

  clusterDir = await mkdtemp(path.join(os.tmpdir(), "cupcal-bookmark-migration-"));
  const dataDir = path.join(clusterDir, "data");
  connection = { port: await findAvailablePort() };

  run("initdb", ["-D", dataDir, "--username=postgres", "--auth=trust"]);
  run("pg_ctl", [
    "-D",
    dataDir,
    "-o",
    `-h 127.0.0.1 -p ${connection.port} -k ${clusterDir} -F`,
    "-w",
    "start",
    "-l",
    path.join(clusterDir, "postgres.log"),
  ]);
  postgresStarted = true;

  const fixture = await readFile(fixturePath, "utf8");
  psql(fixture);
  psql(`CREATE DATABASE ${legacyDatabase};`);
  const legacyFixture = await readFile(legacyFixturePath, "utf8");
  psql(legacyFixture, legacyDatabase);
});

after(() => {
  if (postgresStarted) {
    const stop = spawnSync(
      "pg_ctl",
      ["-D", path.join(clusterDir, "data"), "-m", "fast", "-w", "stop"],
      { encoding: "utf8" },
    );
    assert.equal(stop.status, 0, `PostgreSQL konnte nicht beendet werden:\n${stop.stderr}`);
  }
  if (clusterDir) return rm(clusterDir, { recursive: true, force: true });
});

test("0003 aktualisiert eine bestehende 0002-Datenbank ohne Favoriten oder RLS zu verlieren", async (context) => {
  if (!postgresAvailable) {
    context.skip("PostgreSQL ist für den lokalen Migrationstest erforderlich.");
    return;
  }

  const policySnapshotBefore = psql(`
    SELECT json_agg(row_to_json(policy) ORDER BY policyname)::text
    FROM (
      SELECT policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'user_event_bookmarks'
    ) AS policy;
  `);
  assert.equal(
    psql(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'public.user_event_bookmarks'::regclass;
    `),
    "t",
    "Die Ausgangstabelle muss RLS verwenden.",
  );

  const migration = await readFile(migrationPath, "utf8");
  psql(migration);

  const policySnapshotAfter = psql(`
    SELECT json_agg(row_to_json(policy) ORDER BY policyname)::text
    FROM (
      SELECT policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'user_event_bookmarks'
    ) AS policy;
  `);
  assert.equal(policySnapshotAfter, policySnapshotBefore, "Die RLS-Regeln müssen unverändert bleiben.");
  assert.equal(
    psql(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'public.user_event_bookmarks'::regclass;
    `),
    "t",
    "RLS muss nach der Migration aktiviert bleiben.",
  );
  assert.equal(
    psql(`
      SELECT has_function_privilege('authenticated',
        'public.sync_user_event_bookmark(text,boolean,timestamp with time zone)', 'EXECUTE')
        AND NOT has_function_privilege('anon',
        'public.sync_user_event_bookmark(text,boolean,timestamp with time zone)', 'EXECUTE');
    `),
    "t",
    "Der RPC muss nur für angemeldete Nutzer ausführbar sein.",
  );
  assert.equal(
    psql(`
      SELECT string_agg(
        user_id::text || ':' || event_id || ':' || is_favorite::text || ':' ||
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ':' || revision::text,
        '|' ORDER BY user_id, event_id
      )
      FROM public.user_event_bookmarks;
    `),
    `${legacyAccountId}:event-to-preserve:true:2025-01-02 03:04:05:0|${otherAccountId}:other-account-event:true:2025-02-03 04:05:06:0`,
    "Die Migration muss bestehende Favoriten, Zeitstempel und Standardrevisionen erhalten.",
  );

  psql(`
    SET ROLE authenticated;
    SET request.jwt.claim.sub = '${legacyAccountId}';

    DO $$
    BEGIN
      IF (SELECT count(*) FROM public.user_event_bookmarks) <> 1 THEN
        RAISE EXCEPTION 'RLS must show only the signed-in account bookmark';
      END IF;
    END;
    $$;

    SELECT public.sync_user_event_bookmark(
      'event-to-preserve',
      FALSE,
      '1900-01-01 00:00:00+00'::timestamptz
    );
    SELECT public.sync_user_event_bookmark(
      'new-event',
      TRUE,
      '1900-01-01 00:00:00+00'::timestamptz
    );

    RESET ROLE;
  `);

  assert.equal(
    psql(`
      SELECT string_agg(
        user_id::text || ':' || event_id || ':' || is_favorite::text || ':' || revision::text,
        '|' ORDER BY user_id, event_id
      )
      FROM public.user_event_bookmarks;
    `),
    `${legacyAccountId}:event-to-preserve:false:1|${legacyAccountId}:new-event:true:1|${otherAccountId}:other-account-event:true:0`,
    "Vorhandene Zeilen müssen bleiben, und RPC-Aufrufe müssen Revisionen hochzählen.",
  );
  assert.equal(
    psql(`
      SELECT updated_at > '2025-01-02 03:04:05+00'::timestamptz
      FROM public.user_event_bookmarks
      WHERE user_id = '${legacyAccountId}' AND event_id = 'event-to-preserve';
    `),
    "t",
    "Die neue RPC muss die Gerätezeit ignorieren und Serverzeit verwenden.",
  );
});

test("0002 übernimmt Favoriten aus Profil- und Event-gebundenen Tabellen", async (context) => {
  if (!postgresAvailable) {
    context.skip("PostgreSQL ist für den lokalen Migrationstest erforderlich.");
    return;
  }

  const migration = await readFile(legacyMigrationPath, "utf8");
  psql(migration, legacyDatabase);

  assert.equal(
    psql(`
      SELECT string_agg(
        user_id::text || ':' || event_id || ':' || is_favorite::text || ':' ||
          (updated_at IS NOT NULL)::text || ':' || revision::text,
        '|' ORDER BY user_id, event_id
      )
      FROM public.user_event_bookmarks;
    `, legacyDatabase),
    `${legacyAccountId}:legacy-event-one:true:true:0|${otherAccountId}:legacy-event-two:true:true:0`,
    "Migration 0002 muss alle alten Favoriten erhalten und ergänzte Felder befüllen.",
  );
  assert.equal(
    psql(`
      SELECT string_agg(
        key_column.attname || '->' || constraint_row.confrelid::regclass::text,
        ',' ORDER BY key_column.attname
      )
      FROM pg_constraint AS constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey) AS key_number(attnum)
      JOIN pg_attribute AS key_column
        ON key_column.attrelid = constraint_row.conrelid
       AND key_column.attnum = key_number.attnum
      WHERE constraint_row.conrelid = 'public.user_event_bookmarks'::regclass
        AND constraint_row.contype = 'f';
    `, legacyDatabase),
    "user_id->auth.users",
    "Nutzer-Favoriten müssen auf auth.users zeigen und dürfen keine Event-Fremdschlüssel behalten.",
  );
  assert.equal(
    psql(`
      DELETE FROM public.user_profiles
      WHERE id = '${legacyAccountId}'
      RETURNING id;
    `, legacyDatabase),
    legacyAccountId,
    "Der veraltete Nutzerprofileintrag muss gelöscht werden.",
  );
  assert.equal(
    psql(`
      SELECT user_id::text || ':' || event_id
      FROM public.user_event_bookmarks
      WHERE user_id = '${legacyAccountId}' AND event_id = 'legacy-event-one';
    `, legacyDatabase),
    `${legacyAccountId}:legacy-event-one`,
    "Das Löschen des Nutzerprofils darf den Favoriten des weiter bestehenden Kontos nicht entfernen.",
  );
  assert.equal(
    psql(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = 'public.user_event_bookmarks'::regclass;
    `, legacyDatabase),
    "t",
    "Die migrierte Tabelle muss Row Level Security verwenden.",
  );
  assert.equal(
    psql(`
      SELECT NOT has_table_privilege('anon', 'public.user_event_bookmarks', 'SELECT')
        AND NOT has_table_privilege('anon', 'public.user_event_bookmarks', 'INSERT')
        AND NOT has_table_privilege('anon', 'public.user_event_bookmarks', 'UPDATE')
        AND has_table_privilege('authenticated', 'public.user_event_bookmarks', 'SELECT')
        AND has_table_privilege('authenticated', 'public.user_event_bookmarks', 'INSERT')
        AND has_table_privilege('authenticated', 'public.user_event_bookmarks', 'UPDATE')
        AND NOT has_table_privilege('authenticated', 'public.user_event_bookmarks', 'DELETE');
    `, legacyDatabase),
    "t",
    "Anonyme Tabellenrechte müssen entzogen bleiben; angemeldete Nutzer erhalten nur die benötigten Rechte.",
  );

  psql(`
    SET ROLE authenticated;
    SET request.jwt.claim.sub = '${legacyAccountId}';

    DO $$
    BEGIN
      IF (SELECT count(*) FROM public.user_event_bookmarks) <> 1 THEN
        RAISE EXCEPTION 'The account must only see its own migrated bookmark';
      END IF;
    END;
    $$;

    INSERT INTO public.user_event_bookmarks (user_id, event_id)
    VALUES ('${legacyAccountId}', 'offline-event-not-in-fortnite-events');

    DO $$
    BEGIN
      IF (SELECT count(*) FROM public.user_event_bookmarks) <> 2 THEN
        RAISE EXCEPTION 'The account must see its own legacy and offline bookmarks';
      END IF;
    END;
    $$;

    DO $$
    BEGIN
      BEGIN
        INSERT INTO public.user_event_bookmarks (user_id, event_id)
        VALUES ('${otherAccountId}', 'another-account-event');
        RAISE EXCEPTION 'Cross-account bookmark insert unexpectedly succeeded';
      EXCEPTION
        WHEN insufficient_privilege THEN
          NULL;
      END;
    END;
    $$;

    RESET ROLE;

    SET ROLE authenticated;
    SET request.jwt.claim.sub = '${otherAccountId}';

    DO $$
    BEGIN
      IF (SELECT count(*) FROM public.user_event_bookmarks) <> 1 THEN
        RAISE EXCEPTION 'The second account must only see its own migrated bookmark';
      END IF;
    END;
    $$;

    RESET ROLE;
  `, legacyDatabase);

  assert.equal(
    psql(`
      SELECT string_agg(
        user_id::text || ':' || event_id,
        '|' ORDER BY user_id, event_id
      )
      FROM public.user_event_bookmarks;
    `, legacyDatabase),
    `${legacyAccountId}:legacy-event-one|${legacyAccountId}:offline-event-not-in-fortnite-events|${otherAccountId}:legacy-event-two`,
    "RLS muss den eigenen Bestand erhalten, fremde Schreibzugriffe sperren und Offline-IDs zulassen.",
  );

  const bookmarkStateBeforeEventRefresh = psql(`
    SELECT is_favorite::text || ':' || updated_at::text || ':' || revision::text
    FROM public.user_event_bookmarks
    WHERE user_id = '${legacyAccountId}' AND event_id = 'legacy-event-one';
  `, legacyDatabase);

  psql(`
    DELETE FROM public.fortnite_events
    WHERE id = 'legacy-event-one';
  `, legacyDatabase);

  assert.equal(
    psql(`
      SELECT count(*)::text
      FROM public.user_event_bookmarks
      WHERE user_id = '${legacyAccountId}' AND event_id = 'legacy-event-one';
    `, legacyDatabase),
    "1",
    "Das Löschen eines früher referenzierten Turniers darf den migrierten Favoriten nicht entfernen.",
  );

  psql(`
    INSERT INTO public.fortnite_events (id, title)
    VALUES ('legacy-event-one', 'Neu importiertes Turnier');
  `, legacyDatabase);

  assert.equal(
    psql(`
      SELECT title
      FROM public.fortnite_events
      WHERE id = 'legacy-event-one';
    `, legacyDatabase),
    "Neu importiertes Turnier",
    "Das zuvor entfernte Turnier muss erneut angelegt worden sein.",
  );
  assert.equal(
    psql(`
      SELECT is_favorite::text || ':' || updated_at::text || ':' || revision::text
      FROM public.user_event_bookmarks
      WHERE user_id = '${legacyAccountId}' AND event_id = 'legacy-event-one';
    `, legacyDatabase),
    bookmarkStateBeforeEventRefresh,
    "Ein erneuter Turnierimport darf den gespeicherten Favoritenstatus nicht verändern.",
  );

  assert.equal(
    psql(`
      DELETE FROM auth.users
      WHERE id = '${legacyAccountId}'
      RETURNING id;
    `, legacyDatabase),
    legacyAccountId,
    "Der Test muss genau das erste Konto löschen.",
  );
  assert.equal(
    psql(`
      SELECT string_agg(
        user_id::text || ':' || event_id,
        '|' ORDER BY user_id, event_id
      )
      FROM public.user_event_bookmarks;
    `, legacyDatabase),
    `${otherAccountId}:legacy-event-two`,
    "Das Löschen eines Kontos muss alle zugehörigen Favoriten kaskadierend entfernen und die des anderen Kontos erhalten.",
  );
});

test("der Kontolösch-Endpunkt entfernt die Favoriten des gelöschten Kontos", async (context) => {
  if (!postgresAvailable) {
    context.skip("PostgreSQL ist für den lokalen Kontolöschtest erforderlich.");
    return;
  }

  const apiPort = await findAvailablePort();
  const supabaseUrl = "https://account-deletion-test.supabase.invalid";
  const signingKey = "local-test-signing-key-for-account-deletion";
  const savedEnvironment = [
    ["PORT", process.env.PORT],
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["CUPCAL_ACCOUNT_DELETION_SIGNING_KEY", process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY],
    ["CUPCAL_ACCOUNT_DELETION_PREVIOUS_SIGNING_KEY", process.env.CUPCAL_ACCOUNT_DELETION_PREVIOUS_SIGNING_KEY],
  ];
  const originalFetch = globalThis.fetch;
  let failNextDelete = true;
  let apiServer;

  psql(`
    INSERT INTO auth.users (id) VALUES
      ('${deletionAccountId}'),
      ('${deletionOtherAccountId}');
    INSERT INTO public.user_event_bookmarks (user_id, event_id) VALUES
      ('${deletionAccountId}', 'account-deletion-event-one'),
      ('${deletionAccountId}', 'account-deletion-event-two'),
      ('${deletionOtherAccountId}', 'account-deletion-other-event');
  `, legacyDatabase);

  process.env.PORT = String(apiPort);
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-service-role-key";
  process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY = signingKey;
  delete process.env.CUPCAL_ACCOUNT_DELETION_PREVIOUS_SIGNING_KEY;

  globalThis.fetch = async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    if (!requestUrl.startsWith(supabaseUrl)) return originalFetch(input, init);

    const url = new URL(requestUrl);
    if (url.pathname.endsWith("/auth/v1/user")) {
      return Response.json({
        id: deletionAccountId,
        aud: "authenticated",
        role: "authenticated",
        email: "account-deletion-test@example.invalid",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        identities: [],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
    }

    const adminDeleteMatch = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
    if (adminDeleteMatch) {
      const requestedAccountId = decodeURIComponent(adminDeleteMatch[1]);
      assert.equal(requestedAccountId, deletionAccountId, "Der API-Endpunkt darf nur das angemeldete Konto löschen.");
      const requestMethod = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (requestMethod === "GET") {
        return Response.json({
          id: deletionAccountId,
          aud: "authenticated",
          role: "authenticated",
          email: "account-deletion-test@example.invalid",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        });
      }
      assert.equal(requestMethod, "DELETE", "Der Supabase-Admin-Client soll das Konto löschen.");
      if (failNextDelete) {
        failNextDelete = false;
        return Response.json({ message: "Simulierter Löschfehler" }, { status: 500 });
      }

      assert.equal(
        psql(`DELETE FROM auth.users WHERE id = '${deletionAccountId}' RETURNING id;`, legacyDatabase),
        deletionAccountId,
        "Der Supabase-Admin-Aufruf muss das Konto tatsächlich aus der lokalen Datenbank löschen.",
      );
      return Response.json({ id: deletionAccountId });
    }

    return Response.json({ message: "Unerwartete Supabase-Anfrage" }, { status: 500 });
  };

  try {
    ({ server: apiServer } = await import("../dist/index.mjs"));
    if (!apiServer.listening) {
      await new Promise((resolve, reject) => {
        apiServer.once("listening", resolve);
        apiServer.once("error", reject);
      });
    }

    const apiUrl = `http://127.0.0.1:${apiPort}/api/v1/account/deletion`;
    const headers = { Authorization: "Bearer local-authenticated-account-token" };
    const requestResponse = await originalFetch(`${apiUrl}/request`, { method: "POST", headers });
    assert.equal(requestResponse.status, 200, "Ein angemeldetes Konto muss einen Bestätigungslink erhalten.");
    const { confirmationToken } = await requestResponse.json();
    assert.equal(typeof confirmationToken, "string");

    const confirmOptions = {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationToken }),
    };
    const failedDeleteResponse = await originalFetch(`${apiUrl}/confirm`, confirmOptions);
    assert.equal(failedDeleteResponse.status, 503, "Ein Fehler beim Löschen muss als nicht verfügbar gemeldet werden.");
    assert.deepEqual(await failedDeleteResponse.json(), {
      error: "Das Konto konnte gerade nicht gelöscht werden. Bitte versuche es erneut.",
    });
    assert.equal(
      psql(`
        SELECT string_agg(user_id::text || ':' || event_id, '|' ORDER BY user_id, event_id)
        FROM public.user_event_bookmarks;
      `, legacyDatabase),
      `${otherAccountId}:legacy-event-two|${deletionAccountId}:account-deletion-event-one|${deletionAccountId}:account-deletion-event-two|${deletionOtherAccountId}:account-deletion-other-event`,
      "Bei einem fehlgeschlagenen Kontolöschversuch müssen alle Favoriten erhalten bleiben.",
    );

    const successfulDeleteResponse = await originalFetch(`${apiUrl}/confirm`, confirmOptions);
    assert.equal(successfulDeleteResponse.status, 204, "Eine erfolgreiche Löschung muss mit 204 bestätigt werden.");
    assert.equal(
      psql(`
        SELECT string_agg(user_id::text || ':' || event_id, '|' ORDER BY user_id, event_id)
        FROM public.user_event_bookmarks;
      `, legacyDatabase),
      `${otherAccountId}:legacy-event-two|${deletionOtherAccountId}:account-deletion-other-event`,
      "Die Favoriten des gelöschten Kontos müssen verschwinden; das zweite Konto muss unverändert bleiben.",
    );
  } finally {
    if (apiServer?.listening) {
      await new Promise((resolve, reject) => {
        apiServer.close((error) => error ? reject(error) : resolve());
      });
    }
    globalThis.fetch = originalFetch;
    for (const [name, value] of savedEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
