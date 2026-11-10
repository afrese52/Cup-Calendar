import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSupabaseBaseUrl } from './supabaseUrl.ts';

test('belässt eine Supabase-Projektbasis unverändert', () => {
  assert.equal(
    normalizeSupabaseBaseUrl('https://cupcal-example.supabase.co'),
    'https://cupcal-example.supabase.co',
  );
});

test('entfernt versehentlich angehängte Supabase-API-Pfade', async (t) => {
  for (const suffix of ['auth', 'rest', 'storage', 'functions']) {
    await t.test(suffix, () => {
      assert.equal(
        normalizeSupabaseBaseUrl(`https://cupcal-example.supabase.co/${suffix}/v1/`),
        'https://cupcal-example.supabase.co',
      );
    });
  }
});

test('entfernt Leerzeichen am Rand', () => {
  assert.equal(
    normalizeSupabaseBaseUrl('  https://cupcal-example.supabase.co/  '),
    'https://cupcal-example.supabase.co',
  );
});
