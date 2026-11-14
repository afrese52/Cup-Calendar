import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY,
  loadAccountConfirmationResendAvailableAt,
  saveAccountConfirmationResendAvailableAt,
} from './accountAuth.ts';

const storedValues = new Map();
const localStorage = {
  get length() { return storedValues.size; },
  clear() { storedValues.clear(); },
  getItem(key) { return storedValues.get(key) ?? null; },
  key(index) { return [...storedValues.keys()][index] ?? null; },
  removeItem(key) { storedValues.delete(key); },
  setItem(key, value) { storedValues.set(key, String(value)); },
};
globalThis.window = { localStorage };

beforeEach(() => {
  localStorage.clear();
});

test('speichert die Ablaufzeit der Bestätigungswartezeit dauerhaft', async () => {
  const now = Date.now();
  const availableAt = now + 30_000;

  await saveAccountConfirmationResendAvailableAt(availableAt);

  assert.equal(localStorage.getItem(ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY), String(availableAt));
  assert.equal(await loadAccountConfirmationResendAvailableAt(now), availableAt);
});

test('ignoriert abgelaufene und ungültige gespeicherte Ablaufzeiten', async () => {
  const now = Date.now();

  for (const invalidValue of [String(now - 1), 'kein-zeitstempel', 'Infinity']) {
    localStorage.setItem(ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY, invalidValue);

    assert.equal(await loadAccountConfirmationResendAvailableAt(now), null);
    assert.equal(localStorage.getItem(ACCOUNT_CONFIRMATION_RESEND_AVAILABLE_AT_KEY), null);
  }
});
