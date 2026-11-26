import assert from 'node:assert/strict';
import test from 'node:test';

import { assertStoreLinksConfirmed } from './store-link-validation.mjs';

const baseUrl = 'https://cupcal.app/';

test('weist nicht bestätigte Google-Play- und App-Store-Ziele zurück', () => {
  const unconfirmedLinks = [
    {
      pagePath: '/',
      href: 'https://play.google.com/store/apps/details?id=app.example.cupcal',
    },
    {
      pagePath: '/turnierkalender-app/',
      href: 'https://apps.apple.com/app/id1234567890',
    },
  ];

  assert.throws(
    () =>
      assertStoreLinksConfirmed(unconfirmedLinks, {
        baseUrl,
        confirmedStoreLinks: [],
      }),
    /Nicht bestätigte Store-Adressen dürfen nicht als Download-Ziel verlinkt sein/,
  );
});

test('akzeptiert Store-Ziele nur, wenn sie ausdrücklich bestätigt wurden', () => {
  const confirmedUrl = 'https://play.google.com/store/apps/details?id=app.example.cupcal';

  assert.doesNotThrow(() =>
    assertStoreLinksConfirmed(
      [{ pagePath: '/', href: confirmedUrl }],
      {
        baseUrl,
        confirmedStoreLinks: [confirmedUrl],
      },
    ),
  );
});
