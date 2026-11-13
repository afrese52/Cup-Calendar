import assert from "node:assert/strict";
import test from "node:test";
import { getMhtImportSkippedCounts } from "./mhtImportCounts.ts";

test("counts invalid cards in the import total while keeping categories separate", () => {
  assert.deepEqual(getMhtImportSkippedCounts({
    warningCount: 2,
    skippedPastCount: 3,
    invalidCount: 4,
  }), {
    skippedWarningCount: 2,
    skippedPastCount: 3,
    skippedInvalidCount: 4,
    skippedCount: 9,
  });
});
