import assert from 'node:assert/strict';
import test from 'node:test';
import { createPasswordResetRedirectUrl } from './authRedirectUrl.ts';

test('leitet Browser-Resets per HTTPS zurück zur geöffneten Replit-Vorschau', () => {
  assert.equal(
    createPasswordResetRedirectUrl({
      platform: 'web',
      webOrigin: 'https://cupcal-preview.example',
      nativeUrl: 'cupcal-android://auth/reset',
    }),
    'https://cupcal-preview.example/auth/reset?flow=cupcal-password-reset',
  );
});

test('behält für native Apps den registrierten Deep-Link bei', () => {
  assert.equal(
    createPasswordResetRedirectUrl({
      platform: 'native',
      webOrigin: null,
      nativeUrl: 'cupcal-android://auth/reset?flow=cupcal-password-reset',
    }),
    'cupcal-android://auth/reset?flow=cupcal-password-reset',
  );
});

test('meldet eine fehlende Browser-Adresse ausdrücklich', () => {
  assert.throws(
    () => createPasswordResetRedirectUrl({
      platform: 'web',
      webOrigin: null,
      nativeUrl: 'cupcal-android://auth/reset',
    }),
    /Browser-Adresse.*nicht verfügbar/i,
  );
});
