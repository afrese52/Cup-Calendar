import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import test from "node:test";
import { commitMhtImport, upsertMhtEvents } from "./supabase.ts";

const { Client, Pool } = pg;
const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

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

function createPostgresUpsertAdmin(pool) {
  return {
    from(table) {
      assert.equal(table, "fortnite_events");
      return {
        async upsert(rows, options) {
          assert.deepEqual(options, { onConflict: "id", defaultToNull: false });
          if (rows.length === 0) return { error: null };

          const columns = Object.keys(rows[0]);
          const quotedColumns = columns.map((column) => `"${column}"`);
          const values = rows.flatMap((row) => columns.map((column) => row[column]));
          const tuples = rows.map((_, rowIndex) => {
            const placeholders = columns.map(
              (_column, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`,
            );
            return `(${placeholders.join(", ")})`;
          });
          const updates = quotedColumns
            .filter((column) => column !== '"id"')
            .map((column) => `${column} = EXCLUDED.${column}`);

          try {
            await pool.query(
              `INSERT INTO public.fortnite_events (${quotedColumns.join(", ")})
               VALUES ${tuples.join(", ")}
               ON CONFLICT ("id") DO UPDATE SET ${updates.join(", ")}`,
              values,
            );
            return { error: null };
          } catch (error) {
            return { error };
          }
        },
      };
    },
  };
}

function createPostgresAtomicImportAdmin(pool) {
  return {
    async rpc(name, args) {
      assert.equal(name, "commit_mht_import");
      try {
        await pool.query(
          "SELECT public.commit_mht_import($1::jsonb, $2::jsonb)",
          [JSON.stringify(args.p_events), JSON.stringify(args.p_history)],
        );
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
  };
}

test("wiederholter Import aktualisiert denselben Termin und erhält Admin-Felder und Snapshot-Einträge", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cupcal-mht-import-db-test-"));
  const dataDir = path.join(tempDir, "data");
  const port = await findAvailablePort();
  let postgresStarted = false;
  let setupClient;
  let pool;

  try {
    run("initdb", ["-D", dataDir, "--username=postgres", "--auth=trust"]);
    run("pg_ctl", [
      "-D",
      dataDir,
      "-o",
      `-h 127.0.0.1 -p ${port} -k ${tempDir} -F -c wal_level=logical`,
      "-w",
      "start",
      "-l",
      path.join(tempDir, "postgres.log"),
    ]);
    postgresStarted = true;

    setupClient = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "postgres",
    });
    await setupClient.connect();
    await setupClient.query("CREATE DATABASE cupcal_mht_import_test");
    await setupClient.end();
    setupClient = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "cupcal_mht_import_test",
    });
    await setupClient.connect();
    await setupClient.query(`
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
    await setupClient.end();
    setupClient = undefined;

    pool = new Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "cupcal_mht_import_test",
    });

    const migrationsDir = path.join(projectDir, "supabase/migrations");
    const migrations = (await readdir(migrationsDir))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    assert.ok(migrations.length > 0, "Es wurden keine Supabase-Migrationen gefunden.");
    for (const migration of migrations) {
      await pool.query(await readFile(path.join(migrationsDir, migration), "utf8"));
    }

    const adminUserId = "2d81b842-8d9c-4de3-8411-6787a91e68e9";
    await pool.query(
      "INSERT INTO auth.users (id, raw_user_meta_data) VALUES ($1, '{}'::jsonb)",
      [adminUserId],
    );

    const importedEvent = {
      id: "epic:cup:round-1",
      title: "Solo Cup",
      region: "EU",
      game_mode: "Battle Royale",
      game_ruleset: "Battle Royale",
      tournament_series: null,
      team_format: "Solo",
      tournament_type: "Cash Cup",
      category: "Turnier",
      start_time: "2026-11-12T18:00:00.000Z",
      end_time: "2026-11-12T20:00:00.000Z",
      description: "",
      poster_url: null,
      is_featured: false,
      review_warnings: [],
    };
    const staleSnapshotEvent = {
      ...importedEvent,
      id: "epic:cup:round-missing-from-snapshot",
      title: "Termin außerhalb des aktuellen Snapshots",
    };

    await pool.query(
      `INSERT INTO public.fortnite_events (
        id, title, region, game_mode, game_ruleset, tournament_series,
        team_format, tournament_type, category, start_time, end_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        staleSnapshotEvent.id,
        staleSnapshotEvent.title,
        staleSnapshotEvent.region,
        staleSnapshotEvent.game_mode,
        staleSnapshotEvent.game_ruleset,
        staleSnapshotEvent.tournament_series,
        staleSnapshotEvent.team_format,
        staleSnapshotEvent.tournament_type,
        staleSnapshotEvent.category,
        staleSnapshotEvent.start_time,
        staleSnapshotEvent.end_time,
      ],
    );

    const admin = createPostgresUpsertAdmin(pool);
    await upsertMhtEvents([importedEvent], admin);

    const afterFirstImport = await pool.query(
      "SELECT id, title FROM public.fortnite_events WHERE id = $1",
      [importedEvent.id],
    );
    assert.deepEqual(afterFirstImport.rows, [{
      id: importedEvent.id,
      title: importedEvent.title,
    }], "Der erste Import muss einen neuen Termin mit stabiler Kennung einfügen.");

    await pool.query(
      `UPDATE public.fortnite_events
       SET is_featured = TRUE, custom_admin_note = $2
       WHERE id = $1`,
      [importedEvent.id, "Von der Administration gepflegte Notiz"],
    );

    const repeatedEvent = {
      ...importedEvent,
      title: "Aktualisierter Solo Cup",
      start_time: "2026-11-12T18:30:00.000Z",
      end_time: "2026-11-12T20:30:00.000Z",
    };
    await upsertMhtEvents([repeatedEvent], admin);

    const finalRows = await pool.query(
      `SELECT id, title, start_time, is_featured, custom_admin_note
       FROM public.fortnite_events
       WHERE id = ANY($1::text[])
       ORDER BY id`,
      [[importedEvent.id, staleSnapshotEvent.id]],
    );
    assert.deepEqual(finalRows.rows, [
      {
        id: importedEvent.id,
        title: repeatedEvent.title,
        start_time: new Date(repeatedEvent.start_time),
        is_featured: true,
        custom_admin_note: "Von der Administration gepflegte Notiz",
      },
      {
        id: staleSnapshotEvent.id,
        title: staleSnapshotEvent.title,
        start_time: new Date(staleSnapshotEvent.start_time),
        is_featured: false,
        custom_admin_note: null,
      },
    ], "Der zweite Import muss dieselbe Zeile aktualisieren, Admin-Felder erhalten und fehlende Snapshot-Einträge behalten.");

    const atomicEvent = {
      ...importedEvent,
      id: "epic:cup:atomic-import",
      title: "Atomar gespeicherter Solo Cup",
    };
    const history = {
      adminUserId,
      adminEmail: "admin@cupcal.test",
      sourceHint: "fortnite.com",
      insertedCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      skippedWarningCount: 0,
      skippedPastCount: 0,
      skippedInvalidCount: 0,
      skippedCards: [],
    };
    const atomicAdmin = createPostgresAtomicImportAdmin(pool);
    await commitMhtImport([atomicEvent], history, atomicAdmin);

    const committed = await pool.query(
      `SELECT event.id, event.title, history.admin_email, history.inserted_count, history.skipped_cards
       FROM public.fortnite_events AS event
       CROSS JOIN public.admin_import_history AS history
       WHERE event.id = $1`,
      [atomicEvent.id],
    );
    assert.deepEqual(committed.rows, [{
      id: atomicEvent.id,
      title: atomicEvent.title,
      admin_email: "admin@cupcal.test",
      inserted_count: 1,
      skipped_cards: [],
    }], "Der Datenbankaufruf muss Termin und Historie gemeinsam schreiben.");

    const failedNewEvent = {
      ...atomicEvent,
      id: "epic:cup:must-roll-back",
      title: "Darf nicht gespeichert werden",
    };
    await assert.rejects(
      commitMhtImport([
        { ...atomicEvent, title: "Änderung muss zurückgerollt werden" },
        failedNewEvent,
      ], {
        ...history,
        adminUserId: "11111111-1111-4111-8111-111111111111",
      }, atomicAdmin),
      (error) => error.name === "MhtImportTransactionError",
    );

    const afterRollback = await pool.query(
      `SELECT id, title
       FROM public.fortnite_events
       WHERE id = ANY($1::text[])
       ORDER BY id`,
      [[atomicEvent.id, failedNewEvent.id]],
    );
    assert.deepEqual(afterRollback.rows, [{
      id: atomicEvent.id,
      title: atomicEvent.title,
    }], "Ein fehlgeschlagener Historieneintrag muss alle Terminänderungen zurückrollen.");
    const historyCount = await pool.query(
      "SELECT count(*)::integer AS count FROM public.admin_import_history",
    );
    assert.equal(historyCount.rows[0].count, 1, "Der fehlgeschlagene Import darf keinen Historieneintrag hinterlassen.");
  } finally {
    await pool?.end();
    await setupClient?.end();
    if (postgresStarted) {
      const stop = spawnSync(
        "pg_ctl",
        ["-D", dataDir, "-m", "fast", "-w", "stop"],
        { encoding: "utf8" },
      );
      assert.equal(
        stop.status,
        0,
        `PostgreSQL konnte nicht beendet werden:\n${stop.stderr}`,
      );
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
