import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { PreviewMhtImportResponse } from "../../../../lib/api-zod/src/generated/api.ts";
import { parseMhtSchedule } from "../../scripts/dry-run-mht-import.mjs";
import {
  buildMhtEventUpsertRows,
  EventMetadataMigrationRequiredError,
  MhtImportTransactionError,
  commitMhtImport,
  getMhtEventChanges,
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

async function loadAdminImportApiApp({ markAllEventsAsWarnings = false } = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cupcal-admin-import-counts-api-test-"));
  const bundlePath = path.join(tempDir, "app.mjs");
  const previousRequire = globalThis.require;
  globalThis.require = createRequire(import.meta.url);
  try {
    await build({
      stdin: {
        contents: `
          import express from "express";
          import { createAdminImportRouter } from "./routes/adminImport.ts";
          import { parseMhtSchedule } from "../scripts/dry-run-mht-import.mjs";

          const app = express();
          app.use(express.json());
          app.use((req, _res, next) => {
            req.log = { error() {}, warn() {} };
            next();
          });
          app.use("/api", createAdminImportRouter({
            scheduleParser(sourceText) {
              const schedule = parseMhtSchedule(Buffer.from(sourceText, "utf8"), {
                timeZone: "Europe/Berlin",
              });
              if (${markAllEventsAsWarnings}) {
                for (const event of schedule.events) {
                  event.review_warnings = ["Zuordnung manuell prüfen"];
                }
                return schedule;
              }
              const warningEvent = schedule.events.find(
                (item) => item.id === "epic:WarningDuos:WarningRound",
              );
              if (warningEvent) warningEvent.review_warnings = ["Zuordnung manuell prüfen"];
              return schedule;
            },
          }));
          export default app;
        `,
        resolveDir: path.dirname(fileURLToPath(new URL("../app.ts", import.meta.url))),
        sourcefile: "admin-import-counts-api-test.ts",
      },
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
    ...overrides,
  };
}

test("liefert die getrennten Felder zusätzlich zu den bisherigen API-Angaben", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
      .map((key) => [key, process.env[key]]),
  );
  let useLegacySchema = false;
  const fakeSupabase = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      const url = new URL(request.url, "http://supabase.test");
      if (useLegacySchema && url.searchParams.get("select")?.includes("game_ruleset")) {
        response.statusCode = 400;
        response.end(JSON.stringify({
          code: "42703",
          message: "column fortnite_events.game_ruleset does not exist",
        }));
        return;
      }
      const row = {
        id: "epic:reload-zb:round",
        title: "Reload Zero Build Duos Cash Cup",
        description: "",
        region: "EU",
        game_mode: "Reload",
        game_ruleset: "Zero Build",
        tournament_series: "Reload",
        team_format: "Duos",
        tournament_type: "Cash Cup",
        start_time: "2026-11-14T18:00:00.000Z",
        end_time: "2026-11-14T20:00:00.000Z",
        is_featured: false,
      };
      if (url.searchParams.get("select")?.includes("game_ruleset")) {
        response.end(JSON.stringify([row]));
      } else {
        const { game_ruleset: _ruleset, tournament_series: _series, ...legacyRow } = row;
        response.end(JSON.stringify([legacyRow]));
      }
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
    const loaded = await loadApiApp();
    tempDir = loaded.tempDir;
    apiServer = loaded.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.once("listening", resolve);
    });

    const response = await fetch(`http://127.0.0.1:${apiServer.address().port}/api/v1/events`);
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.data[0].gameMode, "Reload");
    assert.equal(result.data[0].gameRuleset, "Zero Build");
    assert.equal(result.data[0].tournamentSeries, "Reload");

    useLegacySchema = true;
    const legacyResponse = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/events`,
    );
    const legacyResult = await legacyResponse.json();
    assert.equal(legacyResponse.status, 200);
    assert.equal(legacyResult.data[0].gameMode, "Reload");
    assert.equal(legacyResult.data[0].gameRuleset, null);
    assert.equal(legacyResult.data[0].tournamentSeries, null);
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

test("liefert importierte Fixture-Termine über den passenden Turniertyp-Filter", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const fixturePath = new URL("../../scripts/fixtures/real-schedule-format-sample.mht", import.meta.url);
  const sourceText = (await readFile(fixturePath, "utf8"))
    .replace("19. Januar 2025", "16. November 2026");
  const storedRows = [];
  const requestedTypes = [];
  const fakeSupabase = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer valid-admin-import-token") {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify({
        id: "tournament-filter-test-user",
        email: "admin@cupcal.test",
      }));
      return;
    }
    if (request.url?.startsWith("/rest/v1/rpc/commit_mht_import") && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { p_events: importedEvents } = JSON.parse(body);
      storedRows.push(...importedEvents);
      response.end(JSON.stringify(null));
      return;
    }
    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      const url = new URL(request.url, "http://supabase.test");
      const tournamentTypeFilter = url.searchParams.get("tournament_type");
      if (tournamentTypeFilter) {
        const requestedType = tournamentTypeFilter.replace(/^eq\./, "");
        requestedTypes.push(requestedType);
        response.end(JSON.stringify(
          storedRows.filter((row) => row.tournament_type === requestedType),
        ));
        return;
      }
      response.end(JSON.stringify([]));
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
    const apiUrl = `http://127.0.0.1:${apiServer.address().port}/api`;

    const importResponse = await fetch(
      `${apiUrl}/v1/admin/events/import?confirmStaleSnapshot=true`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-admin-import-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const importResult = await importResponse.json();
    assert.equal(importResponse.status, 200, JSON.stringify(importResult));
    assert.equal(importResult.importedCount, storedRows.length);

    const expectedTypes = ["FNCS", "Cash Cup", "Ranked Cup", "Community"];
    assert.deepEqual(
      [...new Set(storedRows.map((row) => row.tournament_type))].sort(),
      [...expectedTypes].sort(),
    );
    assert.ok(
      storedRows.some((row) => row.id === "epic:S33_OGCommunityCup:S33_OGCommunityCup_EU"),
      "Der anonymisierte Community-Termin aus dem geparsten Fixture wurde gespeichert.",
    );

    for (const tournamentType of expectedTypes) {
      const response = await fetch(
        `${apiUrl}/v1/events?tournament_type=${encodeURIComponent(tournamentType)}`,
      );
      const result = await response.json();
      const expectedRows = storedRows.filter((row) => row.tournament_type === tournamentType);
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.ok(expectedRows.length > 0, `Das Fixture enthält gespeicherte Termine vom Typ ${tournamentType}.`);
      assert.deepEqual(
        result.data.map((row) => row.tournamentType),
        expectedRows.map((row) => row.tournament_type),
        `Der Filter ${tournamentType} liefert nur passende importierte Termine.`,
      );
      assert.deepEqual(
        result.data.map((row) => row.id).sort(),
        expectedRows.map((row) => row.id).sort(),
      );
    }
    assert.deepEqual(requestedTypes, expectedTypes);
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

test("meldet fehlende Importspalten am Admin-Endpunkt und speichert keine Teildaten", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const fixturePath = new URL("../../scripts/fixtures/real-schedule-format-sample.mht", import.meta.url);
  const sourceText = (await readFile(fixturePath, "utf8"))
    .replace("19. Januar 2025", "16. November 2026");
  const storedEvents = [];
  const storedHistory = [];
  let commitPayload;
  let directEventWriteCalls = 0;
  let historyWriteCalls = 0;
  const fakeSupabase = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    response.setHeader("Content-Type", "application/json");

    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer missing-import-migration-token") {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify({
        id: "missing-import-migration-test-user",
        email: "admin@cupcal.test",
      }));
      return;
    }

    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      if (request.method === "GET") {
        response.end(JSON.stringify(storedEvents));
        return;
      }
      directEventWriteCalls += 1;
      storedEvents.push(...JSON.parse(body));
      response.statusCode = 201;
      response.end(JSON.stringify(storedEvents));
      return;
    }

    if (request.url === "/rest/v1/rpc/commit_mht_import" && request.method === "POST") {
      commitPayload = JSON.parse(body);
      response.statusCode = 400;
      response.end(JSON.stringify({
        code: "42703",
        details: null,
        hint: null,
        message: "column fortnite_events.tournament_series does not exist",
      }));
      return;
    }

    if (request.url?.startsWith("/rest/v1/admin_import_history") && request.method === "POST") {
      historyWriteCalls += 1;
      storedHistory.push(JSON.parse(body));
      response.statusCode = 201;
      response.end("");
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let apiServer;
  let tempDir;

  try {
    const fakeSupabaseUrl = await listen(fakeSupabase);
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
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import?confirmStaleSnapshot=true`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer missing-import-migration-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const result = await response.json();

    assert.equal(response.status, 503);
    assert.deepEqual(result, {
      error: "Die Datenbank ist noch nicht für Turnierserie und Regelwerk migriert. Wende die neue Supabase-Migration an und wiederhole den Import.",
    });
    assert.ok(commitPayload?.p_events.length > 0, "Der Test hat den transaktionalen Import mit Terminen erreicht.");
    assert.equal(commitPayload.p_events[0].tournament_series, "Reload");
    assert.equal(result.importedCount, undefined, "Die Antwort meldet keinen erfolgreichen Import.");
    assert.equal(directEventWriteCalls, 0, "Es gab keinen einzelnen Schreibversuch für Termine.");
    assert.equal(historyWriteCalls, 0, "Es gab keinen einzelnen Schreibversuch für den Importverlauf.");
    assert.deepEqual(storedEvents, [], "Es wurden keine Termine teilweise gespeichert.");
    assert.deepEqual(storedHistory, [], "Es wurde kein Importverlauf teilweise gespeichert.");
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

test("meldet bei neuen und unveränderten Terminen keine geänderten Details", () => {
  const imported = event();

  assert.deepEqual(getMhtEventChanges(imported, null), {
    previousTitle: null,
    previousGameMode: null,
    previousGameRuleset: null,
    previousTournamentSeries: null,
    previousTeamFormat: null,
    previousTournamentType: null,
    previousCategory: null,
    previousStartTime: null,
    previousEndTime: null,
  });
  assert.deepEqual(getMhtEventChanges(imported, {
    title: imported.title,
    game_mode: imported.game_mode,
    game_ruleset: imported.game_ruleset,
    tournament_series: imported.tournament_series,
    team_format: imported.team_format,
    tournament_type: imported.tournament_type,
    category: imported.category,
    start_time: "2026-11-12T19:00:00+01:00",
    end_time: "2026-11-12T21:00:00+01:00",
  }), {
    previousTitle: null,
    previousGameMode: null,
    previousGameRuleset: null,
    previousTournamentSeries: null,
    previousTeamFormat: null,
    previousTournamentType: null,
    previousCategory: null,
    previousStartTime: null,
    previousEndTime: null,
  });
});

test("liefert nur die bisherigen Werte geänderter Turnierdetails", () => {
  const imported = event();
  assert.deepEqual(getMhtEventChanges(imported, {
    title: "Alter Titel",
    game_mode: "Reload",
    game_ruleset: null,
    tournament_series: "Reload",
    team_format: "Duos",
    tournament_type: "FNCS",
    category: "Liga",
    start_time: "2026-11-12T18:00:00.000Z",
    end_time: "2026-11-12T20:00:00.000Z",
  }), {
    previousTitle: "Alter Titel",
    previousGameMode: "Reload",
    previousGameRuleset: "Nicht angegeben",
    previousTournamentSeries: "Reload",
    previousTeamFormat: "Duos",
    previousTournamentType: "FNCS",
    previousCategory: "Liga",
    previousStartTime: null,
    previousEndTime: null,
  });
});

test("zeigt Turnierartkorrekturen vorab und speichert nur den geprüften Feldwechsel", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const storedEvent = {
    id: "epic:correction-test:round-1",
    title: "Community Solo Cup",
    description: "Terminbeschreibung bleibt erhalten",
    region: "EU",
    game_mode: "Community",
    team_format: "Solo",
    tournament_type: "FNCS",
    category: "Turnier",
    start_time: "2026-12-01T18:00:00.000Z",
    end_time: "2026-12-01T20:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
  };
  const originalFields = { ...storedEvent };
  const updates = [];
  const correctionHistory = [];
  let failCorrectionLog = false;
  const fakeSupabase = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    response.setHeader("Content-Type", "application/json");

    if (request.url === "/auth/v1/user") {
      const token = request.headers.authorization;
      if (
        token !== "Bearer valid-type-correction-token"
        && token !== "Bearer valid-ordinary-type-correction-token"
      ) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      const isAdmin = token === "Bearer valid-type-correction-token";
      response.end(JSON.stringify({
        id: isAdmin ? "admin-type-correction-user" : "ordinary-type-correction-user",
        email: isAdmin ? "admin@cupcal.test" : "user@cupcal.test",
      }));
      return;
    }

    if (request.url === "/rest/v1/rpc/correct_event_tournament_type" && request.method === "POST") {
      const input = JSON.parse(body);
      updates.push({ update: { tournament_type: input.p_tournament_type }, filters: input });
      if (failCorrectionLog) {
        response.statusCode = 400;
        response.end(JSON.stringify({
          code: "P0001",
          details: null,
          hint: null,
          message: "Audit table unavailable",
        }));
        return;
      }
      if (
        input.p_event_id === storedEvent.id
        && input.p_expected_tournament_type === storedEvent.tournament_type
      ) {
        const previousTournamentType = storedEvent.tournament_type;
        Object.assign(storedEvent, { tournament_type: input.p_tournament_type });
        correctionHistory.unshift({
          id: correctionHistory.length + 1,
          event_id: storedEvent.id,
          event_title: storedEvent.title,
          previous_tournament_type: previousTournamentType,
          tournament_type: input.p_tournament_type,
          admin_user_id: input.p_admin_user_id,
          admin_email: input.p_admin_email,
          corrected_at: "2026-11-16T12:00:00.000Z",
        });
        response.end(JSON.stringify([{ history_id: correctionHistory[0].id, corrected_at: correctionHistory[0].corrected_at }]));
      } else {
        response.end("[]");
      }
      return;
    }

    if (request.url?.startsWith("/rest/v1/admin_tournament_type_correction_history")) {
      response.end(JSON.stringify(correctionHistory));
      return;
    }

    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      const url = new URL(request.url, "http://supabase.test");
      if (request.method === "GET") {
        response.end(JSON.stringify(
          url.searchParams.get("id") === `eq.${storedEvent.id}`
            ? [{
                id: storedEvent.id,
                title: storedEvent.title,
                tournament_type: storedEvent.tournament_type,
              }]
            : [],
        ));
        return;
      }
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let apiServer;
  let tempDir;

  try {
    const fakeSupabaseUrl = await listen(fakeSupabase);
    process.env["NODE_ENV"] = "production";
    process.env["SUPABASE_URL"] = fakeSupabaseUrl;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
    process.env["CUPCAL_IMPORT_ADMIN_EMAILS"] = "admin@cupcal.test";

    const loaded = await loadAdminImportApiApp();
    tempDir = loaded.tempDir;
    apiServer = loaded.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.once("listening", resolve);
    });

    const baseUrl = `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/tournament-type`;
    const headers = {
      Authorization: "Bearer valid-type-correction-token",
      "Content-Type": "application/json",
    };
    const previewResponse = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventId: storedEvent.id,
        tournamentType: "Community",
      }),
    });
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status, 200, JSON.stringify(preview));
    assert.deepEqual(preview, {
      eventId: storedEvent.id,
      title: "Community Solo Cup",
      previousTournamentType: "FNCS",
      tournamentType: "Community",
    });
    assert.deepEqual(storedEvent, originalFields, "Die Vorschau ändert keine gespeicherten Felder.");

    const invalidPreviewResponse = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventId: storedEvent.id,
        tournamentType: "Unsupported Cup",
      }),
    });
    assert.equal(invalidPreviewResponse.status, 400);

    const saveResponse = await fetch(baseUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        eventId: preview.eventId,
        expectedTournamentType: preview.previousTournamentType,
        tournamentType: preview.tournamentType,
      }),
    });
    assert.equal(saveResponse.status, 200, JSON.stringify(await saveResponse.clone().json()));
    assert.deepEqual(await saveResponse.json(), {
      eventId: storedEvent.id,
      previousTournamentType: "FNCS",
      tournamentType: "Community",
    });
    assert.deepEqual(updates[0]?.update, { tournament_type: "Community" });
    assert.equal(updates[0]?.filters.p_admin_user_id, "admin-type-correction-user");
    assert.equal(updates[0]?.filters.p_admin_email, "admin@cupcal.test");
    assert.deepEqual(correctionHistory[0], {
      id: 1,
      event_id: storedEvent.id,
      event_title: "Community Solo Cup",
      previous_tournament_type: "FNCS",
      tournament_type: "Community",
      admin_user_id: "admin-type-correction-user",
      admin_email: "admin@cupcal.test",
      corrected_at: "2026-11-16T12:00:00.000Z",
    });
    assert.deepEqual(storedEvent, {
      ...originalFields,
      tournament_type: "Community",
    }, "Titel, Beschreibung, Zeit, Spielmodus und weitere Terminangaben bleiben unverändert.");

    const staleSaveResponse = await fetch(baseUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        eventId: storedEvent.id,
        expectedTournamentType: "FNCS",
        tournamentType: "Cash Cup",
      }),
    });
    assert.equal(staleSaveResponse.status, 409);
    assert.equal(updates.length, 2);
    assert.equal(correctionHistory.length, 1);
    assert.deepEqual(storedEvent, {
      ...originalFields,
      tournament_type: "Community",
    }, "Ein veralteter Vorschauwert überschreibt keine spätere Änderung.");

    const historyUrl = `${baseUrl}/history`;
    const unauthorizedHistoryResponse = await fetch(historyUrl, {
      headers: { Authorization: "Bearer valid-ordinary-type-correction-token" },
    });
    assert.equal(unauthorizedHistoryResponse.status, 403);

    const historyResponse = await fetch(historyUrl, { headers });
    assert.equal(historyResponse.status, 200);
    assert.equal(historyResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await historyResponse.json(), {
      entries: [{
        id: 1,
        eventId: storedEvent.id,
        eventTitle: "Community Solo Cup",
        previousTournamentType: "FNCS",
        tournamentType: "Community",
        adminUserId: "admin-type-correction-user",
        adminEmail: "admin@cupcal.test",
        correctedAt: "2026-11-16T12:00:00.000Z",
      }],
    });

    failCorrectionLog = true;
    const failedLogResponse = await fetch(baseUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        eventId: storedEvent.id,
        expectedTournamentType: "Community",
        tournamentType: "Cash Cup",
      }),
    });
    assert.equal(failedLogResponse.status, 503, await failedLogResponse.clone().text());
    assert.match((await failedLogResponse.json()).error, /nicht geändert.*Änderungsprotokoll/);
    assert.equal(storedEvent.tournament_type, "Community", "Bei fehlgeschlagenem Protokoll bleibt die Terminart unverändert.");
    assert.equal(correctionHistory.length, 1, "Ein fehlgeschlagener Protokolleintrag wird nicht als Erfolg angezeigt.");

    const unauthenticatedResponse = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: storedEvent.id,
        tournamentType: "Cash Cup",
      }),
    });
    assert.equal(unauthenticatedResponse.status, 401);
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
      assert.equal(
        url.searchParams.get("select"),
        "id,title,game_mode,game_ruleset,tournament_series,team_format,tournament_type,category,start_time,end_time",
      );
      queriedIds.push(url.searchParams.get("id"));
      response.end(JSON.stringify([
        {
          id: unchangedEvent.id,
          title: unchangedEvent.title,
          game_mode: unchangedEvent.game_mode,
          game_ruleset: unchangedEvent.game_ruleset,
          tournament_series: unchangedEvent.tournament_series,
          team_format: unchangedEvent.team_format,
          tournament_type: unchangedEvent.tournament_type,
          category: unchangedEvent.category,
          start_time: unchangedEvent.start_time,
          end_time: unchangedEvent.end_time,
        },
        {
          id: changedEvent.id,
          title: "Alter Turniertitel",
          game_mode: "Reload",
          game_ruleset: null,
          tournament_series: "Reload",
          team_format: "Duos",
          tournament_type: "FNCS",
          category: "Liga",
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
    PreviewMhtImportResponse.parse(result);

    assert.equal("schedule" in result, false, "Die vollständige Parser-Antwort bleibt intern.");
    assert.equal("importableEvents" in result, false, "Die interne Importliste bleibt intern.");
    assert.equal("skippedPastCount" in result, false, "Interne Planungszahlen bleiben intern.");
    assert.equal(typeof result.sourceUrl, "string");
    assert.equal(typeof result.snapshotAt, "string");
    assert.equal(typeof result.region, "string");
    assert.equal(typeof result.timeZone, "string");
    assert.ok(Array.isArray(result.events), "Öffentliche Vorschautermine bleiben verfügbar.");
    assert.ok(Array.isArray(result.issues), "Öffentliche Parserhinweise bleiben verfügbar.");

    const newEvent = result.events.find((item) => item.id === "epic:S43_ReloadZBDuosCashCup:S43_ReloadZBDuosCashCup_Event1Round2_EU");
    const unchanged = result.events.find((item) => item.id === unchangedEvent.id);
    const changed = result.events.find((item) => item.id === changedEvent.id);
    assert.ok(newEvent, "Die Vorschau enthält den neuen Termin.");
    assert.ok(unchanged, "Die Vorschau enthält den unveränderten Termin.");
    assert.ok(changed, "Die Vorschau enthält den geänderten Termin.");

    assert.equal(newEvent.willUpdate, false);
    assert.equal(newEvent.previousTitle, null);
    assert.equal(newEvent.previousGameMode, null);
    assert.equal(newEvent.gameRuleset, "Zero Build");
    assert.equal(newEvent.tournamentSeries, "Reload");
    assert.equal(newEvent.previousGameRuleset, null);
    assert.equal(newEvent.previousTournamentSeries, null);
    assert.equal(newEvent.previousTeamFormat, null);
    assert.equal(newEvent.previousTournamentType, null);
    assert.equal(newEvent.previousCategory, null);
    assert.equal(newEvent.previousStartTime, null);
    assert.equal(newEvent.previousEndTime, null);

    assert.equal(unchanged.willUpdate, true);
    assert.equal(unchanged.previousTitle, null);
    assert.equal(unchanged.previousGameMode, null);
    assert.equal(unchanged.previousGameRuleset, null);
    assert.equal(unchanged.previousTournamentSeries, null);
    assert.equal(unchanged.previousTeamFormat, null);
    assert.equal(unchanged.previousTournamentType, null);
    assert.equal(unchanged.previousCategory, null);
    assert.equal(unchanged.previousStartTime, null);
    assert.equal(unchanged.previousEndTime, null);

    assert.equal(changed.willUpdate, true);
    assert.equal(changed.previousTitle, "Alter Turniertitel");
    assert.equal(changed.previousGameMode, "Reload");
    assert.equal(changed.previousGameRuleset, "Nicht angegeben");
    assert.equal(changed.previousTournamentSeries, "Reload");
    assert.equal(changed.previousTeamFormat, "Duos");
    assert.equal(changed.previousTournamentType, "FNCS");
    assert.equal(changed.previousCategory, "Liga");
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

test("verbirgt Supabase-Fehlerdetails bei einem Fehler der Importvorschau", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const fixturePath = new URL("../../scripts/fixtures/real-schedule-format-sample.mht", import.meta.url);
  const sourceText = await readFile(fixturePath, "utf8");
  let existingEventsQueried = false;
  const fakeSupabase = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer valid-admin-preview-error-token") {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify({
        id: "admin-preview-error-test-user",
        email: "admin@cupcal.test",
      }));
      return;
    }
    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      existingEventsQueried = true;
      response.statusCode = 500;
      response.end(JSON.stringify({
        code: "XX000",
        message: "private provider failure detail",
        details: "internal database host and query information",
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let apiServer;
  let tempDir;

  try {
    const fakeSupabaseUrl = await listen(fakeSupabase);
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
          Authorization: "Bearer valid-admin-preview-error-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const result = await response.json();

    assert.equal(existingEventsQueried, true, "Die Vorschau hat vorhandene Termine abgefragt.");
    assert.equal(response.status, 503);
    assert.deepEqual(result, {
      error: "Vorhandene Termine können gerade nicht geprüft werden.",
    });
    assert.doesNotMatch(JSON.stringify(result), /private provider failure detail|internal database host/);
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

test("gibt alle Ausschlusskategorien am Import-Endpunkt getrennt zurück und speichert ihre Summe", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const sourceText = `From: <Saved tournament schedule>
Snapshot-Content-Location: https://www.fortnite.com/competitive/schedule?region=EU
Date: Sat, 14 Nov 2026 12:00:00 GMT
Content-Type: multipart/related; boundary="CupCalImportCountsTest"

--CupCalImportCountsTest
Content-Type: text/html; charset=utf-8

<!doctype html>
<html><body>
  <h2>13. November 2026</h2>
  <a id="schedule-event-link-past"
    href="https://www.fortnite.com/competitive/events/PastSolo?round=PastRound"
    aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">Battle Royale Solo Cash Cup</a>
  <h2>15. November 2026</h2>
  <a id="schedule-event-link-clean"
    href="https://www.fortnite.com/competitive/events/CleanSolo?round=CleanRound"
    aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">Battle Royale Solo Cash Cup</a>
  <a id="schedule-event-link-warning"
    href="https://www.fortnite.com/competitive/events/WarningDuos?round=WarningRound"
    aria-label="19:00–20:00 Uhr - Battle Royale Duos Cash Cup">Battle Royale Duos Cash Cup</a>
  <h2>16. November 2026</h2>
  <a id="schedule-event-link-outside-range"
    href="https://www.fortnite.com/competitive/events/OutsideRange?round=OutsideRangeRound"
    aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">Battle Royale Solo Cash Cup</a>
  <a id="schedule-event-link-invalid"
    href="https://www.fortnite.com/competitive/events/InvalidSolo?round=InvalidRound"
    aria-label="Battle Royale Solo Cash Cup">Battle Royale Solo Cash Cup ohne lesbare Zeit</a>
</body></html>
--CupCalImportCountsTest--
`;
  let importCall;
  let historyRow;
  const fakeSupabase = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    response.setHeader("Content-Type", "application/json");

    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer valid-import-counts-token") {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify({
        id: "admin-import-counts-test-user",
        email: "admin@cupcal.test",
      }));
      return;
    }

    if (request.url?.startsWith("/rest/v1/fortnite_events") && request.method === "GET") {
      response.end("[]");
      return;
    }

    if (request.url === "/rest/v1/rpc/commit_mht_import" && request.method === "POST") {
      importCall = JSON.parse(body);
      historyRow = importCall.p_history;
      response.statusCode = 200;
      response.end("null");
      return;
    }

    if (request.url?.startsWith("/rest/v1/admin_import_history")) {
      if (request.method === "POST") {
        historyRow = JSON.parse(body);
        response.statusCode = 201;
        response.end("");
        return;
      }
      if (request.method === "GET") {
        response.end(JSON.stringify([{
          id: 1,
          imported_at: "2026-11-14T12:00:00.000Z",
          admin_user_id: "admin-import-counts-test-user",
          admin_email: "admin@cupcal.test",
          source_hint: "www.fortnite.com",
          inserted_count: historyRow.inserted_count,
          updated_count: historyRow.updated_count,
          skipped_count: historyRow.skipped_count,
          skipped_warning_count: historyRow.skipped_warning_count,
          skipped_past_count: historyRow.skipped_past_count,
          skipped_invalid_count: historyRow.skipped_invalid_count,
        }]));
        return;
      }
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let apiServer;
  let tempDir;

  try {
    const fakeSupabaseUrl = await listen(fakeSupabase);
    process.env["NODE_ENV"] = "production";
    process.env["SUPABASE_URL"] = fakeSupabaseUrl;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
    process.env["CUPCAL_IMPORT_ADMIN_EMAILS"] = "admin@cupcal.test";

    const loaded = await loadAdminImportApiApp();
    tempDir = loaded.tempDir;
    apiServer = loaded.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.once("listening", resolve);
    });

    const dateRange = "startDate=2026-11-15&endDate=2026-11-15";
    const previewResponse = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import/preview?${dateRange}`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-import-counts-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const scopedPreview = await previewResponse.json();
    assert.equal(previewResponse.status, 200, JSON.stringify(scopedPreview));
    assert.equal(scopedPreview.startDate, "2026-11-15");
    assert.equal(scopedPreview.endDate, "2026-11-15");
    assert.equal(scopedPreview.outOfRangeCount, 1);
    assert.equal(scopedPreview.importableCount, 1);
    assert.equal(scopedPreview.warningCount, 1);
    assert.deepEqual(scopedPreview.events.map((item) => item.id), [
      "epic:CleanSolo:CleanRound",
      "epic:WarningDuos:WarningRound",
    ]);

    const invalidDateResponse = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import/preview?startDate=2026-02-30&endDate=2026-03-01`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-import-counts-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    assert.equal(invalidDateResponse.status, 400);
    assert.match((await invalidDateResponse.json()).error, /Datum ist ungültig/);

    const response = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import?confirmStaleSnapshot=true&${dateRange}`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-import-counts-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const result = await response.json();

    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result, {
      importedCount: 1,
      insertedCount: 1,
      updatedCount: 0,
      skippedWarningCount: 1,
      skippedPastCount: 1,
      skippedInvalidCount: 1,
      skippedCount: 3,
    });
    assert.deepEqual(importCall.p_events.map((row) => row.id), ["epic:CleanSolo:CleanRound"]);
    assert.ok(!importCall.p_events.some((row) => row.id === "epic:OutsideRange:OutsideRangeRound"));
    assert.equal(historyRow.inserted_count, 1);
    assert.equal(historyRow.updated_count, 0);
    assert.equal(historyRow.skipped_count, 3);
    assert.equal(historyRow.skipped_warning_count, 1);
    assert.equal(historyRow.skipped_past_count, 1);
    assert.equal(historyRow.skipped_invalid_count, 1);
    assert.equal(
      historyRow.skipped_count,
      result.skippedWarningCount + result.skippedPastCount + result.skippedInvalidCount,
    );

    const historyResponse = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import/history`,
      { headers: { Authorization: "Bearer valid-import-counts-token" } },
    );
    assert.equal(historyResponse.status, 200);
    assert.deepEqual(await historyResponse.json(), {
      entries: [{
        id: 1,
        importedAt: "2026-11-14T12:00:00.000Z",
        adminUserId: "admin-import-counts-test-user",
        adminEmail: "admin@cupcal.test",
        sourceHint: "www.fortnite.com",
        insertedCount: 1,
        updatedCount: 0,
        skippedCount: 3,
        skippedWarningCount: 1,
        skippedPastCount: 1,
        skippedInvalidCount: 1,
      }],
    });
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

test("weist Dateien ohne importierbare Termine zurück und speichert weder Termine noch Historie", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const fixturePath = new URL("../../scripts/fixtures/real-schedule-format-sample.mht", import.meta.url);
  const sourceText = await readFile(fixturePath, "utf8");
  let eventUpsertCalls = 0;
  let importCommitCalls = 0;
  let historyWriteCalls = 0;
  const fakeSupabase = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.setHeader("Content-Type", "application/json");

    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer no-importable-events-token") {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify({
        id: "no-importable-events-test-user",
        email: "admin@cupcal.test",
      }));
      return;
    }

    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      if (request.method === "GET") {
        response.end("[]");
        return;
      }
      eventUpsertCalls += 1;
      response.statusCode = 201;
      response.end("[]");
      return;
    }

    if (request.url === "/rest/v1/rpc/commit_mht_import") {
      importCommitCalls += 1;
      response.statusCode = 200;
      response.end("null");
      return;
    }

    if (request.url?.startsWith("/rest/v1/admin_import_history")) {
      if (request.method === "POST") historyWriteCalls += 1;
      response.statusCode = 201;
      response.end("");
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let apiServer;
  let tempDir;

  try {
    const fakeSupabaseUrl = await listen(fakeSupabase);
    process.env["NODE_ENV"] = "production";
    process.env["SUPABASE_URL"] = fakeSupabaseUrl;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
    process.env["CUPCAL_IMPORT_ADMIN_EMAILS"] = "admin@cupcal.test";

    const loaded = await loadAdminImportApiApp({ markAllEventsAsWarnings: true });
    tempDir = loaded.tempDir;
    apiServer = loaded.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.once("listening", resolve);
    });

    const response = await fetch(
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer no-importable-events-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sourceText,
      },
    );
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(result, {
      error: "Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren.",
    });
    assert.equal(eventUpsertCalls, 0, "Es wurden keine Termine gespeichert.");
    assert.equal(importCommitCalls, 0, "Der transaktionale Import wurde nicht aufgerufen.");
    assert.equal(historyWriteCalls, 0, "Es wurde kein Historieneintrag gespeichert.");
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

test("schützt die Importhistorie vor nicht angemeldeten und nicht freigegebenen Konten", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  let historyRequestCount = 0;
  const historyEntry = {
    id: 7,
    imported_at: "2026-11-14T12:00:00.000Z",
    admin_user_id: "history-admin-user",
    admin_email: "admin@cupcal.test",
    source_hint: "www.fortnite.com",
    inserted_count: 2,
    updated_count: 1,
    skipped_count: 3,
    skipped_warning_count: 1,
    skipped_past_count: 1,
    skipped_invalid_count: 1,
  };
  const fakeSupabase = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/v1/user") {
      const usersByToken = {
        "authorized-admin-token": {
          id: "history-admin-user",
          email: "admin@cupcal.test",
        },
        "ordinary-account-token": {
          id: "ordinary-user",
          email: "member@cupcal.test",
        },
      };
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      const user = usersByToken[token];
      if (!user) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify(user));
      return;
    }

    if (request.url?.startsWith("/rest/v1/admin_import_history") && request.method === "GET") {
      historyRequestCount += 1;
      response.end(JSON.stringify([historyEntry]));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ message: "Unexpected test request" }));
  });
  let apiServer;
  let tempDir;

  try {
    const fakeSupabaseUrl = await listen(fakeSupabase);
    process.env["NODE_ENV"] = "production";
    process.env["SUPABASE_URL"] = fakeSupabaseUrl;
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";
    process.env["CUPCAL_IMPORT_ADMIN_EMAILS"] = "admin@cupcal.test";

    const loaded = await loadAdminImportApiApp();
    tempDir = loaded.tempDir;
    apiServer = loaded.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.once("listening", resolve);
    });

    const historyUrl =
      `http://127.0.0.1:${apiServer.address().port}/api/v1/admin/events/import/history`;
    const anonymousResponse = await fetch(historyUrl);
    const anonymousResult = await anonymousResponse.json();
    assert.equal(anonymousResponse.status, 401);
    assert.equal("entries" in anonymousResult, false);
    assert.doesNotMatch(JSON.stringify(anonymousResult), /admin@cupcal\.test|www\.fortnite\.com/);

    const ordinaryResponse = await fetch(historyUrl, {
      headers: { Authorization: "Bearer ordinary-account-token" },
    });
    const ordinaryResult = await ordinaryResponse.json();
    assert.equal(ordinaryResponse.status, 403);
    assert.equal("entries" in ordinaryResult, false);
    assert.doesNotMatch(JSON.stringify(ordinaryResult), /admin@cupcal\.test|www\.fortnite\.com/);
    assert.equal(historyRequestCount, 0);

    const adminResponse = await fetch(historyUrl, {
      headers: { Authorization: "Bearer authorized-admin-token" },
    });
    assert.equal(adminResponse.status, 200);
    assert.equal(adminResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await adminResponse.json(), {
      entries: [{
        id: 7,
        importedAt: "2026-11-14T12:00:00.000Z",
        adminUserId: "history-admin-user",
        adminEmail: "admin@cupcal.test",
        sourceHint: "www.fortnite.com",
        insertedCount: 2,
        updatedCount: 1,
        skippedCount: 3,
        skippedWarningCount: 1,
        skippedPastCount: 1,
        skippedInvalidCount: 1,
      }],
    });
    assert.equal(historyRequestCount, 1);
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
  const imported = event();
  const existing = {
    title: imported.title,
    game_mode: imported.game_mode,
    game_ruleset: imported.game_ruleset,
    tournament_series: imported.tournament_series,
    team_format: imported.team_format,
    tournament_type: imported.tournament_type,
    category: imported.category,
    start_time: "2026-11-12T17:00:00.000Z",
    end_time: "2026-11-12T20:00:00.000Z",
  };
  assert.deepEqual(getMhtEventChanges(imported, existing), {
    previousTitle: null,
    previousGameMode: null,
    previousGameRuleset: null,
    previousTournamentSeries: null,
    previousTeamFormat: null,
    previousTournamentType: null,
    previousCategory: null,
    previousStartTime: "2026-11-12T17:00:00.000Z",
    previousEndTime: null,
  });

  assert.deepEqual(getMhtEventChanges(imported, {
    ...existing,
    start_time: "2026-11-12T18:00:00.000Z",
    end_time: "2026-11-12T21:00:00.000Z",
  }), {
    previousTitle: null,
    previousGameMode: null,
    previousGameRuleset: null,
    previousTournamentSeries: null,
    previousTeamFormat: null,
    previousTournamentType: null,
    previousCategory: null,
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

test("erfordert die neue Datenbankmigration statt neue Metadaten still zu verwerfen", async () => {
  const admin = {
    from() {
      return {
        async upsert() {
          return {
            error: {
              code: "42703",
              message: "column fortnite_events.tournament_series does not exist",
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    upsertMhtEvents([event()], admin),
    EventMetadataMigrationRequiredError,
  );
});

test("speichert Termine und Verlauf über einen gemeinsamen Datenbankaufruf", async () => {
  let call;
  const admin = {
    async rpc(name, args) {
      call = { name, args };
      return { error: null };
    },
  };
  const history = {
    adminUserId: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    adminEmail: "admin@example.org",
    sourceHint: "fortnite.com",
    insertedCount: 1,
    updatedCount: 0,
    skippedCount: 2,
    skippedWarningCount: 1,
    skippedPastCount: 1,
    skippedInvalidCount: 0,
  };

  await commitMhtImport([event()], history, admin);

  assert.equal(call.name, "commit_mht_import");
  assert.deepEqual(call.args.p_events.map((row) => row.id), ["epic:cup:round-1"]);
  assert.deepEqual(call.args.p_history, {
    admin_user_id: history.adminUserId,
    admin_email: history.adminEmail,
    source_hint: history.sourceHint,
    inserted_count: 1,
    updated_count: 0,
    skipped_count: 2,
    skipped_warning_count: 1,
    skipped_past_count: 1,
    skipped_invalid_count: 0,
  });
});

test("meldet einen fehlgeschlagenen gemeinsamen Import ohne Datenbankdetails", async () => {
  const admin = {
    async rpc() {
      return { error: new Error("secret-looking-key=must-not-escape") };
    },
  };

  await assert.rejects(commitMhtImport([event()], {
    adminUserId: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    adminEmail: "admin@example.org",
    sourceHint: null,
    insertedCount: 1,
    updatedCount: 0,
    skippedCount: 0,
    skippedWarningCount: 0,
    skippedPastCount: 0,
    skippedInvalidCount: 0,
  }, admin), MhtImportTransactionError);
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
    skippedWarningCount: 2,
    skippedPastCount: 1,
    skippedInvalidCount: 1,
  }, admin);

  assert.deepEqual(inserted, {
    admin_user_id: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    admin_email: "admin@example.org",
    source_hint: "fortnite.com",
    inserted_count: 2,
    updated_count: 1,
    skipped_count: 4,
    skipped_warning_count: 2,
    skipped_past_count: 1,
    skipped_invalid_count: 1,
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
      skippedWarningCount: 2,
      skippedPastCount: 1,
      skippedInvalidCount: 1,
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
    skipped_warning_count: 2,
    skipped_past_count: 1,
    skipped_invalid_count: 1,
  }, {
    id: 2,
    imported_at: "2026-11-10T12:00:00.000Z",
    admin_user_id: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    admin_email: "admin@example.org",
    source_hint: null,
    inserted_count: 1,
    updated_count: 0,
    skipped_count: 3,
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

  assert.deepEqual(entries, [{
    id: 1,
    importedAt: "2026-11-11T12:00:00.000Z",
    adminUserId: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    adminEmail: "admin@example.org",
    sourceHint: "fortnite.com",
    insertedCount: 2,
    updatedCount: 1,
    skippedCount: 4,
    skippedWarningCount: 2,
    skippedPastCount: 1,
    skippedInvalidCount: 1,
  }, {
    id: 2,
    importedAt: "2026-11-10T12:00:00.000Z",
    adminUserId: "2d81b842-8d9c-4de3-8411-6787a91e68e9",
    adminEmail: "admin@example.org",
    sourceHint: null,
    insertedCount: 1,
    updatedCount: 0,
    skippedCount: 3,
    skippedWarningCount: null,
    skippedPastCount: null,
    skippedInvalidCount: null,
  }]);
  assert.equal(selected.includes("file_content"), false);
  assert.equal(selected.includes("service_role_key"), false);
  assert.ok(selected.includes("skipped_warning_count"));
  assert.deepEqual(ordered, { column: "imported_at", options: { ascending: false } });
  assert.equal(limited, 20);
});
