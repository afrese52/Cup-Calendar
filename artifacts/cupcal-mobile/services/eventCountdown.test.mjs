import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventCountdownLabel } from '../data/eventCountdown.ts';

const now = Date.parse('2026-11-10T15:00:00.000Z');

test('zählt die verbleibenden Stunden und Minuten herunter', () => {
  assert.equal(
    getEventCountdownLabel('2026-11-10T16:00:00.000Z', '2026-11-10T19:00:00.000Z', now),
    'in 1 Std. 0 Min.',
  );
  assert.equal(
    getEventCountdownLabel('2026-11-10T16:30:00.000Z', '2026-11-10T19:30:00.000Z', now),
    'in 1 Std. 30 Min.',
  );
  assert.equal(
    getEventCountdownLabel('2026-11-10T15:45:00.000Z', '2026-11-10T18:45:00.000Z', now),
    'in 45 Min.',
  );
  assert.equal(
    getEventCountdownLabel('2026-11-10T15:01:00.000Z', '2026-11-10T18:01:00.000Z', now),
    'in 1 Min.',
  );
});

test('zeigt laufende und beendete Termine statt falscher Countdown-Stunden', () => {
  assert.equal(
    getEventCountdownLabel('2026-11-10T14:00:00.000Z', '2026-11-10T16:00:00.000Z', now),
    'Läuft',
  );
  assert.equal(
    getEventCountdownLabel('2026-11-10T12:00:00.000Z', '2026-11-10T14:00:00.000Z', now),
    'Beendet',
  );
});

test('formatiert weit entfernte Termine in Tagen und behandelt ungültige Startzeiten', () => {
  assert.equal(
    getEventCountdownLabel('2026-11-12T16:00:00.000Z', '2026-11-12T19:00:00.000Z', now),
    'in 2 Tagen 1 Std. 0 Min.',
  );
  assert.equal(getEventCountdownLabel('keine Zeit', '2026-11-12T19:00:00.000Z', now), 'Zeit unbekannt');
});
