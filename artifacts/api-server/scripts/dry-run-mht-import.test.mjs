import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import {
  extractMhtHtml,
  getSnapshotFreshness,
  MAX_SNAPSHOT_AGE_MS,
  mapTeamFormat,
  parseMhtSchedule,
} from "./dry-run-mht-import.mjs";

function makeMht(html, { region = "EU", date = "Mon, 09 Nov 2026 23:37:49 GMT" } = {}) {
  const boundary = "CupCalTestBoundary";
  return Buffer.from(
    [
      "From: <Saved by Blink>",
      `Snapshot-Content-Location: https://www.fortnite.com/competitive/schedule?region=${region}`,
      ...(date === null ? [] : [`Date: ${date}`]),
      `Content-Type: multipart/related; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "Content-Location: https://www.fortnite.com/competitive/schedule",
      "",
      html,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  );
}

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cupcal-api-preview-test-"));
  const bundlePath = path.join(tempDir, "app.mjs");
  const previousRequire = globalThis.require;
  globalThis.require = createRequire(import.meta.url);
  try {
    await build({
      entryPoints: [fileURLToPath(new URL("../src/app.ts", import.meta.url))],
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: bundlePath,
      logLevel: "silent",
      banner: {
        js: "import { createRequire as createBundleRequire } from 'node:module'; globalThis.require = createBundleRequire(import.meta.url);",
      },
    });
  } finally {
    if (previousRequire === undefined) delete globalThis.require;
    else globalThis.require = previousRequire;
  }

  try {
    const { default: app } = await import(pathToFileURL(bundlePath).href);
    return { app, tempDir };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

test("liefert Snapshot-Alter und Warnstatus über den authentifizierten Admin-Vorschau-Endpunkt", async () => {
  const originalEnv = new Map(
    ["NODE_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CUPCAL_IMPORT_ADMIN_EMAILS"]
      .map((key) => [key, process.env[key]]),
  );
  const previousRequire = globalThis.require;
  let eventDatabaseQueryCount = 0;
  const fakeSupabase = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization === "Bearer auth-outage-preview-token") {
        response.statusCode = 503;
        response.end(JSON.stringify({
          message: "Auth provider temporarily unavailable",
          code: "server_error",
        }));
        return;
      }
      const usersByToken = {
        "Bearer valid-admin-preview-token": {
          id: "admin-preview-test-user",
          email: "admin@cupcal.test",
        },
        "Bearer valid-non-admin-preview-token": {
          id: "non-admin-preview-test-user",
          email: "player@cupcal.test",
        },
      };
      const user = usersByToken[request.headers.authorization];
      if (!user) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Invalid test session" }));
        return;
      }
      response.end(JSON.stringify(user));
      return;
    }
    if (request.url?.startsWith("/rest/v1/fortnite_events")) {
      eventDatabaseQueryCount += 1;
      response.end("[]");
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
    const apiUrl = `http://127.0.0.1:${apiServer.address().port}`;
    const eventDate = new Intl.DateTimeFormat("de-DE", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const html = `
      <html><body><h2>${eventDate}</h2>
        <a id="schedule-event-link-preview-age"
          href="/competitive/events/PreviewAgeCup?round=PreviewAgeRound"
          aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">
          <span>Battle Royale Solo Cash Cup</span>
        </a>
        <a id="schedule-event-link-preview-foreign"
          href="https://events.example/competitive/events/ForeignPreviewCup?round=ForeignPreviewRound"
          aria-label="20:00–21:00 Uhr - Battle Royale Duos Cash Cup">
          <span>Battle Royale Duos Cash Cup</span>
        </a>
      </body></html>`;

    async function preview(date) {
      const startedAt = Date.now();
      const response = await fetch(`${apiUrl}/api/v1/admin/events/import/preview`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-admin-preview-token",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: makeMht(html, { date }),
      });
      const completedAt = Date.now();
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return {
        result,
        startedAt,
        completedAt,
      };
    }

    const freshDate = new Date().toUTCString();
    const fresh = await preview(freshDate);
    const freshSnapshot = Date.parse(fresh.result.snapshotAt);
    assert.equal(fresh.result.isSnapshotStale, false);
    assert.equal(fresh.result.invalidCount, 1);
    assert.deepEqual(fresh.result.issues, [{
      id: "epic:ForeignPreviewCup:ForeignPreviewRound",
      title: "Battle Royale Duos Cash Cup",
      errors: ["Der Eventlink verweist nicht auf eine offizielle Fortnite-Domain."],
    }]);
    assert.ok(fresh.result.snapshotAgeMs >= fresh.startedAt - freshSnapshot);
    assert.ok(fresh.result.snapshotAgeMs <= fresh.completedAt - freshSnapshot);
    assert.ok(fresh.result.snapshotAgeMs <= MAX_SNAPSHOT_AGE_MS);

    const staleDate = new Date(Date.now() - MAX_SNAPSHOT_AGE_MS - 5_000).toUTCString();
    const stale = await preview(staleDate);
    const staleSnapshot = Date.parse(stale.result.snapshotAt);
    assert.equal(stale.result.isSnapshotStale, true);
    assert.ok(stale.result.snapshotAgeMs > MAX_SNAPSHOT_AGE_MS);
    assert.ok(stale.result.snapshotAgeMs >= stale.startedAt - staleSnapshot);
    assert.ok(stale.result.snapshotAgeMs <= stale.completedAt - staleSnapshot);

    const timeless = await preview(null);
    assert.equal(timeless.result.snapshotAt, null);
    assert.equal(timeless.result.snapshotAgeMs, null);
    assert.equal(timeless.result.isSnapshotStale, false);

    const queriesBeforeNonAdminPreview = eventDatabaseQueryCount;
    const deniedResponse = await fetch(`${apiUrl}/api/v1/admin/events/import/preview`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-non-admin-preview-token",
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: makeMht(html, { date: freshDate }),
    });
    const deniedResult = await deniedResponse.json();
    assert.equal(deniedResponse.status, 403, JSON.stringify(deniedResult));
    assert.equal(deniedResult.authorized, false);
    assert.equal(eventDatabaseQueryCount, queriesBeforeNonAdminPreview);

    const queriesBeforeAuthOutagePreview = eventDatabaseQueryCount;
    const unavailableResponse = await fetch(`${apiUrl}/api/v1/admin/events/import/preview`, {
      method: "POST",
      headers: {
        Authorization: "Bearer auth-outage-preview-token",
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: makeMht(html, { date: freshDate }),
    });
    const unavailableResult = await unavailableResponse.json();
    assert.equal(unavailableResponse.status, 503, JSON.stringify(unavailableResult));
    assert.deepEqual(unavailableResult, {
      error: "Die Anmeldung kann gerade nicht geprüft werden.",
    });
    assert.equal(eventDatabaseQueryCount, queriesBeforeAuthOutagePreview);
  } finally {
    if (apiServer?.listening) await closeServer(apiServer);
    if (fakeSupabase.listening) await closeServer(fakeSupabase);
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    if (previousRequire === undefined) delete globalThis.require;
    else globalThis.require = previousRequire;
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("liest Eventkarten und wandelt die Berliner Ortszeit nach UTC um", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-epicgames_S43_Cup_EU-S43_Cup_Event1_EU"
        href="https://www.fortnite.com/competitive/events/S43_Cup?round=S43_Cup_Event1_EU"
        aria-label="19:00–22:00 Uhr - Battle Royale Solo Cash Cup – Wettkampfabschnitt 1">
        <span>Battle Royale Solo Cash Cup</span>
      </a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.region, "EU");
  assert.equal(result.cardCount, 1);
  assert.equal(result.validCount, 1);
  assert.equal(result.upcomingAtSnapshot, 1);
  assert.equal(result.events[0].id, "epic:S43_Cup:S43_Cup_Event1_EU");
  assert.equal(result.events[0].title, "Battle Royale Solo Cash Cup");
  assert.equal(result.events[0].start_time, "2026-11-10T18:00:00.000Z");
  assert.equal(result.events[0].end_time, "2026-11-10T21:00:00.000Z");
  assert.equal(result.events[0].team_format, "Solo");
  assert.equal(result.events[0].tournament_type, "Cash Cup");
});

test("ordnet nur ausdrücklich erkennbare Turnierarten zu", () => {
  const titles = [
    ["Battle Royale Solo FNCS", "FNCS"],
    ["Battle Royale Solo Cash Cup", "Cash Cup"],
    ["Battle Royale Solo Ranked Cup", "Ranked Cup"],
    ["Battle Royale Solo Community Cup", "Community"],
  ];
  const cards = titles.map(([title], index) => `
    <a id="schedule-event-link-type-${index}"
      href="/competitive/events/Type${index}?round=TypeRound${index}"
      aria-label="19:00–20:00 Uhr - ${title}">
      <span>${title}</span>
    </a>`).join("");
  const result = parseMhtSchedule(makeMht(`
    <html><body><h2>10. November 2026</h2>${cards}</body></html>
  `));

  assert.equal(result.validCount, titles.length);
  assert.deepEqual(result.events.map((event) => event.tournament_type), titles.map(([, type]) => type));
  assert.deepEqual(result.issues, []);
});

test("zeigt unbekannte und widersprüchliche Turnierarten als nicht importierte Karten", () => {
  const titles = [
    "Battle Royale Solo Invitational",
    "Battle Royale Solo FNCS Cash Cup",
  ];
  const cards = titles.map((title, index) => `
    <a id="schedule-event-link-unknown-type-${index}"
      href="/competitive/events/UnknownType${index}?round=UnknownTypeRound${index}"
      aria-label="19:00–20:00 Uhr - ${title}">
      <span>${title}</span>
    </a>`).join("");
  const result = parseMhtSchedule(makeMht(`
    <html><body><h2>10. November 2026</h2>${cards}</body></html>
  `));

  assert.equal(result.cardCount, 2);
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 2);
  assert.deepEqual(result.events, []);
  assert.deepEqual(
    result.issues.map(({ id, title, errors }) => ({ id, title, errors })),
    titles.map((title, index) => ({
      id: `epic:UnknownType${index}:UnknownTypeRound${index}`,
      title,
      errors: ["Turnierart fehlt oder ist nicht eindeutig angegeben."],
    })),
  );
});

test("ordnet mehrere Karten dem jeweils zuletzt gelesenen Datum zu", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-a" href="/competitive/events/CupA?round=RoundA"
        aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup A"><span>Battle Royale Solo Cash Cup A</span></a>
      <h2>12. November 2026</h2>
      <a id="schedule-event-link-b" href="/competitive/events/CupB?round=RoundB"
        aria-label="18:00–20:00 Uhr - Duos Reload Cash Cup"><span>Duos Reload Cash Cup</span></a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.validCount, 2);
  assert.equal(result.events[0].start_time, "2026-11-10T18:00:00.000Z");
  assert.equal(result.events[1].start_time, "2026-11-12T17:00:00.000Z");
  assert.equal(result.events[1].game_mode, "Reload");
  assert.equal(result.events[1].team_format, "Duos");
});

test("erkennt FNCS Reload Solos als eindeutiges Solo-Format", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-fncs-solos"
        href="/competitive/events/FNCS_Reload?round=FNCS_Reload_Solos"
        aria-label="19:00–22:00 Uhr - FNCS Reload Solos – Runden">
        <span>FNCS Reload Solos – Runden</span>
      </a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.validCount, 1);
  assert.equal(result.events[0].team_format, "Solo");
  assert.deepEqual(result.events[0].review_warnings, []);
});

test("erkennt ausdrücklich angegebene Solo-, Duo-, Trio- und Squads-Formate", () => {
  const formats = [
    ["Battle Royale Solo Cash Cup", "Solo"],
    ["Reload Duos Cash Cup", "Duos"],
    ["Zero Build Trio Victory Cup", "Trios"],
    ["Creative Squads Community Cup", "Squads"],
  ];
  const cards = formats.map(([title], index) => `
    <a id="schedule-event-link-format-${index}"
      href="/competitive/events/Format${index}?round=Round${index}"
      aria-label="19:00–20:00 Uhr - ${title}">
      <span>${title}</span>
    </a>`).join("");
  const result = parseMhtSchedule(makeMht(`
    <html><body><h2>10. November 2026</h2>${cards}</body></html>
  `));

  assert.equal(result.validCount, formats.length);
  assert.deepEqual(result.events.map((event) => event.team_format), formats.map(([, format]) => format));
  assert.deepEqual(result.issues, []);
});

test("importiert explizite Formate nur mit offiziellen Fortnite-Eventlinks", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-external"
        href="https://fortnite.com.attacker.example/competitive/events/ForeignCup?round=ForeignRound"
        aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">
        <span>Battle Royale Solo Cash Cup</span>
      </a>
      <a id="schedule-event-link-official"
        href="https://www.fortnite.com/competitive/events/OfficialCup?round=OfficialRound"
        aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">
        <span>Battle Royale Solo Cash Cup</span>
      </a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.cardCount, 2);
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(result.events.map((event) => event.id), [
    "epic:OfficialCup:OfficialRound",
  ]);
  assert.deepEqual(result.issues.map(({ id, title, errors }) => ({ id, title, errors })), [{
    id: "epic:ForeignCup:ForeignRound",
    title: "Battle Royale Solo Cash Cup",
    errors: ["Der Eventlink verweist nicht auf eine offizielle Fortnite-Domain."],
  }]);
});

test("importiert nur eindeutig erkennbare Spielmodi", () => {
  const cards = [
    "Battle Royale Solo Cash Cup",
    "Zero Build Duos Cash Cup",
    "Reload Trios Cash Cup",
    "Creative Squads Community Cup",
  ].map((title, index) => `
    <a id="schedule-event-link-mode-${index}"
      href="/competitive/events/Mode${index}?round=Round${index}"
      aria-label="19:00–20:00 Uhr - ${title}">
      <span>${title}</span>
    </a>`).join("") + `
    <a id="schedule-event-link-mode-in-label"
      href="/competitive/events/ModeInLabel?round=ModeInLabel"
      aria-label="19:00–20:00 Uhr - Reload Solos – Runden">
      <span>Solo Cash Cup</span>
    </a>`;
  const result = parseMhtSchedule(makeMht(`
    <html><body><h2>10. November 2026</h2>${cards}</body></html>
  `));

  assert.equal(result.validCount, 5);
  assert.deepEqual(
    result.events.map((event) => event.game_mode),
    ["Battle Royale", "Zero Build", "Reload", "Community", "Reload"],
  );
  assert.deepEqual(result.issues, []);
});

test("sperrt fehlende, allgemeine und widersprüchliche Spielmodusangaben", () => {
  const titles = [
    "Solo Cash Cup",
    "Duos Community Cup",
    "Zero Build Creative Trios Cash Cup",
    "Duos Team Rumble Cash Cup",
  ];
  const cards = titles.map((title, index) => `
    <a id="schedule-event-link-unknown-mode-${index}"
      href="/competitive/events/UnknownMode${index}?round=UnknownRound${index}"
      aria-label="19:00–20:00 Uhr - ${title}">
      <span>${title}</span>
    </a>`).join("");
  const result = parseMhtSchedule(makeMht(`
    <html><body><h2>10. November 2026</h2>${cards}</body></html>
  `));

  assert.equal(result.cardCount, 4);
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 4);
  assert.deepEqual(result.events, []);
  assert.deepEqual(
    result.issues.map(({ id, title, errors }) => ({ id, title, errors })),
    titles.map((title, index) => ({
      id: `epic:UnknownMode${index}:UnknownRound${index}`,
      title,
      errors: ["Spielmodus fehlt oder ist nicht eindeutig angegeben."],
    })),
  );
});

test("sperrt ein unbekanntes oder widersprüchliches Spielformat mit Kennung und Titel", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-unknown"
        href="/competitive/events/UnknownCup?round=UnknownRound"
        aria-label="19:00–22:00 Uhr - Battle Royale Team Cash Cup">
        <span>Battle Royale Team Cash Cup</span>
      </a>
      <a id="schedule-event-link-conflict"
        href="/competitive/events/ConflictCup?round=ConflictRound"
        aria-label="19:00–22:00 Uhr - Zero Build Solo Duos Cash Cup">
        <span>Zero Build Solo Duos Cash Cup</span>
      </a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.cardCount, 2);
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 2);
  assert.deepEqual(result.events, []);
  assert.deepEqual(
    result.issues.map(({ id, title, errors }) => ({ id, title, errors })),
    [
      {
        id: "epic:UnknownCup:UnknownRound",
        title: "Battle Royale Team Cash Cup",
        errors: ["Spielformat fehlt oder ist nicht eindeutig angegeben."],
      },
      {
        id: "epic:ConflictCup:ConflictRound",
        title: "Zero Build Solo Duos Cash Cup",
        errors: ["Spielformat fehlt oder ist nicht eindeutig angegeben."],
      },
    ],
  );
});

test("wertet Squad-Belege nur aus offiziellen und widerspruchsfreien Eventkennungen", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-unofficial-squads"
        href="https://not-fortnite.com/competitive/events/S43_SquadsVictoryCup?round=UnofficialRound"
        aria-label="19:00–22:00 Uhr - Battle Royale Team Cash Cup">
        <span>Battle Royale Team Cash Cup</span>
      </a>
      <a id="schedule-event-link-conflicting-squads"
        href="https://www.fortnite.com/competitive/events/S43_SquadsVictoryCup?round=ConflictingRound"
        aria-label="19:00–22:00 Uhr - Battle Royale Solo Cash Cup">
        <span>Battle Royale Solo Cash Cup</span>
      </a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.validCount, 0);
  assert.deepEqual(
    result.issues.map(({ id, title, errors }) => ({ id, title, errors })),
    [
      {
        id: "epic:S43_SquadsVictoryCup:UnofficialRound",
        title: "Battle Royale Team Cash Cup",
        errors: ["Der Eventlink verweist nicht auf eine offizielle Fortnite-Domain."],
      },
      {
        id: "epic:S43_SquadsVictoryCup:ConflictingRound",
        title: "Battle Royale Solo Cash Cup",
        errors: ["Spielformat fehlt oder ist nicht eindeutig angegeben."],
      },
    ],
  );
});

test("prüft Spielformate an echten, anonymisierten MHT-Turnierkarten", async () => {
  const fixture = await readFile(
    new URL("./fixtures/real-schedule-format-sample.mht", import.meta.url),
  );
  const result = parseMhtSchedule(fixture);
  const { html } = extractMhtHtml(fixture);
  const cards = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(([, attributes, fragment]) => {
      const getAttribute = (name) =>
        attributes.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? "";
      return {
        id: getAttribute("id"),
        title: fragment.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
        ariaLabel: getAttribute("aria-label"),
        href: getAttribute("href"),
      };
    })
    .filter((card) => card.id.startsWith("schedule-event-link-"));
  const expectedFormats = new Map([
    ["schedule-event-link-solo", "Solo"],
    ["schedule-event-link-duo", "Duos"],
    ["schedule-event-link-trio", "Trios"],
    ["schedule-event-link-reload-zero-build", "Duos"],
    ["schedule-event-link-team-official-squads", "Squads"],
    ["schedule-event-link-team-unconfirmed", null],
    ["schedule-event-link-format-unknown", null],
    ["schedule-event-link-fncs", "Solo"],
    ["schedule-event-link-community", "Duos"],
  ]);

  assert.equal(result.cardCount, expectedFormats.size);
  for (const card of cards) {
    const expected = expectedFormats.get(card.id);
    assert.equal(expectedFormats.has(card.id), true, `Unerwartete Karte ${card.id}`);
    const eventSlug = new URL(card.href).pathname.match(/\/events\/([^/]+)/)?.[1] ?? "";
    assert.equal(
      mapTeamFormat(`${card.title} ${card.ariaLabel}`, eventSlug),
      expected,
      `${card.id}: Kartenname, aria-label und Eventkennung`,
    );
  }

  const acceptedByTitle = new Map(result.events.map((event) => [event.title, event]));
  assert.equal(acceptedByTitle.get("Trio Cash Cup Battle Royale")?.team_format, "Trios");
  assert.equal(
    acceptedByTitle.get("Reload ZB Duos Cash Cup Zero Build")?.game_mode,
    "Zero Build",
  );
  assert.equal(
    acceptedByTitle.get("Reload ZB Duos Cash Cup Zero Build")?.game_ruleset,
    "Zero Build",
  );
  assert.equal(
    acceptedByTitle.get("Reload ZB Duos Cash Cup Zero Build")?.tournament_series,
    "Reload",
  );
  assert.equal(
    acceptedByTitle.get("Victory Cash Cup (Team) Battle Royale")?.team_format,
    "Squads",
  );
  assert.equal(
    acceptedByTitle.get("Reload Ranked Cup (Duo) Battle Royale")?.game_mode,
    "Reload",
  );
  assert.equal(
    acceptedByTitle.get("Reload Ranked Cup (Duo) Battle Royale")?.game_ruleset,
    "Battle Royale",
  );
  assert.equal(
    acceptedByTitle.get("Reload Ranked Cup (Duo) Battle Royale")?.tournament_series,
    "Reload",
  );
  assert.equal(acceptedByTitle.get("FNCS Solos Reload Heats")?.tournament_type, "FNCS");
  assert.equal(acceptedByTitle.get("OG Community Cup")?.tournament_type, "Community");
  assert.deepEqual(
    [...new Set(result.events.map((event) => event.tournament_type))].sort(),
    ["Cash Cup", "Community", "FNCS", "Ranked Cup"],
  );
  assert.equal(result.issues.length, 3);
  assert.deepEqual(
    result.issues.map(({ id, title, errors }) => ({ id, title, errors })),
    [
      {
        id: "epic:S43_SoloReloadTestCup:S43_SoloReloadTestCup_EU",
        title: "Solo Reload Test Cup",
        errors: ["Turnierart fehlt oder ist nicht eindeutig angegeben."],
      },
      {
        id: "epic:S43_VictoryCup:S43_VictoryCup_Event1_EU",
        title: "Victory Cash Cup (Team) Battle Royale",
        errors: ["Spielformat fehlt oder ist nicht eindeutig angegeben."],
      },
      {
        id: "epic:S43_OnePieceZoroCup:S43_OnePieceZoroCup_EU",
        title: "ONE PIECE: „ZORRO“-CUP Battle Royale",
        errors: ["Turnierart fehlt oder ist nicht eindeutig angegeben."],
      },
    ],
  );
  assert.equal(result.events.length, 6);
});

test("meldet unvollständige Karten, statt sie als importierbar auszugeben", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-bad" href="/competitive/events/Cup?round=Round"
        aria-label="Zeit folgt"><span>Solo Cup</span></a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.cardCount, 1);
  assert.equal(result.validCount, 0);
  assert.equal(result.invalidCount, 1);
  assert.match(result.issues[0].errors.join(" "), /Start- und Endzeit fehlt/);
});

test("weist eine ungültige Region zurück", () => {
  const html = "<html><body>leer</body></html>";
  assert.throws(() => parseMhtSchedule(makeMht(html, { region: "INVALID" })), /Region/);
});

test("warnt erst, wenn der Snapshot strikt älter als 24 Stunden ist", () => {
  const now = Date.parse("2026-11-13T12:00:00.000Z");
  const snapshotAtDeadline = new Date(now - MAX_SNAPSHOT_AGE_MS).toISOString();
  const snapshotJustTooOld = new Date(now - MAX_SNAPSHOT_AGE_MS - 1).toISOString();

  assert.deepEqual(getSnapshotFreshness(snapshotAtDeadline, now), {
    snapshotAgeMs: MAX_SNAPSHOT_AGE_MS,
    isSnapshotStale: false,
  });
  assert.deepEqual(getSnapshotFreshness(snapshotJustTooOld, now), {
    snapshotAgeMs: MAX_SNAPSHOT_AGE_MS + 1,
    isSnapshotStale: true,
  });
});

test("meldet unbekannte und zukünftige Snapshot-Zeitpunkte ohne falsche Alterswarnung", () => {
  const now = Date.parse("2026-11-13T12:00:00.000Z");

  assert.deepEqual(getSnapshotFreshness(null, now), {
    snapshotAgeMs: null,
    isSnapshotStale: false,
  });
  assert.deepEqual(getSnapshotFreshness("not-a-date", now), {
    snapshotAgeMs: null,
    isSnapshotStale: false,
  });
  assert.deepEqual(getSnapshotFreshness("2026-11-13T12:00:01.000Z", now), {
    snapshotAgeMs: -1000,
    isSnapshotStale: false,
  });
});

test("gibt Snapshot-Alter und Warnstatus auch im Parser-Ergebnis zurück", () => {
  const result = parseMhtSchedule(
    makeMht(`
      <html><body>
        <h2>14. November 2026</h2>
        <a id="schedule-event-link-freshness" href="/competitive/events/FreshnessCup?round=FreshnessRound"
          aria-label="19:00–20:00 Uhr - Battle Royale Solo Cash Cup">
          <span>Battle Royale Solo Cash Cup</span>
        </a>
      </body></html>`, {
      date: "Thu, 12 Nov 2026 11:59:59 GMT",
    }),
    { now: Date.parse("2026-11-13T12:00:00.000Z") },
  );

  assert.equal(result.snapshotAgeMs, MAX_SNAPSHOT_AGE_MS + 1000);
  assert.equal(result.isSnapshotStale, true);
});
