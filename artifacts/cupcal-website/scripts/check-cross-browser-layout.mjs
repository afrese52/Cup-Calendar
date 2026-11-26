import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { firefox, webkit } from 'playwright';

import { createStaticServer } from '../server/serve.js';
import { seoTopicPages } from '../src/content/seo-pages.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'dist/public');
const viewports = [
  { label: '320×844 Hochformat', width: 320, height: 844 },
  { label: '360×800 Hochformat', width: 360, height: 800 },
  { label: '568×320 Querformat', width: 568, height: 320 },
  { label: '640×360 Querformat', width: 640, height: 360 },
  { label: '667×375 Querformat', width: 667, height: 375 },
  { label: '844×390 Querformat', width: 844, height: 390 },
];

function listenOnEphemeralPort(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function browserLaunchOptions(name) {
  if (name === 'Firefox') {
    return {
      headless: true,
      timeout: 20_000,
      // Firefox's content sandbox cannot start in Replit's isolated test runner.
      env: {
        ...process.env,
        MOZ_DISABLE_CONTENT_SANDBOX: '1',
        MOZ_DISABLE_GMP_SANDBOX: '1',
      },
    };
  }

  return {
    headless: true,
    timeout: 20_000,
    ...(process.env.WEBKIT_EXECUTABLE_PATH
      ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
      : {}),
  };
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const textOf = (element) => (
      element.getAttribute('aria-label')
      || element.innerText
      || element.textContent
      || ''
    ).replace(/\s+/g, ' ').trim();
    const headings = Array.from(document.querySelectorAll('h1, h2'))
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: textOf(element),
          fits: element.scrollWidth <= element.clientWidth + 1
            && rect.left >= -1
            && rect.right <= innerWidth + 1,
        };
      });
    const clippedText = Array.from(document.querySelectorAll(
      '.hero-copy, .topic-intro, .topic-section p, .nav-links a, .nav-cta, ' +
      '.hero-actions a, .topic-card, .button-primary, .button-muted',
    ))
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => textOf(element).slice(0, 100));

    const navigation = Array.from(document.querySelectorAll(
      '.home-topbar .nav-links, nav[aria-label="CupCal-Themen"]',
    ))
      .filter(visible)
      .flatMap((nav) => Array.from(nav.querySelectorAll('a')).filter(visible).map((link) => {
        const rect = link.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        return {
          text: textOf(link),
          fits: rect.left >= navRect.left - 1
            && rect.right <= navRect.right + 1
            && rect.left >= -1
            && rect.right <= innerWidth + 1,
        };
      }));

    const header = document.querySelector('.topbar');
    const headerItems = Array.from(header?.children ?? []).filter(visible);
    const overlaps = [];
    for (let index = 0; index < headerItems.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < headerItems.length; otherIndex += 1) {
        const first = headerItems[index].getBoundingClientRect();
        const second = headerItems[otherIndex].getBoundingClientRect();
        const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          overlaps.push(`${textOf(headerItems[index]).slice(0, 60)} / ${textOf(headerItems[otherIndex]).slice(0, 60)}`);
        }
      }
    }

    const loadedFonts = [...new Set(Array.from(document.fonts)
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family.replaceAll('"', '')))];
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      headingFont: document.querySelector('h1')
        ? getComputedStyle(document.querySelector('h1')).fontFamily
        : '',
      bodyFont: getComputedStyle(document.body).fontFamily,
      loadedFonts,
      headings,
      clippedText,
      navigation,
      overlaps,
    };
  });
}

function assertLayout(browserName, route, viewport, result) {
  const issues = [];
  if (result.documentWidth > viewport.width + 1) {
    issues.push(`Seitenbreite ${result.documentWidth}px überschreitet den Viewport`);
  }
  if (result.headings.length === 0) {
    issues.push('Keine sichtbare Überschrift gefunden');
  }
  if (!result.loadedFonts.includes('Barlow Condensed')) {
    issues.push('Webschrift „Barlow Condensed“ wurde nicht geladen');
  }
  if (!result.loadedFonts.includes('DM Sans')) {
    issues.push('Webschrift „DM Sans“ wurde nicht geladen');
  }
  for (const heading of result.headings) {
    if (!heading.fits) issues.push(`Überschrift passt nicht: „${heading.text}“`);
  }
  for (const text of result.clippedText) {
    issues.push(`Text wird abgeschnitten: „${text}“`);
  }
  for (const item of result.navigation) {
    if (!item.fits) issues.push(`Navigation passt nicht: „${item.text}“`);
  }
  for (const overlap of result.overlaps) {
    issues.push(`Kopfbereich überlappt: ${overlap}`);
  }

  assert.deepEqual(
    issues,
    [],
    `${browserName} · ${route.path} · ${viewport.label}: ${issues.join('; ')}\n${JSON.stringify(result, null, 2)}`,
  );
}

async function runBrowser(browserName, browserType, baseUrl, basePath, pages) {
  let browser;
  try {
    browser = await browserType.launch(browserLaunchOptions(browserName));
  } catch (error) {
    throw new Error(
      `${browserName} konnte nicht gestartet werden; keine Seiten- oder Ansichtsprüfung ausgeführt. ${error.message}`,
    );
  }
  let passed = 0;
  try {
    for (const route of pages) {
      const routePath = `${basePath}${route.path}` || '/';
      const url = new URL(routePath, baseUrl).href;
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        try {
          const pageErrors = [];
          page.on('pageerror', (error) => pageErrors.push(error.message));
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          assert.equal(
            response?.status(),
            200,
            `${browserName} · ${route.path} · ${viewport.label}: Seite wurde nicht erfolgreich geladen`,
          );
          await page.evaluate(() => Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 5_000)),
          ]));
          const result = await inspectLayout(page);
          assertLayout(browserName, route, viewport, result);
          assert.deepEqual(
            pageErrors,
            [],
            `${browserName} · ${route.path} · ${viewport.label}: ${pageErrors.join('; ')}`,
          );
          passed += 1;
          console.log(
            `${browserName} · ${route.path} · ${viewport.label}: „${result.headings[0]?.text}“; ` +
            `${result.loadedFonts.join(' und ')} geladen.`,
          );
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return passed;
}

async function run() {
  const html = await readFile(path.join(publicRoot, 'index.html'), 'utf8').catch(() => {
    throw new Error('Kein Produktionsbuild gefunden. Führe zuerst „pnpm run build“ aus.');
  });
  const assetReference = html.match(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/)?.[1];
  assert.ok(assetReference, 'Der Produktionsbuild enthält keinen CSS- oder JavaScript-Assetpfad.');
  const assetPath = new URL(assetReference, 'http://localhost/').pathname;
  const basePath = assetPath.slice(0, assetPath.lastIndexOf('/assets/'));
  const server = createStaticServer({ root: publicRoot, basePath: basePath || '/' });
  const pages = [{ path: '/', title: 'Startseite' }, ...seoTopicPages];
  let totalPassed = 0;

  try {
    const baseUrl = await listenOnEphemeralPort(server);
    totalPassed += await runBrowser('Firefox', firefox, baseUrl, basePath, pages);
    totalPassed += await runBrowser('WebKit (Safari-Engine)', webkit, baseUrl, basePath, pages);
    console.log(
      `Cross-Browser-Layoutcheck bestanden: ${totalPassed} Kombinationen aus Browser, Seite und Viewport.`,
    );
  } finally {
    await closeServer(server);
  }
}

run().catch((error) => {
  console.error(`Cross-Browser-Layoutcheck fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
