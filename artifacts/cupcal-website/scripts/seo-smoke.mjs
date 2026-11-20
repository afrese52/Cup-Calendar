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

function extractRobotsDirective(html) {
  const tag = html.match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0];
  return tag ? readAttribute(tag, 'content') ?? '' : '';
}

function extractHeadings(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
    decodeHtml(match[1].replace(/<[^>]*>/g, '').trim()),
  );
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
    for (const sitemapUrl of sitemapUrls) {
      const parsedUrl = new URL(sitemapUrl);
      assert.equal(parsedUrl.origin, sitemapOrigin, `Fremde Domain in der Sitemap: ${sitemapUrl}`);
      assert.equal(parsedUrl.search, '', `Suchparameter in Canonical-Sitemap-URL: ${sitemapUrl}`);
      assert.equal(parsedUrl.hash, '', `Fragment in Sitemap-URL: ${sitemapUrl}`);
    }
    if (remoteUrl) {
      assert.equal(remoteUrl.origin, sitemapOrigin, 'Die Live-Adresse stimmt nicht mit der Sitemap-Domain überein.');
    }

    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200, 'robots.txt muss mit HTTP 200 antworten.');
    assertContentType(robotsResponse, 'text/plain', 'robots.txt');
    const robotsTxt = await robotsResponse.text();
    assert.match(robotsTxt, /^User-agent:\s*\*\s*$/im, 'robots.txt muss allgemeine Crawler-Regeln enthalten.');
    assert.match(robotsTxt, /^Allow:\s*\/\s*$/im, 'robots.txt muss das Crawlen erlauben.');
    assert.ok(
      robotsTxt.split(/\r?\n/).some((line) => line.trim() === `Sitemap: ${sitemapOrigin}/sitemap.xml`),
      'robots.txt muss auf die veröffentlichte Sitemap verweisen.',
    );

    const observedTitles = new Set();
    const observedDescriptions = new Set();
    const observedCanonicals = new Set();

    for (const sitemapUrl of sitemapUrls) {
      const sitemapPageUrl = new URL(sitemapUrl);
      const response = await fetch(`${baseUrl}${sitemapPageUrl.pathname}`);
      assert.equal(response.status, 200, `${sitemapPageUrl.pathname} muss mit HTTP 200 antworten.`);
      assertContentType(response, 'text/html', sitemapPageUrl.pathname);
      const html = await response.text();

      const title = extractTitle(html);
      assert.ok(title, `${sitemapPageUrl.pathname} hat keinen Seitentitel.`);
      assert.ok(!observedTitles.has(title), `Doppelter Seitentitel: ${title}`);
      observedTitles.add(title);

      const description = extractMetaDescription(html);
      assert.ok(description, `${sitemapPageUrl.pathname} hat keine Meta-Beschreibung.`);
      assert.ok(!observedDescriptions.has(description), `Doppelte Meta-Beschreibung: ${sitemapPageUrl.pathname}`);
      observedDescriptions.add(description);
      assert.doesNotMatch(
        extractRobotsDirective(html),
        /\bnoindex\b/i,
        `${sitemapPageUrl.pathname} darf nicht auf noindex gesetzt sein.`,
      );

      const canonical = extractCanonical(html);
      assert.equal(canonical, sitemapUrl, `Falsche Canonical-URL auf ${sitemapPageUrl.pathname}.`);
      assert.ok(!observedCanonicals.has(canonical), `Doppelte Canonical-URL: ${canonical}`);
      observedCanonicals.add(canonical);

      const headings = extractHeadings(html);
      assert.equal(headings.length, 1, `${sitemapPageUrl.pathname} muss genau eine H1 enthalten.`);

      const topicPage = topicPagesByUrl.get(sitemapUrl);
      if (topicPage) {
        assert.equal(title, topicPage.title, `Seitentitel weicht von der SEO-Definition für ${sitemapPageUrl.pathname} ab.`);
        assert.equal(description, topicPage.description, `Meta-Beschreibung weicht für ${sitemapPageUrl.pathname} ab.`);
        assert.equal(headings[0], topicPage.h1, `H1 weicht von der SEO-Definition für ${sitemapPageUrl.pathname} ab.`);
      }

      console.log(`SEO geprüft: ${sitemapPageUrl.pathname} (HTTP 200)`);
    }

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
