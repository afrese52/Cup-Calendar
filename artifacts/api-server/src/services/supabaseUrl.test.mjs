import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSupabaseBaseUrl } from "./supabase.ts";

test("lässt die Supabase-Projektbasis unverändert", () => {
  assert.equal(
    normalizeSupabaseBaseUrl("https://project.example.supabase.co"),
    "https://project.example.supabase.co",
  );
});

test("entfernt bekannte Supabase-API-Endpunkte", async (t) => {
  for (const path of ["auth", "rest", "storage", "functions"]) {
    await t.test(path, () => {
      assert.equal(
        normalizeSupabaseBaseUrl(`https://project.example.supabase.co/${path}/v1/`),
        "https://project.example.supabase.co",
      );
    });
  }
});

test("entfernt Leerzeichen am Rand", () => {
  assert.equal(
    normalizeSupabaseBaseUrl("  https://project.example.supabase.co/auth/v1  "),
    "https://project.example.supabase.co",
  );
});
