import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMhtEventUpsertRows,
  getMhtEventTimeChanges,
  listRecentMhtImports,
  recordMhtImportHistory,
  upsertMhtEvents,
} from "./supabase.ts";

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
