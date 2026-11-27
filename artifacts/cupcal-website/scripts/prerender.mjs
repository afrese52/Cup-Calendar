import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtHtmlPath = path.join(projectRoot, 'dist/public/index.html');
const sourceSitemapPath = path.join(projectRoot, 'public/sitemap.xml');
const rootMarker = '<div id="root"></div>';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceRequired(html, pattern, replacement, description) {
  if (!pattern.test(html)) {
    throw new Error(`HTML-Vorlage enthält kein ${description}.`);
  }
  return html.replace(pattern, replacement);
}

function withHomeMetadata(html, description, applicationSchema) {
  let updatedHtml = html;
  for (const [pattern, replacement, label] of [
    [
      /<meta name="description"[^>]*\/?>/i,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      'Meta-Beschreibung',
    ],
    [
      /<meta property="og:description"[^>]*\/?>/i,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      'Open-Graph-Beschreibung',
    ],
    [
      /<meta name="twitter:description"[^>]*\/?>/i,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      'Twitter-Beschreibung',
    ],
  ]) {
    updatedHtml = replaceRequired(updatedHtml, pattern, replacement, label);
  }

  const structuredDataPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i;
  const structuredDataMatch = updatedHtml.match(structuredDataPattern);
  if (!structuredDataMatch) {
    throw new Error('HTML-Vorlage enthält keine Schema.org-Daten.');
  }
  const structuredData = JSON.parse(structuredDataMatch[1]);
  const websiteNode = structuredData['@graph']?.find((node) => node['@type'] === 'WebSite');
  if (!websiteNode) {
    throw new Error('Schema.org-Daten enthalten keinen WebSite-Eintrag.');
  }
  websiteNode.description = description;
  const existingApplicationIndex = structuredData['@graph'].findIndex(
    (node) => node['@type'] === 'SoftwareApplication' && node['@id'] === applicationSchema['@id'],
  );
  if (existingApplicationIndex >= 0) {
    structuredData['@graph'][existingApplicationIndex] = applicationSchema;
  } else {
    structuredData['@graph'].push(applicationSchema);
  }
  const structuredDataTag = `<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>`;
  return updatedHtml.replace(structuredDataPattern, structuredDataTag);
}

function withTopicMetadata(html, page, siteOrigin, applicationSchema) {
  const canonical = `${siteOrigin}${page.path}`;
  const metadata = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`, 'title'],
    [
      /<meta name="description"[^>]*\/?>/i,
      `<meta name="description" content="${escapeHtml(page.description)}" />`,
      'Meta-Beschreibung',
    ],
    [
      /<link rel="canonical"[^>]*\/?>/i,
      `<link rel="canonical" href="${canonical}" />`,
      'Canonical-URL',
    ],
    [
      /<meta property="og:title"[^>]*\/?>/i,
      `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
      'Open-Graph-Titel',
    ],
    [
      /<meta property="og:description"[^>]*\/?>/i,
      `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
      'Open-Graph-Beschreibung',
    ],
    [
      /<meta property="og:url"[^>]*\/?>/i,
      `<meta property="og:url" content="${canonical}" />`,
      'Open-Graph-URL',
    ],
    [
      /<meta name="twitter:title"[^>]*\/?>/i,
      `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
      'Twitter-Titel',
    ],
    [
      /<meta name="twitter:description"[^>]*\/?>/i,
      `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
      'Twitter-Beschreibung',
    ],
  ];

  let updatedHtml = html;
  for (const [pattern, replacement, description] of metadata) {
    updatedHtml = replaceRequired(updatedHtml, pattern, replacement, description);
  }

  const pageStructuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: page.title,
        description: page.description,
        inLanguage: 'de-DE',
        isPartOf: { '@id': `${siteOrigin}/#website` },
        breadcrumb: { '@id': `${canonical}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Startseite', item: `${siteOrigin}/` },
          { '@type': 'ListItem', position: 2, name: page.eyebrow, item: canonical },
        ],
      },
      ...(page.slug === 'turnierkalender-app' ? [applicationSchema] : []),
    ],
  };
  const structuredDataTag = `<script type="application/ld+json">${JSON.stringify(pageStructuredData).replaceAll('<', '\\u003c')}</script>`;
  return replaceRequired(updatedHtml, /<\/head>/i, `${structuredDataTag}</head>`, 'Head-Ende');
}

const vite = await createServer({
  configFile: path.join(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  cacheDir: path.join(projectRoot, 'node_modules/.vite/seo-prerender'),
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const [
    { default: App },
    { ErrorBoundary },
    {
      confirmedStoreLinks,
      createSoftwareApplicationSchema,
      homePageDescription,
      SEO_DESCRIPTION_MAX_LENGTH,
      SEO_DESCRIPTION_MIN_LENGTH,
      seoTopicPages,
      SITE_ORIGIN,
    },
    { deletionConfirmationPage, legalPages },
    { withLegalMetadata },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/App.tsx'),
    vite.ssrLoadModule('/src/components/error-boundary.tsx'),
    vite.ssrLoadModule('/src/content/seo-pages.ts'),
    vite.ssrLoadModule('/src/content/legal-pages.ts'),
    vite.ssrLoadModule('/src/pages/legal-pages.tsx'),
  ]);
  const sitemap = await fs.readFile(sourceSitemapPath, 'utf8');
  const sourceCss = await fs.readFile(path.join(projectRoot, 'src/index.css'), 'utf8');
  if (!sourceCss.includes(':focus-visible') || !sourceCss.includes('.skip-link:focus-visible')) {
    throw new Error('Der Tastaturfokus oder der sichtbare Sprunglink hat keinen Fokusstil.');
  }
  const pageUrls = [
    `${SITE_ORIGIN}/`,
    ...seoTopicPages.map((page) => `${SITE_ORIGIN}${page.path}`),
    ...legalPages.map((page) => `${SITE_ORIGIN}${page.path}`),
  ];
  if (new Set(pageUrls).size !== pageUrls.length) {
    throw new Error('Die Website enthält doppelte Canonical-URLs.');
  }
  for (const pageUrl of pageUrls) {
    if (!sitemap.includes(`<loc>${pageUrl}</loc>`)) {
      throw new Error(`Die Sitemap enthält keine URL für ${pageUrl}.`);
    }
  }

  const shellHtml = await fs.readFile(builtHtmlPath, 'utf8');
  if (!shellHtml.includes(rootMarker)) {
    throw new Error('Der Root-Platzhalter für das Vorab-Rendering fehlt im Build.');
  }

  function renderPage(pathname, expectedHeading, page, isLegalPage = false) {
    const renderedApp = renderToString(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(App, { pathname }),
      ),
    );
    if (!renderedApp.includes('<h1')) {
      throw new Error(`Vorab-Rendering für ${pathname} erzeugte keine H1-Überschrift.`);
    }
    if ((renderedApp.match(/<h1\b/g) || []).length !== 1) {
      throw new Error(`Die Seite ${pathname} muss genau eine H1-Überschrift enthalten.`);
    }
    if (!renderedApp.includes(expectedHeading)) {
      throw new Error(`Die Seite ${pathname} enthält nicht ihre erwartete H1-Überschrift.`);
    }
    if (
      !renderedApp.includes('href="#main-content"')
      || !renderedApp.includes('<main id="main-content" tabindex="-1">')
    ) {
      throw new Error(`Die Seite ${pathname} enthält keinen Tastatur-Sprunglink zum Inhalt.`);
    }
    if ((renderedApp.match(/<main\b/g) || []).length !== 1) {
      throw new Error(`Die Seite ${pathname} muss genau einen Hauptbereich besitzen.`);
    }
    const expectedNavigationLabel = isLegalPage
      ? 'aria-label="Rechtliche Informationen"'
      : page
        ? 'aria-label="CupCal-Themen"'
        : 'aria-label="Hauptnavigation"';
    if (!renderedApp.includes(expectedNavigationLabel)) {
      throw new Error(`Die Navigation für ${pathname} hat keinen verständlichen Namen.`);
    }
    if (page && (
      !renderedApp.includes('aria-label="Brotkrumennavigation"')
      || !renderedApp.includes('aria-current="page"')
    )) {
      throw new Error(`Die Themenseite ${pathname} enthält keine erkennbare Brotkrumennavigation.`);
    }

    let pageHtml = page
      ? withTopicMetadata(
          shellHtml,
          page,
          SITE_ORIGIN,
          createSoftwareApplicationSchema(confirmedStoreLinks, page.description, SITE_ORIGIN),
        )
      : shellHtml;
    pageHtml = pageHtml.replace(rootMarker, `<div id="root">${renderedApp}</div>`);
    return { html: pageHtml, renderedLength: renderedApp.length };
  }

  const home = renderPage('/', 'Dein ', null);
  await fs.writeFile(
    builtHtmlPath,
    withHomeMetadata(
      home.html,
      homePageDescription,
      createSoftwareApplicationSchema(confirmedStoreLinks, homePageDescription, SITE_ORIGIN),
    ),
  );
  console.log(`Startseite vorab gerendert: ${home.renderedLength} Zeichen.`);

  for (const page of seoTopicPages) {
    if (page.title.length < 45 || page.title.length > 65) {
      throw new Error(`Der Seitentitel für ${page.path} ist zu kurz oder zu lang.`);
    }
    if (!page.description) {
      throw new Error(`Die Meta-Beschreibung für ${page.path} fehlt.`);
    }
    if (
      page.description.length < SEO_DESCRIPTION_MIN_LENGTH
      || page.description.length > SEO_DESCRIPTION_MAX_LENGTH
    ) {
      throw new Error(
        `Die Meta-Beschreibung für ${page.path} hat ${page.description.length} Zeichen; erlaubt sind ${SEO_DESCRIPTION_MIN_LENGTH} bis ${SEO_DESCRIPTION_MAX_LENGTH} Zeichen.`,
      );
    }
    const { html, renderedLength } = renderPage(page.path, page.h1, page);
    const outputPath = path.join(
      projectRoot,
      'dist/public',
      page.slug,
      'index.html',
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html);
    console.log(`Themenseite vorab gerendert: ${page.path} (${renderedLength} Zeichen).`);
  }

  for (const page of legalPages) {
    const { html: renderedHtml, renderedLength } = renderPage(page.path, page.h1, null, true);
    const html = withLegalMetadata(renderedHtml, page);
    const outputPath = path.join(
      projectRoot,
      'dist/public',
      page.slug,
      'index.html',
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html);
    console.log(`Rechtliche Seite vorab gerendert: ${page.path} (${renderedLength} Zeichen).`);
  }

  const confirmation = renderPage(
    deletionConfirmationPage.path,
    deletionConfirmationPage.h1,
    null,
    true,
  );
  const confirmationHtml = withLegalMetadata(confirmation.html, deletionConfirmationPage);
  const confirmationOutputPath = path.join(
    projectRoot,
    'dist/public',
    'konto-loeschen',
    'bestaetigen',
    'index.html',
  );
  await fs.mkdir(path.dirname(confirmationOutputPath), { recursive: true });
  await fs.writeFile(confirmationOutputPath, confirmationHtml);
  console.log(`Bestätigungsseite vorab gerendert: ${deletionConfirmationPage.path} (${confirmation.renderedLength} Zeichen).`);
} finally {
  await vite.close();
}
