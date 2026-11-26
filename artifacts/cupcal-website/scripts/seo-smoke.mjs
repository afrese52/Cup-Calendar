import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../server/serve.js';
import {
  confirmedStoreLinks,
  homePageDescription,
  seoTopicPages,
  SITE_ORIGIN,
} from '../src/content/seo-pages.ts';
import { deletionConfirmationPage, legalPages } from '../src/content/legal-pages.ts';
import { assertStoreLinksConfirmed } from './store-link-validation.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'dist/public');
const builtIndexPath = path.join(publicRoot, 'index.html');
const expectedSitemapUrls = [
  `${SITE_ORIGIN}/`,
  ...seoTopicPages.map((page) => `${SITE_ORIGIN}${page.path}`),
  ...legalPages.map((page) => `${SITE_ORIGIN}${page.path}`),
];
const confirmedStoreDownloadUrls = new Set(
  Object.values(confirmedStoreLinks)
    .filter((url) => url !== null)
    .map((url) => new URL(url).href),
);
const topicPagesByUrl = new Map(
  seoTopicPages.map((page) => [`${SITE_ORIGIN}${page.path}`, page]),
);
const legalPagesByUrl = new Map(
  legalPages.map((page) => [`${SITE_ORIGIN}${page.path}`, page]),
);

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function extractTitle(html) {
  return decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
}

function extractMetaDescription(html) {
  const tag = html.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i)?.[0];
  return tag ? decodeHtml(readAttribute(tag, 'content') ?? '') : '';
}

function extractCanonical(html) {
  const tag = html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0];
  return tag ? readAttribute(tag, 'href') : null;
}

function extractRobotsDirectives(html) {
  return [...html.matchAll(
    /<meta\b(?=[^>]*\bname=["'](?:robots|googlebot|googlebot-news)["'])[^>]*>/gi,
  )].map((match) => readAttribute(match[0], 'content') ?? '');
}

function extractStructuredData(html, pathname) {
  const scripts = [...html.matchAll(
    /<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi,
  )];
  assert.ok(scripts.length > 0, `${pathname} enthält keine JSON-LD-Daten.`);

  return scripts.flatMap((script) => {
    let document;
    try {
      document = JSON.parse(script[1]);
    } catch (error) {
      assert.fail(`${pathname} enthält ungültiges JSON-LD: ${error.message}`);
    }
    assert.equal(document['@context'], 'https://schema.org', `${pathname} muss Schema.org verwenden.`);
    return Array.isArray(document['@graph']) ? document['@graph'] : [document];
  });
}

function schemaNodesOfType(nodes, type) {
  return nodes.filter((node) =>
    Array.isArray(node['@type'])
      ? node['@type'].includes(type)
      : node['@type'] === type,
  );
}

function extractHeadings(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
    decodeHtml(match[1].replace(/<[^>]*>/g, '').trim()),
  );
}

function extractRenderedText(html) {
  return decodeHtml(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function extractAnchorHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => readAttribute(match[0], 'href'))
    .filter((href) => href !== null)
    .map(decodeHtml);
}

function extractAnchors(html) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].map((match) => ({
    testId: readAttribute(match[0], 'data-testid'),
    href: readAttribute(match[0], 'href') === null
      ? null
      : decodeHtml(readAttribute(match[0], 'href')),
  }));
}

function assertPublishedReleaseStatus(
  html,
  pageLabel,
  {
    checkSearchDescription = false,
    androidAvailable = false,
    iosAvailable = false,
  } = {},
) {
  const text = extractRenderedText(html);
  if (androidAvailable) {
    assert.match(
      text,
      /(?:Android-App ist jetzt im offiziellen Google Play Store|CupCal ist jetzt im Google Play Store) verfügbar/i,
      `${pageLabel} kennzeichnet den bestätigten Android-Download nicht als verfügbar.`,
    );
    assert.doesNotMatch(
      text,
      /Android-App ist noch nicht verfügbar/i,
      `${pageLabel} zeigt nach bestätigter Veröffentlichung weiterhin einen zukünftigen Android-Termin.`,
    );
  } else {
    assert.match(
      text,
      /(?:Android-App ist noch nicht im Google Play Store verfügbar|CupCal ist noch nicht im Google Play Store verfügbar)/i,
      `${pageLabel} behauptet nicht klar, dass CupCal noch nicht heruntergeladen werden kann.`,
    );
  }
  assert.match(
    text,
    iosAvailable
      ? /(?:iOS-App ist jetzt im offiziellen App Store verfügbar|CupCal ist jetzt im Apple App Store verfügbar)/i
      : /(?:iOS-App ist noch nicht im App Store verfügbar|CupCal ist noch nicht im Apple App Store verfügbar|Im Apple App Store ist CupCal noch nicht verfügbar)/i,
    `${pageLabel} kennzeichnet den iOS-Verfügbarkeitsstatus nicht korrekt.`,
  );
  if (checkSearchDescription) {
    const description = extractMetaDescription(html);
    assert.match(
      description,
      androidAvailable
        ? /Android bei Google Play verfügbar/i
        : /Android noch nicht verfügbar/i,
      `${pageLabel}: Die Suchbeschreibung kennzeichnet Android nicht korrekt.`,
    );
    assert.match(
      description,
      iosAvailable
        ? /iOS im App Store verfügbar/i
        : /iOS noch nicht verfügbar/i,
      `${pageLabel}: Die Suchbeschreibung kennzeichnet iOS nicht korrekt.`,
    );
  }
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    decodeHtml(match[1].trim()),
  );
}

function assertContentType(response, expectedType, label) {
  const actualType = response.headers.get('content-type') ?? '';
  assert.ok(
    actualType.toLowerCase().includes(expectedType),
    `${label} liefert Content-Type "${actualType}" statt "${expectedType}".`,
  );
}

async function startLocalServer() {
  const server = createStaticServer({ root: publicRoot, basePath: '/' });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function runSmokeTest() {
  await readFile(builtIndexPath).catch(() => {
    throw new Error('Kein Produktionsbuild gefunden. Führe zuerst „pnpm run build“ aus.');
  });

  const configuredBaseUrl =
    process.env.SEO_SMOKE_BASE_URL ??
    (process.argv.includes('--live') ? SITE_ORIGIN : undefined);
  const remoteUrl = configuredBaseUrl ? new URL(configuredBaseUrl) : null;
  if (remoteUrl) {
    assert.ok(
      remoteUrl.protocol === 'http:' || remoteUrl.protocol === 'https:',
      'SEO_SMOKE_BASE_URL muss eine HTTP- oder HTTPS-Adresse sein.',
    );
    assert.equal(remoteUrl.username, '', 'SEO_SMOKE_BASE_URL darf keine Zugangsdaten enthalten.');
    assert.equal(remoteUrl.password, '', 'SEO_SMOKE_BASE_URL darf keine Zugangsdaten enthalten.');
    assert.ok(
      remoteUrl.pathname === '/' && !remoteUrl.search && !remoteUrl.hash,
      'SEO_SMOKE_BASE_URL muss auf die Domainwurzel zeigen.',
    );
  }

  let server;
  let baseUrl = configuredBaseUrl?.replace(/\/+$/, '');
  try {
    if (!baseUrl) {
      const local = await startLocalServer();
      server = local.server;
      baseUrl = local.baseUrl;
    }

    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200, 'sitemap.xml muss mit HTTP 200 antworten.');
    assertContentType(sitemapResponse, 'xml', 'sitemap.xml');
    const sitemapXml = await sitemapResponse.text();
    assert.match(sitemapXml, /<urlset\b/i, 'sitemap.xml muss ein gültiges URL-Set enthalten.');

    const sitemapUrls = extractSitemapUrls(sitemapXml);
    assert.ok(sitemapUrls.length >= expectedSitemapUrls.length, 'Die Sitemap enthält zu wenige URLs.');
    assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'Die Sitemap enthält doppelte URLs.');
    for (const expectedUrl of expectedSitemapUrls) {
      assert.ok(sitemapUrls.includes(expectedUrl), `Die Sitemap enthält ${expectedUrl} nicht.`);
    }

    const sitemapOrigin = new URL(sitemapUrls[0]).origin;
    const homepageUrl = `${sitemapOrigin}/`;
    assert.ok(sitemapUrls.includes(homepageUrl), 'Die Sitemap muss die Domainwurzel enthalten.');
    for (const sitemapUrl of sitemapUrls) {
      const parsedUrl = new URL(sitemapUrl);
      assert.equal(parsedUrl.origin, sitemapOrigin, `Fremde Domain in der Sitemap: ${sitemapUrl}`);
      assert.equal(parsedUrl.search, '', `Suchparameter in Canonical-Sitemap-URL: ${sitemapUrl}`);
      assert.equal(parsedUrl.hash, '', `Fragment in Sitemap-URL: ${sitemapUrl}`);
    }
    if (remoteUrl) {
      assert.equal(remoteUrl.origin, sitemapOrigin, 'Die Live-Adresse stimmt nicht mit der Sitemap-Domain überein.');
    }

    const homepageResponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(homepageResponse.status, 200, 'Die Startseite muss direkt an der Domainwurzel HTTP 200 liefern.');
    assert.equal(
      new URL(homepageResponse.url).pathname,
      '/',
      'Die Startseite darf nicht auf einen zusätzlichen Pfad umleiten.',
    );
    assertContentType(homepageResponse, 'text/html', 'Die Startseite');
    const homepageHtml = await homepageResponse.text();
    assert.equal(extractCanonical(homepageHtml), homepageUrl, 'Die Canonical-URL der Startseite muss der Domainwurzel entsprechen.');
    assert.equal(
      extractMetaDescription(homepageHtml),
      homePageDescription,
      'Die Meta-Beschreibung der Startseite muss zum bestätigten Store-Status passen.',
    );
    assert.doesNotMatch(
      extractRobotsDirectives(homepageHtml).join(' '),
      /\b(?:noindex|none)\b/i,
      'Die Startseite darf nicht über Robots-Meta-Tags gesperrt sein.',
    );
    assert.doesNotMatch(
      homepageResponse.headers.get('x-robots-tag') ?? '',
      /\b(?:noindex|none)\b/i,
      'Die Startseite darf nicht über den X-Robots-Tag gesperrt sein.',
    );

    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200, 'robots.txt muss mit HTTP 200 antworten.');
    assertContentType(robotsResponse, 'text/plain', 'robots.txt');
    const robotsTxt = await robotsResponse.text();
    assert.match(robotsTxt, /^User-agent:\s*\*\s*$/im, 'robots.txt muss allgemeine Crawler-Regeln enthalten.');
    assert.match(robotsTxt, /^Allow:\s*\/\s*$/im, 'robots.txt muss das Crawlen erlauben.');
    const sitemapDirectives = robotsTxt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^Sitemap:/i.test(line))
      .map((line) => line.replace(/^Sitemap:\s*/i, ''));
    assert.deepEqual(
      sitemapDirectives,
      [`${sitemapOrigin}/sitemap.xml`],
      'robots.txt muss genau eine Sitemap auf derselben veröffentlichten Domain angeben.',
    );

    const observedTitles = new Set();
    const observedDescriptions = new Set();
    const observedCanonicals = new Set();
    const storeLinkTargets = [];
    let calendarAppAnchors = [];
    let homepageAnchors = [];
    let organizationLogoChecked = false;
    let homeReleaseStatusChecked = false;
    let calendarAppReleaseStatusChecked = false;

    for (const sitemapUrl of sitemapUrls) {
      const sitemapPageUrl = new URL(sitemapUrl);
      const response = await fetch(`${baseUrl}${sitemapPageUrl.pathname}`);
      assert.equal(response.status, 200, `${sitemapPageUrl.pathname} muss mit HTTP 200 antworten.`);
      assertContentType(response, 'text/html', sitemapPageUrl.pathname);
      const html = await response.text();
      const isHomePage = sitemapPageUrl.pathname === '/';
      const isCalendarAppPage = sitemapPageUrl.pathname === '/turnierkalender-app/';
      if (isHomePage || isCalendarAppPage) {
        assertPublishedReleaseStatus(
          html,
          isHomePage ? 'Die Startseite' : 'Die Kalender-App-Themenseite',
          {
            checkSearchDescription: true,
            androidAvailable: confirmedStoreLinks.android !== null,
            iosAvailable: confirmedStoreLinks.ios !== null,
          },
        );
        if (isHomePage) homeReleaseStatusChecked = true;
        if (isHomePage) homepageAnchors = extractAnchors(html);
        if (isCalendarAppPage) {
          calendarAppReleaseStatusChecked = true;
          calendarAppAnchors = extractAnchors(html);
        }
      }

      for (const href of extractAnchorHrefs(html)) {
        storeLinkTargets.push({ pagePath: sitemapPageUrl.pathname, href });
      }

      const title = extractTitle(html);
      assert.ok(title, `${sitemapPageUrl.pathname} hat keinen Seitentitel.`);
      assert.ok(!observedTitles.has(title), `Doppelter Seitentitel: ${title}`);
      observedTitles.add(title);

      const description = extractMetaDescription(html);
      assert.ok(description, `${sitemapPageUrl.pathname} hat keine Meta-Beschreibung.`);
      assert.ok(!observedDescriptions.has(description), `Doppelte Meta-Beschreibung: ${sitemapPageUrl.pathname}`);
      observedDescriptions.add(description);
      assert.doesNotMatch(
        extractRobotsDirectives(html).join(' '),
        /\b(?:noindex|none)\b/i,
        `${sitemapPageUrl.pathname} darf nicht über Robots-Meta-Tags gesperrt sein.`,
      );
      assert.doesNotMatch(
        response.headers.get('x-robots-tag') ?? '',
        /\b(?:noindex|none)\b/i,
        `${sitemapPageUrl.pathname} darf nicht über den X-Robots-Tag gesperrt sein.`,
      );

      const canonical = extractCanonical(html);
      assert.equal(canonical, sitemapUrl, `Falsche Canonical-URL auf ${sitemapPageUrl.pathname}.`);
      assert.ok(!observedCanonicals.has(canonical), `Doppelte Canonical-URL: ${canonical}`);
      observedCanonicals.add(canonical);

      const headings = extractHeadings(html);
      assert.equal(headings.length, 1, `${sitemapPageUrl.pathname} muss genau eine H1 enthalten.`);

      const schemaNodes = extractStructuredData(html, sitemapPageUrl.pathname);
      const schemaIds = schemaNodes
        .map((node) => node['@id'])
        .filter((id) => typeof id === 'string');
      assert.equal(new Set(schemaIds).size, schemaIds.length, `${sitemapPageUrl.pathname} enthält doppelte Schema-IDs.`);

      const topicPage = topicPagesByUrl.get(sitemapUrl);
      const legalPage = legalPagesByUrl.get(sitemapUrl);
      if (isHomePage || isCalendarAppPage) {
        const [application] = schemaNodesOfType(schemaNodes, 'SoftwareApplication');
        assert.ok(application, `${sitemapPageUrl.pathname} enthält keine SoftwareApplication-Angabe.`);
        assert.equal(
          application.description,
          isHomePage ? homePageDescription : topicPage?.description,
          `${sitemapPageUrl.pathname} hat eine vom Store-Status abweichende App-Beschreibung.`,
        );
        for (const [platform, name] of [
          ['android', 'CupCal für Android'],
          ['ios', 'CupCal für iOS'],
        ]) {
          const offer = application.offers?.find((candidate) => candidate.name === name);
          const confirmedUrl = confirmedStoreLinks[platform];
          assert.ok(offer, `${sitemapPageUrl.pathname} enthält kein strukturiertes ${platform}-Angebot.`);
          assert.equal(
            offer.availability,
            confirmedUrl ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            `${sitemapPageUrl.pathname} kennzeichnet ${platform} nicht gemäß der Store-Freigabe.`,
          );
          assert.equal(
            offer.url ?? null,
            confirmedUrl ? new URL(confirmedUrl).href : null,
            `${sitemapPageUrl.pathname} verlinkt ${platform} ohne bestätigte Store-URL oder lässt den bestätigten Link aus.`,
          );
        }
      }
      if (topicPage) {
        assert.equal(title, topicPage.title, `Seitentitel weicht von der SEO-Definition für ${sitemapPageUrl.pathname} ab.`);
        assert.equal(description, topicPage.description, `Meta-Beschreibung weicht für ${sitemapPageUrl.pathname} ab.`);
        assert.equal(headings[0], topicPage.h1, `H1 weicht von der SEO-Definition für ${sitemapPageUrl.pathname} ab.`);

        const [webPage] = schemaNodesOfType(schemaNodes, 'WebPage');
        const [breadcrumb] = schemaNodesOfType(schemaNodes, 'BreadcrumbList');
        assert.ok(webPage, `${sitemapPageUrl.pathname} enthält keine WebPage-Angabe.`);
        assert.equal(webPage.url, sitemapUrl, `${sitemapPageUrl.pathname} hat eine falsche WebPage-URL.`);
        assert.equal(webPage.name, title, `${sitemapPageUrl.pathname} hat einen abweichenden Schema-Titel.`);
        assert.equal(webPage.description, description, `${sitemapPageUrl.pathname} hat eine abweichende Schema-Beschreibung.`);
        assert.ok(breadcrumb, `${sitemapPageUrl.pathname} enthält keine Breadcrumb-Angabe.`);
        assert.deepEqual(
          breadcrumb.itemListElement?.map((item) => [item.position, item.name, item.item]),
          [
            [1, 'Startseite', `${sitemapOrigin}/`],
            [2, topicPage.eyebrow, sitemapUrl],
          ],
          `${sitemapPageUrl.pathname} hat eine ungültige Breadcrumb-Reihenfolge.`,
        );
      } else if (legalPage) {
        assert.equal(title, legalPage.title, `Seitentitel weicht für ${sitemapPageUrl.pathname} ab.`);
        assert.equal(headings[0], legalPage.h1, `H1 weicht für ${sitemapPageUrl.pathname} ab.`);
        const renderedText = extractRenderedText(html);
        if (legalPage.slug === 'datenschutz') {
          for (const requiredText of [
            'Andreas Frese',
            'Am Tonberg 4',
            'info@af-software.app',
            'Frankfurt, EU',
            '30 Tage',
            'sieben Tagen',
            'Google Fonts',
            'Deutschland',
            'Replit',
            'nicht bekannt',
            'nicht bestätigt',
          ]) {
            assert.ok(
              renderedText.includes(requiredText),
              `Die Datenschutzerklärung enthält die bestätigte Angabe nicht: ${requiredText}`,
            );
          }
        } else {
          assert.ok(
            html.includes('id="deletion-email"') && html.includes('id="deletion-password"'),
            'Die Kontolöschseite enthält kein Browserformular zur Anmeldung.',
          );
          assert.match(renderedText, /Löschbestätigungslink anfordern/);
          assert.match(renderedText, /Bestätigungslink aus der E-Mail öffnest/i);
          assert.match(renderedText, /30 Minuten/);
          assert.ok(renderedText.includes('info@af-software.app'));
        }
      } else if (sitemapUrl === `${sitemapOrigin}/`) {
        const [organization] = schemaNodesOfType(schemaNodes, 'Organization');
        const [website] = schemaNodesOfType(schemaNodes, 'WebSite');
        assert.ok(organization, 'Die Startseite enthält keine Organization-Angabe.');
        assert.ok(website, 'Die Startseite enthält keine WebSite-Angabe.');
        assert.equal(organization.name, 'CupCal', 'Der Markenname der Organization muss CupCal sein.');
        assert.equal(organization.url, `${sitemapOrigin}/`, 'Die Organization muss auf die CupCal-Startseite verweisen.');
        assert.equal(
          organization.description,
          'Unabhängiges Community-Projekt für einen Kalender mit Cups, Ligen, Qualifikationen und Trainingsrunden.',
          'Die Organization-Beschreibung muss den bestätigten Projektumfang wiedergeben.',
        );
        assert.equal(website.name, 'CupCal', 'Der Google-Seitenname muss mit dem sichtbaren Markennamen übereinstimmen.');
        assert.equal(website.url, `${sitemapOrigin}/`, 'Die WebSite muss auf die CupCal-Startseite verweisen.');
        assert.equal(
          website.description,
          homePageDescription,
          'Die strukturierte WebSite-Beschreibung muss zum bestätigten Store-Status passen.',
        );
        assert.equal(website.publisher?.['@id'], organization['@id'], 'Die WebSite muss CupCal als Herausgeber referenzieren.');
        assert.equal(
          organization.logo,
          `${sitemapOrigin}/cupcal-app-icon.png`,
          'Das Organization-Logo muss auf das App-Symbol verweisen.',
        );
        const logoResponse = await fetch(`${baseUrl}/cupcal-app-icon.png`);
        assert.equal(logoResponse.status, 200, 'Das strukturierte Organization-Logo muss erreichbar sein.');
        assertContentType(logoResponse, 'image/png', 'Das Organization-Logo');
        organizationLogoChecked = true;
      }

      console.log(`SEO geprüft: ${sitemapPageUrl.pathname} (HTTP 200)`);
    }

    const confirmationPath = deletionConfirmationPage.path;
    const confirmationResponse = await fetch(`${baseUrl}${confirmationPath}`);
    assert.equal(confirmationResponse.status, 200, 'Die Kontolösch-Bestätigungsroute muss öffentlich erreichbar sein.');
    assertContentType(confirmationResponse, 'text/html', confirmationPath);
    const confirmationHtml = await confirmationResponse.text();
    assert.equal(extractTitle(confirmationHtml), deletionConfirmationPage.title);
    assert.match(
      extractRobotsDirectives(confirmationHtml).join(' '),
      /\bnoindex\b/i,
      'Die tokenhaltige Bestätigungsseite muss von Suchmaschinen ausgeschlossen sein.',
    );
    assert.equal(
      extractHeadings(confirmationHtml)[0],
      deletionConfirmationPage.h1,
      'Die Bestätigungsroute muss ihre eigene H1 enthalten.',
    );
    assert.ok(
      !extractSitemapUrls(await (await fetch(`${baseUrl}/sitemap.xml`)).text())
        .includes(`${SITE_ORIGIN}${confirmationPath}`),
      'Die tokenhaltige Bestätigungsroute darf nicht in der Sitemap stehen.',
    );
    console.log(`Löschbestätigungsroute geprüft: ${confirmationPath} (HTTP 200, noindex).`);
    assert.ok(organizationLogoChecked, 'Die Organization- und WebSite-Daten der Startseite wurden nicht geprüft.');
    assert.ok(homeReleaseStatusChecked, 'Die Veröffentlichungsangaben der Startseite wurden nicht geprüft.');
    assert.ok(
      calendarAppReleaseStatusChecked,
      'Die Veröffentlichungsangaben der Kalender-App-Themenseite wurden nicht geprüft.',
    );
    for (const [platform, testIds] of [
      ['android', ['link-google-play', 'link-topic-google-play']],
      ['ios', ['link-app-store', 'link-topic-app-store']],
    ]) {
      const confirmedUrl = confirmedStoreLinks[platform]
        ? new URL(confirmedStoreLinks[platform]).href
        : null;
      const pages = [
        ['Startseite', homepageAnchors, testIds[0]],
        ['Kalender-App-Themenseite', calendarAppAnchors, testIds[1]],
      ];
      for (const [pageLabel, anchors, testId] of pages) {
        const button = anchors.find((anchor) => anchor.testId === testId);
        if (confirmedUrl) {
          assert.ok(
            button,
            `${pageLabel} zeigt keinen Button für den bestätigten ${platform}-Store.`,
          );
          assert.equal(
            new URL(button.href, baseUrl).href,
            confirmedUrl,
            `${pageLabel} führt der ${platform}-Button nicht exakt zum bestätigten Listing.`,
          );
          assert.equal(
            new URL(button.href, baseUrl).protocol,
            'https:',
            `${pageLabel} verlinkt den ${platform}-Store nicht per HTTPS.`,
          );
        } else {
          assert.equal(
            button,
            undefined,
            `${pageLabel} zeigt einen ${platform}-Store-Button ohne bestätigte Listing-URL.`,
          );
        }
      }
    }
    for (const storeUrl of confirmedStoreDownloadUrls) {
      assert.ok(
        homepageAnchors.some((anchor) => anchor.href === storeUrl)
          || calendarAppAnchors.some((anchor) => anchor.href === storeUrl),
        `Keine der geprüften Seiten verlinkt die bestätigte Store-Seite: ${storeUrl}`,
      );
    }
    assertStoreLinksConfirmed(storeLinkTargets, {
      baseUrl,
      confirmedStoreLinks: Object.values(confirmedStoreLinks),
    });

    const notFoundResponse = await fetch(`${baseUrl}/__cupcal-seo-smoke-test-not-found__/`);
    assert.equal(notFoundResponse.status, 404, 'Eine unbekannte HTML-Route muss mit echtem HTTP 404 antworten.');
    assertContentType(notFoundResponse, 'text/html', 'Die 404-Seite');
    assert.ok((await notFoundResponse.text()).length > 0, 'Die 404-Seite darf nicht leer sein.');

    console.log(`Sitemap, robots.txt und echte 404 geprüft; ${sitemapUrls.length} URLs insgesamt.`);
    console.log(
      configuredBaseUrl
        ? `Live-SEO-Rauchtest bestanden: ${configuredBaseUrl}`
        : 'Lokaler Produktions-SEO-Rauchtest bestanden.',
    );
  } finally {
    await closeServer(server);
  }
}

runSmokeTest().catch((error) => {
  console.error(`SEO-Rauchtest fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
