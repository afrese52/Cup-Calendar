import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchConsoleCsv } from "./search-console-csv.ts";

const periods = {
  startDate: "2026-10-25",
  endDate: "2026-11-21",
  comparisonStartDate: "2026-09-27",
  comparisonEndDate: "2026-10-24",
};

function reportItem(queryComparisons, userCanonical = null, googleCanonical = null) {
  return {
    url: "https://cupcal.af-software.app/turnierkalender-app/",
    indexing: { userCanonical, googleCanonical },
    queryComparisons,
  };
}

test("exportiert beide Zeiträume mit Position und verständlichen Hinweisen", () => {
  const csv = buildSearchConsoleCsv([reportItem([{
    query: "cupcal kalender",
    currentClicks: 8,
    currentImpressions: 100,
    currentPosition: 4.5,
    comparisonClicks: 3,
    comparisonImpressions: 50,
    comparisonPosition: 5.5,
    status: "both",
  }])], periods);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes(
    '"Seite";"Zeitraum";"Suchbegriff";"Klicks";"Impressionen";"Position";"Website-Canonical";"Google-Canonical";"Canonical-Status"',
  ));
  assert.ok(csv.includes('"Aktuell: 2026-10-25 bis 2026-11-21";"cupcal kalender";"8";"100";"4.5"'));
  assert.ok(csv.includes('"Vergleich: 2026-09-27 bis 2026-10-24";"cupcal kalender";"3";"50";"5.5"'));
  assert.ok(csv.includes("Google blendet seltene oder anonymisierte Suchanfragen möglicherweise aus."));
});

test("exportiert übereinstimmende und abweichende Canonical-Adressen", () => {
  const matchingCanonical = "https://cupcal.af-software.app/";
  const mismatchedReport = reportItem(
    [],
    "https://www.cupcal.af-software.app/",
    matchingCanonical,
  );
  const matchingReport = reportItem([], matchingCanonical, matchingCanonical);
  const csv = buildSearchConsoleCsv([mismatchedReport, matchingReport], periods);

  assert.ok(csv.includes(
    '"https://www.cupcal.af-software.app/";"https://cupcal.af-software.app/";"Abweichend"',
  ));
  assert.ok(csv.includes(
    '"https://cupcal.af-software.app/";"https://cupcal.af-software.app/";"Übereinstimmend"',
  ));
});

test("kennzeichnet fehlende Canonical-Adressen im CSV ausdrücklich", () => {
  const csv = buildSearchConsoleCsv([
    reportItem([], null, "https://cupcal.af-software.app/"),
    reportItem([]),
  ], periods);

  assert.ok(csv.includes(
    '"Nicht verfügbar";"https://cupcal.af-software.app/";"Unvollständig"',
  ));
  assert.ok(csv.includes('"Nicht verfügbar";"Nicht verfügbar";"Unvollständig"'));
});

test("kennzeichnet leere Zeiträume und schützt Suchbegriffe vor Tabellenformeln", () => {
  const csv = buildSearchConsoleCsv([
    reportItem([]),
    reportItem([{
      query: "=HYPERLINK(\"https://example.test\")",
      currentClicks: 1,
      currentImpressions: 2,
      currentPosition: 3,
      comparisonClicks: null,
      comparisonImpressions: null,
      comparisonPosition: null,
      status: "new",
    }]),
  ], periods);

  assert.equal(
    csv.match(/Keine sichtbaren Suchbegriffe für diesen Zeitraum gemeldet/g)?.length,
    3,
  );
  assert.ok(csv.includes(`"'=HYPERLINK(""https://example.test"")"`));
  assert.ok(csv.includes("Google blendet seltene oder anonymisierte Suchanfragen möglicherweise aus."));
});
