import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { parseMhtSchedule } from "../../scripts/dry-run-mht-import.mjs";
import {
  buildMhtEventUpsertRows,
  getMhtEventTimeChanges,
  listRecentMhtImports,
  recordMhtImportHistory,
  upsertMhtEvents,
} from "./supabase.ts";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function loadApiApp() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cupcal-admin-import-api-test-"));
  const bundlePath = path.join(tempDir, "app.mjs");
  const previousRequire = globalThis.require;
  globalThis.require = createRequire(import.meta.url);
  try {
    await build({
      entryPoints: [fileURLToPath(new URL("../app.ts", import.meta.url))],
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: bundlePath,
      logLevel: "silent",
      banner: {
        js: "import { createRequire as createBundleRequire } from 'node:module'; globalThis.require = createBundleRequire(import.meta.url);",
      },
    });
    const { default: app } = await import(pathToFileURL(bundlePath).href);
    return { app, tempDir };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  } finally {
    if (previousRequire === undefined) delete globalThis.require;
    else globalThis.require = previousRequire;
  }
}

function event(overrides = {}) {
  return {
    id: "epic:cup:round-1",
    title: "Solo Cup",
    region: "EU",
    game_mode: "Battle Royale",
    team_format: "Solo",
    tournament_type: "Cash Cup",
    category: "Turnier",
    start_time: "2026-11-12T18:00:00.000Z",
    end_time: "2026-11-12T20:00:00.000Z",
    description: "",
    poster_url: null,
    is_featured: false,
    review_warnings: [],
    ...overrides,
  };
}

test("meldet für neue Termine und unveränderte Zeiten keine Zeitänderung", () => {
  const imported = event();

  assert.deepEqual(getMhtEventTimeChanges(imported, null), {
    previousStartTime: null,
    previousEndTime: null,
  });
  assert.deepEqual(getMhtEventTimeChanges(imported, {
    start_time: "2026-11-12T19:00:00+01:00",
    end_time: "2026-11-12T21:00:00+01:00",
  }), {
    previousStartTime: null,
    previousEndTime: null,
  });
});

test("gibt Zeitänderungen im authentifizierten Import-Vorschau-Endpunkt zurück", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const fixturePath = new URL("../../scripts/fixtures/real-schedule-format-sample.mht", import.meta.url);
  const sourceText = await readFile(fixturePath, "utf8");
  const schedule = parseMhtSchedule(Buffer.from(sourceText, "utf8"), { timeZone: "Europe/Berlin" });
  const unchangedEvent = schedule.events.find((item) => item.title === "Reload Ranked Cup (Duo) Battle Royale");
  const changedEvent = schedule.events.find((item) => item.title === "Trio Cash Cup Battle Royale");
  assert.ok(unchangedEvent, "Die Fixture enthält den unveränderten Duo-Termin.");
  assert.ok(changedEvent, "Die Fixture enthält den geänderten Trio-Termin.");
  const previousChangedStart = new Date(Date.parse(changedEvent.start_time) - 60 * 60 * 1000).toISOString();
  const previousChangedEnd = new Date(Date.parse(changedEvent.end_time) - 60 * 60 * 1000).toISOString();
  const queriedIds = [];
  const fakeSupabase = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer valid-admin-preview-token") {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify({
        id: "admin-preview-test-user",
        email: "admin@cupcal.test",
      }));
      return;
    }
    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      const url = new URL(request.url, "http://supabase.test");
      queriedIds.push(url.searchParams.get("id"));
      response.end(JSON.stringify([
        {
          id: unchangedEvent.id,
          start_time: unchangedEvent.start_time,
          end_time: unchangedEvent.end_time,
        },
        {
          id: changedEvent.id,
          start_time: previousChangedStart,
          end_time: previousChangedEnd,
        },
      ]));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let fakeSupabaseUrl;
  let apiServer;
  let tempDir;

  try {
    fakeSupabaseUrl = await listen(fakeSupabase);
    process.env["NODE_ENV"] = "production";
    process.env["SUPABASE_URL"] = fakeSupabaseUrl;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
    process.env["CUPCAL_IMPORT_ADMIN_EMAILS"] = "admin@cupcal.test";

    const loaded = await loadApiApp();
    tempDir = loaded.tempDir;
    apiServer = loaded.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.once("listening", resolve);
    });

    const response = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import/preview`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-admin-preview-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));

    const newEvent = result.events.find((item) => item.id === "epic:S43_ReloadZBDuosCashCup:S43_ReloadZBDuosCashCup_Event1Round2_EU");
    const unchanged = result.events.find((item) => item.id === unchangedEvent.id);
    const changed = result.events.find((item) => item.id === changedEvent.id);
    assert.ok(newEvent, "Die Vorschau enthält den neuen Termin.");
    assert.ok(unchanged, "Die Vorschau enthält den unveränderten Termin.");
    assert.ok(changed, "Die Vorschau enthält den geänderten Termin.");

    assert.equal(newEvent.willUpdate, false);
    assert.equal(newEvent.previousStartTime, null);
    assert.equal(newEvent.previousEndTime, null);

    assert.equal(unchanged.willUpdate, true);
    assert.equal(unchanged.previousStartTime, null);
    assert.equal(unchanged.previousEndTime, null);

    assert.equal(changed.willUpdate, true);
    assert.equal(changed.startTime, changedEvent.start_time);
    assert.equal(changed.endTime, changedEvent.end_time);
    assert.equal(changed.previousStartTime, previousChangedStart);
    assert.equal(changed.previousEndTime, previousChangedEnd);
    assert.equal(queriedIds.length, 1);
    assert.ok(queriedIds[0]?.includes(unchangedEvent.id));
    assert.ok(queriedIds[0]?.includes(changedEvent.id));
    assert.ok(queriedIds[0]?.includes(newEvent.id));
  } finally {
    if (apiServer?.listening) await closeServer(apiServer);
    if (fakeSupabase.listening) await closeServer(fakeSupabase);
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("gibt nur die jeweils geänderte bisherige Zeit zurück", () => {
  assert.deepEqual(getMhtEventTimeChanges(event(), {
    start_time: "2026-11-12T17:00:00.000Z",
    end_time: "2026-11-12T20:00:00.000Z",
  }), {
    previousStartTime: "2026-11-12T17:00:00.000Z",
    previousEndTime: null,
  });

  assert.deepEqual(getMhtEventTimeChanges(event(), {
    start_time: "2026-11-12T18:00:00.000Z",
    end_time: "2026-11-12T21:00:00.000Z",
  }), {
    previousStartTime: null,
    previousEndTime: "2026-11-12T21:00:00.000Z",
  });
});

test("upsert payload uses the stable event/round id and updates classified fields only", () => {
  const [row] = buildMhtEventUpsertRows([event()]);

  assert.equal(row.id, "epic:cup:round-1");
  assert.equal(row.category, "Turnier");
  assert.equal(row.team_format, "Solo");
  assert.equal("is_featured" in row, false);
  assert.equal("custom_admin_note" in row, false);
  assert.equal("description" in row, false);
  assert.ok(Number.isFinite(Date.parse(row.updated_at)));
});

test("upsert excludes events with unresolved mapping warnings", () => {
  assert.deepEqual(
    buildMhtEventUpsertRows([event({ review_warnings: ["Spielformat prüfen"] })]),
    [],
  );
});

test("writes approved rows with conflict handling and never performs deletion", async () => {
  let call;
  const admin = {
    from(table) {
      assert.equal(table, "fortnite_events");
      return {
        async upsert(rows, options) {
          call = { rows, options };
          return { error: null };
        },
      };
    },
  };

  await upsertMhtEvents([event()], admin);

  assert.deepEqual(call.options, { onConflict: "id", defaultToNull: false });
  assert.equal(call.rows.length, 1);
});

test("hides database error details from the caller", async () => {
  const admin = {
    from() {
      return {
        async upsert() {
          return { error: new Error("secret-looking-key=must-not-escape") };
        },
      };
    },
  };

  await assert.rejects(
    upsertMhtEvents([event()], admin),
    (error) => {
      assert.equal(error.message, "Die geprüften Termine konnten nicht gespeichert werden.");
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test("records only approved import metadata and never stores uploaded content", async () => {
  let inserted;
  const admin = {
    from(table) {
      assert.equal(table, "admin_import_history");
      return {
        async insert(row) {
          inserted = row;
          return { error: null };
        },
      };
    },
  };

  await recordMhtImportHistory({
    adminUserId: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    adminEmail: "admin@example.org",
    sourceHint: "fortnite.com",
    insertedCount: 2,
    updatedCount: 1,
    skippedCount: 4,
  }, admin);

  assert.deepEqual(inserted, {
    admin_user_id: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    admin_email: "admin@example.org",
    source_hint: "fortnite.com",
    inserted_count: 2,
    updated_count: 1,
    skipped_count: 4,
  });
  assert.equal("file_content" in inserted, false);
  assert.equal("service_role_key" in inserted, false);
});

test("marks an import-history write failure without exposing database details", async () => {
  const admin = {
    from() {
      return {
        async insert() {
          return { error: new Error("secret-looking-key=must-not-escape") };
        },
      };
    },
  };

  await assert.rejects(
    recordMhtImportHistory({
      adminUserId: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
      adminEmail: "admin@example.org",
      sourceHint: "fortnite.com",
      insertedCount: 2,
      updatedCount: 1,
      skippedCount: 4,
    }, admin),
    (error) => {
      assert.equal(error.name, "ImportHistoryWriteError");
      assert.equal(error.message, "Der Import wurde gespeichert, aber die Historie konnte nicht geschrieben werden.");
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test("lists recent imports without returning unselected database fields", async () => {
  const result = [{
    id: 1,
    imported_at: "2026-11-11T12:00:00.000Z",
    admin_user_id: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    admin_email: "admin@example.org",
    source_hint: "fortnite.com",
    inserted_count: 2,
    updated_count: 1,
    skipped_count: 4,
  }];
  let selected;
  let ordered;
  let limited;
  const admin = {
    from(table) {
      assert.equal(table, "admin_import_history");
      return {
        select(columns) {
          selected = columns;
          return {
            order(column, options) {
              ordered = { column, options };
              return {
                async limit(value) {
                  limited = value;
                  return { data: result, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const entries = await listRecentMhtImports(20, admin);

  assert.deepEqual(entries, result);
  assert.equal(selected.includes("file_content"), false);
  assert.equal(selected.includes("service_role_key"), false);
  assert.deepEqual(ordered, { column: "imported_at", options: { ascending: false } });
  assert.equal(limited, 20);
});
