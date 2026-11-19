import assert from "node:assert/strict";
import test from "node:test";
import { parseIcsSchedule } from "./ics-import.mjs";

function makeIcs(lines, calendarName = "CupCal EU") {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `X-WR-CALNAME:${calendarName}`,
    ...lines,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function event({
  uid = "stable-event-id@example.invalid",
  start = "20301112T180000Z",
  end = "20301112T193000Z",
  summary = "FNCS Reload Solo Qualifier",
  extra = [],
} = {}) {
  const startLine = extra.find((line) => line.startsWith("DTSTART")) ?? `DTSTART:${start}`;
  const endLine = extra.find((line) => line.startsWith("DTEND")) ?? `DTEND:${end}`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    startLine,
    endLine,
    `SUMMARY:${summary}`,
    ...extra.filter((line) => !line.startsWith("DTSTART") && !line.startsWith("DTEND")),
    "END:VEVENT",
  ];
}

test("liest UTC-Termine, Kategorien, Turnierdaten und IDs aus einer ICS-Datei", () => {
  const result = parseIcsSchedule(makeIcs(event()), { region: "EU" });
  assert.equal(result.cardCount, 1);
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 0);
  assert.equal(result.region, "EU");
  assert.equal(result.timeZone, "Europe/Berlin");
  assert.equal(result.events[0].title, "FNCS Reload Solo Qualifier");
  assert.equal(result.events[0].start_time, "2030-11-12T18:00:00.000Z");
  assert.equal(result.events[0].end_time, "2030-11-12T19:30:00.000Z");
  assert.equal(result.events[0].game_mode, "Reload");
  assert.equal(result.events[0].team_format, "Solo");
  assert.equal(result.events[0].tournament_type, "FNCS");
  assert.equal(result.events[0].category, "Qualifikation");
  assert.match(result.events[0].id, /^ics:[a-f0-9]{64}$/);
});

test("konvertiert lokale TZID-Zeiten und ganztägige ICS-Termine korrekt", () => {
  const timed = parseIcsSchedule(makeIcs(event({
    start: "20300310T100000",
    end: "20300310T113000",
    extra: ["DTSTART;TZID=America/New_York:20300310T100000", "DTEND;TZID=America/New_York:20300310T113000"],
  })), { region: "NAE" });
  assert.equal(timed.events.length, 1);
  assert.equal(timed.events[0].start_time, "2030-03-10T14:00:00.000Z");
  assert.equal(timed.events[0].end_time, "2030-03-10T15:30:00.000Z");
  assert.equal(timed.events[0].region, "NAE");

  const allDay = parseIcsSchedule(makeIcs(event({
    start: "20301112",
    end: "20301113",
    extra: ["DTSTART;VALUE=DATE:20301112", "DTEND;VALUE=DATE:20301113"],
  })), { region: "EU" });
  assert.equal(allDay.events.length, 1);
  assert.equal(allDay.events[0].start_time, "2030-11-11T23:00:00.000Z");
  assert.equal(allDay.events[0].end_time, "2030-11-12T23:00:00.000Z");
});

test("dekodiert gefaltete Zeilen und ICS-Text-Escapes", () => {
  const source = makeIcs([
    "BEGIN:VEVENT",
    "UID:folded-event@example.invalid",
    "DTSTART:20301112T180000Z",
    "DTEND:20301112T193000Z",
    "SUMMARY:FNCS Reload Solo ",
    " Qualifier",
    "DESCRIPTION:Round\\, one\\nSecond line",
    "END:VEVENT",
  ]);
  const result = parseIcsSchedule(source, { region: "EU" });
  assert.equal(result.events[0].title, "FNCS Reload Solo Qualifier");
  assert.equal(result.events[0].description, "Round, one\nSecond line");
});

test("importiert die gezeigten Turniere mit transparent markierten Standardwerten", () => {
  const result = parseIcsSchedule(makeIcs([
    ...event({
      uid: "mobile-test-cup@example.invalid",
      summary: "[OCE] [Mobile] Mobile Test Cup Event 3",
      extra: ["DESCRIPTION:Mobile Test Cup Event 3"],
    }),
    ...event({
      uid: "naw-team-knight@example.invalid",
      summary: "[NAW] Champion Team Knight FNCS Cup Battle Royale Session 1",
    }),
    ...event({
      uid: "nac-team-knight@example.invalid",
      summary: "[NAC] Champion Team Knight FNCS Cup Battle Royale Session 1",
    }),
  ]), { region: "OCE" });

  assert.equal(result.cardCount, 3);
  assert.equal(result.validCount, 3);
  assert.equal(result.invalidCount, 0);
  assert.deepEqual(
    result.events.map(({ title, region, game_mode, team_format, tournament_type, review_notes }) => ({
      title,
      region,
      game_mode,
      team_format,
      tournament_type,
      review_notes,
    })),
    [
      {
        title: "[OCE] [Mobile] Mobile Test Cup Event 3",
        region: "OCE",
        game_mode: "Battle Royale",
        team_format: "Solo",
        tournament_type: "Community",
        review_notes: [
          "Turnierart nicht erkennbar; Standardwert „Community“ wurde gesetzt.",
          "Spielmodus nicht erkennbar; Standardwert „Battle Royale“ wurde gesetzt.",
          "Spielformat nicht erkennbar; Standardwert „Solo“ wurde gesetzt.",
        ],
      },
      ...["[NAW]", "[NAC]"].map((prefix) => ({
        title: `${prefix} Champion Team Knight FNCS Cup Battle Royale Session 1`,
        region: prefix === "[NAW]" ? "NAW" : "NAC",
        game_mode: "Battle Royale",
        team_format: "Squads",
        tournament_type: "FNCS",
        review_notes: ["Spielformat nicht erkennbar; Standardwert „Squads“ wurde gesetzt."],
      })),
    ],
  );
});

test("überspringt wiederkehrende oder unvollständige Termine mit verständlichem Grund", () => {
  const recurring = event({ extra: ["RRULE:FREQ=WEEKLY;COUNT=3"] });
  const incomplete = [
    "BEGIN:VEVENT",
    "UID:no-end@example.invalid",
    "DTSTART:20301112T180000Z",
    "SUMMARY:FNCS Reload Solo Cash Cup",
    "END:VEVENT",
  ];
  const result = parseIcsSchedule(makeIcs([...recurring, ...incomplete]), { region: "EU" });
  assert.equal(result.events.length, 0);
  assert.equal(result.invalidCount, 2);
  assert.match(result.issues[0].errors.join(" "), /Wiederkehrende/);
  assert.match(result.issues[1].errors.join(" "), /Endzeit fehlt/);
});

test("weist ungültige Datei, Region, Datum, Zeitzone und doppelte UID zurück oder aus", () => {
  assert.throws(() => parseIcsSchedule("not a calendar", { region: "EU" }), /keine gültige ICS/);
  assert.throws(() => parseIcsSchedule(makeIcs(event()), {}), /Turnierregion/);
  assert.throws(() => parseIcsSchedule(makeIcs(event()), { region: "XX" }), /Turnierregion/);

  const invalidDate = parseIcsSchedule(makeIcs(event({
    start: "20300231T180000Z",
  })), { region: "EU" });
  assert.match(invalidDate.issues[0].errors.join(" "), /ungültig/);
  const invalidZone = parseIcsSchedule(makeIcs(event({
    extra: ["DTSTART;TZID=Unknown/Zone:20301112T180000", "DTEND;TZID=Unknown/Zone:20301112T193000"],
  })), { region: "EU" });
  assert.match(invalidZone.issues[0].errors.join(" "), /Zeitzone/);

  const duplicateUid = makeIcs([...event(), ...event({
    start: "20301113T180000Z",
    end: "20301113T193000Z",
  })]);
  const duplicateResult = parseIcsSchedule(duplicateUid, { region: "EU" });
  assert.equal(duplicateResult.validCount, 1);
  assert.equal(duplicateResult.invalidCount, 1);
  assert.match(duplicateResult.issues[0].errors.join(" "), /UID mehrmals/);
});
