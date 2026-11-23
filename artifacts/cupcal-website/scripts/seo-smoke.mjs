import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../server/serve.js';
import { seoTopicPages, SITE_ORIGIN } from '../src/content/seo-pages.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'dist/public');
const builtIndexPath = path.join(publicRoot, 'index.html');
const expectedSitemapUrls = [
  `${SITE_ORIGIN}/`,
  ...seoTopicPages.map((page) => `${SITE_ORIGIN}${page.path}`),
];
// Keep this empty until an official store listing has been verified.
const confirmedStoreDownloadUrls = new Set();
const storeDomains = ['play.google.com', 'apps.apple.com', 'itunes.apple.com'];
const topicPagesByUrl = new Map(
  seoTopicPages.map((page) => [`${SITE_ORIGIN}${page.path}`, page]),
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

function assertPublishedReleaseStatus(html, pageLabel, { checkSearchDescription = false } = {}) {
  const text = extractRenderedText(html);
  assert.ok(
    text.includes('30. November 2026'),
    `${pageLabel} nennt nicht den geplanten Android-Termin 30. November 2026.`,
  );
  assert.match(
    text,
    /Android[\s\S]{0,120}geplant/i,
    `${pageLabel} kennzeichnet den Android-Termin nicht als geplant.`,
  );
  assert.match(
    text,
    /noch nicht (?:in den Stores|im Google Play Store)/i,
    `${pageLabel} behauptet nicht klar, dass CupCal noch nicht heruntergeladen werden kann.`,
  );
  assert.match(
    text,
    /iOS[\s\S]{0,120}(?:kein Termin fest|Termin noch aus)/i,
    `${pageLabel} nennt den iOS-Veröffentlichungstermin nicht als offen.`,
  );
  if (checkSearchDescription) {
    const description = extractMetaDescription(html);
    assert.match(
      description,
      /Android-Start am 30\. November 2026 geplant/i,
      `${pageLabel}: Die Suchbeschreibung nennt nicht den geplanten Android-Termin.`,
    );
    assert.match(
      description,
      /iOS-Termin offen/i,
      `${pageLabel}: Die Suchbeschreibung kennzeichnet den iOS-Termin nicht als offen.`,
    );
    assert.match(
      description,
      /noch keine offiziellen Store-Downloads/i,
      `${pageLabel}: Die Suchbeschreibung behauptet nicht, dass offizielle Store-Downloads fehlen.`,
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
    const unconfirmedStoreTargets = [];
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
          { checkSearchDescription: isCalendarAppPage },
        );
        if (isHomePage) homeReleaseStatusChecked = true;
        if (isCalendarAppPage) calendarAppReleaseStatusChecked = true;
      }

      for (const href of extractAnchorHrefs(html)) {
        let targetUrl;
        try {
          targetUrl = new URL(href, baseUrl);
        } catch {
          continue;
        }
        const isStoreTarget = storeDomains.some((domain) =>
          targetUrl.hostname === domain || targetUrl.hostname.endsWith(`.${domain}`),
        );
        if (!isStoreTarget || confirmedStoreDownloadUrls.has(targetUrl.href)) continue;
        unconfirmedStoreTargets.push(`${sitemapPageUrl.pathname} → ${targetUrl.href}`);
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
    assert.ok(organizationLogoChecked, 'Die Organization- und WebSite-Daten der Startseite wurden nicht geprüft.');
    assert.ok(homeReleaseStatusChecked, 'Die Veröffentlichungsangaben der Startseite wurden nicht geprüft.');
    assert.ok(
      calendarAppReleaseStatusChecked,
      'Die Veröffentlichungsangaben der Kalender-App-Themenseite wurden nicht geprüft.',
    );
    assert.deepEqual(
      unconfirmedStoreTargets,
      [],
      `Nicht bestätigte Store-Adressen dürfen nicht als Download-Ziel verlinkt sein:\n${unconfirmedStoreTargets.join('\n')}`,
    );

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
