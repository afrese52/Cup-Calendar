import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminImportAccess,
  getSafeUpcomingEvents,
  parseAdminEmailAllowlist,
} from "./adminImportAccess.ts";

test("Admin-Freigabeliste wird normalisiert und vergleicht E-Mail-Adressen ohne Großschreibung", () => {
  const allowed = parseAdminEmailAllowlist(" Admin@CupCal.de, zweite@example.org ");
  assert.deepEqual([...allowed], ["admin@cupcal.de", "zweite@example.org"]);
  assert.deepEqual(getAdminImportAccess("ADMIN@cupcal.de", allowed), {
    authorized: true,
    reason: null,
  });
});

test("Importzugriff bleibt gesperrt, wenn keine Admin-Freigabe konfiguriert ist", () => {
  assert.deepEqual(getAdminImportAccess("admin@example.org", parseAdminEmailAllowlist("")), {
    authorized: false,
    reason: "not_configured",
  });
});

test("Importplan nimmt nur zukünftige Termine ohne Zuordnungswarnungen auf", () => {
  const events = [
    { start_time: "2026-11-09T12:00:00.000Z", review_warnings: [] },
    { start_time: "2026-11-10T12:00:00.000Z", review_warnings: [] },
    { start_time: "2026-11-11T12:00:00.000Z", review_warnings: ["Format prüfen"] },
  ];
  const plan = getSafeUpcomingEvents(events, "2026-11-10T00:00:00.000Z");
  assert.equal(plan.upcoming.length, 2);
  assert.equal(plan.importable.length, 1);
  assert.equal(plan.skippedPastCount, 1);
});
