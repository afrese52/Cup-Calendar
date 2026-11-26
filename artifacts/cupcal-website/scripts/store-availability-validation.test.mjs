import assert from 'node:assert/strict';
import test from 'node:test';

import { assertPlatformAvailability } from './store-availability-validation.mjs';

test('erkennt aktuelle geplante Android- und offene iOS-Formulierungen', () => {
  assert.doesNotThrow(() => assertPlatformAvailability(
    'Android-Start am 30. November 2026 geplant; iOS-Termin offen.',
    'android',
    false,
    'Meta-Beschreibung',
  ));
  assert.doesNotThrow(() => assertPlatformAvailability(
    'Android-Start am 30. November 2026 geplant; iOS-Termin offen.',
    'ios',
    false,
    'Meta-Beschreibung',
  ));
});

test('erkennt verfügbare Store-Angaben bei bestätigtem Eintrag', () => {
  assert.doesNotThrow(() => assertPlatformAvailability(
    'Android jetzt verfügbar.',
    'android',
    true,
    'Startseite',
  ));
  assert.doesNotThrow(() => assertPlatformAvailability(
    'iOS jetzt im App Store verfügbar.',
    'ios',
    true,
    'Startseite',
  ));
});

test('lehnt fehlende und falsche Verfügbarkeitsaussagen ab', () => {
  assert.throws(
    () => assertPlatformAvailability('CupCal entdecken.', 'android', false, 'Startseite'),
    /kennzeichnet android nicht/,
  );
  assert.throws(
    () => assertPlatformAvailability('Android jetzt verfügbar.', 'android', false, 'Startseite'),
    /trotz fehlender bestätigter Store-URL als verfügbar/,
  );
  assert.throws(
    () => assertPlatformAvailability('Android geplant, jetzt verfügbar.', 'android', false, 'Startseite'),
    /trotz fehlender bestätigter Store-URL als verfügbar/,
  );
  assert.throws(
    () => assertPlatformAvailability('iOS-Termin offen.', 'ios', true, 'Startseite'),
    /kennzeichnet ios nicht als verfügbar/,
  );
});
