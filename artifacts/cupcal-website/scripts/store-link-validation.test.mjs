import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSoftwareApplicationSchema,
  createStoreSearchMetadata,
} from '../src/content/seo-pages.ts';
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

test('spiegelt alle Android- und iOS-Freigabekombinationen in Suchtexten und Angeboten', () => {
  const cases = [
    { android: null, ios: null },
    {
      android: 'https://play.google.com/store/apps/details?id=app.example.cupcal',
      ios: null,
    },
    {
      android: null,
      ios: 'https://apps.apple.com/app/cupcal/id1234567890',
    },
    {
      android: 'https://play.google.com/store/apps/details?id=app.example.cupcal',
      ios: 'https://apps.apple.com/app/cupcal/id1234567890',
    },
  ];

  for (const links of cases) {
    const { homePageDescription, calendarAppDescription } =
      createStoreSearchMetadata(links);
    const schema = createSoftwareApplicationSchema(
      links,
      calendarAppDescription,
      'https://cupcal.app',
    );

    assert.match(homePageDescription, /Android/);
    assert.match(homePageDescription, /iOS/);
    assert.match(calendarAppDescription, /Android/);
    assert.match(calendarAppDescription, /iOS/);
    assert.ok(
      homePageDescription.length >= 150 && homePageDescription.length <= 160,
      `Die Startseiten-Suchbeschreibung hat ${homePageDescription.length} Zeichen.`,
    );
    assert.ok(
      calendarAppDescription.length >= 145 && calendarAppDescription.length <= 165,
      `Die Kalender-App-Suchbeschreibung hat ${calendarAppDescription.length} Zeichen.`,
    );
    assert.deepEqual(
      schema.offers.map((offer) => [offer.name, offer.availability, offer.url ?? null]),
      [
        [
          'CupCal für Android',
          links.android ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          links.android,
        ],
        [
          'CupCal für iOS',
          links.ios ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          links.ios,
        ],
      ],
    );
    for (const [platform, available] of [
      ['Android', Boolean(links.android)],
      ['iOS', Boolean(links.ios)],
    ]) {
      const descriptionSaysAvailable = new RegExp(
        platform === 'Android'
          ? 'Android bei Google Play verfügbar'
          : 'iOS im App Store verfügbar',
      ).test(calendarAppDescription);
      assert.equal(
        descriptionSaysAvailable,
        available,
        `${platform}-Status in Suchbeschreibung und Store-Link weichen voneinander ab.`,
      );
      if (!available) {
        assert.match(
          calendarAppDescription,
          new RegExp(`${platform} noch nicht verfügbar`),
        );
      }
    }
  }
});
