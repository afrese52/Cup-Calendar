import assert from "node:assert/strict";
import test from "node:test";
import { parseMhtSchedule } from "./dry-run-mht-import.mjs";

function makeMht(html, { region = "EU", date = "Mon, 09 Nov 2026 23:37:49 GMT" } = {}) {
  const boundary = "CupCalTestBoundary";
  return Buffer.from(
    [
      "From: <Saved by Blink>",
      `Snapshot-Content-Location: https://www.fortnite.com/competitive/schedule?region=${region}`,
      `Date: ${date}`,
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

test("liest Eventkarten und wandelt die Berliner Ortszeit nach UTC um", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-epicgames_S43_Cup_EU-S43_Cup_Event1_EU"
        href="https://www.fortnite.com/competitive/events/S43_Cup?round=S43_Cup_Event1_EU"
        aria-label="19:00–22:00 Uhr - Solo Cash Cup – Wettkampfabschnitt 1">
        <span>Solo Cash Cup</span>
      </a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.region, "EU");
  assert.equal(result.cardCount, 1);
  assert.equal(result.validCount, 1);
  assert.equal(result.upcomingAtSnapshot, 1);
  assert.equal(result.events[0].id, "epic:S43_Cup:S43_Cup_Event1_EU");
  assert.equal(result.events[0].title, "Solo Cash Cup");
  assert.equal(result.events[0].start_time, "2026-11-10T18:00:00.000Z");
  assert.equal(result.events[0].end_time, "2026-11-10T21:00:00.000Z");
  assert.equal(result.events[0].team_format, "Solo");
  assert.equal(result.events[0].tournament_type, "Cash Cup");
});

test("ordnet mehrere Karten dem jeweils zuletzt gelesenen Datum zu", () => {
  const html = `
    <html><body>
      <h2>10. November 2026</h2>
      <a id="schedule-event-link-a" href="/competitive/events/CupA?round=RoundA"
        aria-label="19:00–20:00 Uhr - Solo Cup A"><span>Solo Cup A</span></a>
      <h2>12. November 2026</h2>
      <a id="schedule-event-link-b" href="/competitive/events/CupB?round=RoundB"
        aria-label="18:00–20:00 Uhr - Duos Reload Cup"><span>Duos Reload Cup</span></a>
    </body></html>`;
  const result = parseMhtSchedule(makeMht(html));

  assert.equal(result.validCount, 2);
  assert.equal(result.events[0].start_time, "2026-11-10T18:00:00.000Z");
  assert.equal(result.events[1].start_time, "2026-11-12T17:00:00.000Z");
  assert.equal(result.events[1].game_mode, "Reload");
  assert.equal(result.events[1].team_format, "Duos");
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
