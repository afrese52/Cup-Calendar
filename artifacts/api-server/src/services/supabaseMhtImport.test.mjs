import assert from "node:assert/strict";
import test from "node:test";
import { buildMhtEventUpsertRows, upsertMhtEvents } from "./supabase.ts";

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
