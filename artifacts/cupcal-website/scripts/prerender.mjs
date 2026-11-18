import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtHtmlPath = path.join(projectRoot, 'dist/public/index.html');
const rootMarker = '<div id="root"></div>';

const vite = await createServer({
  configFile: path.join(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  cacheDir: path.join(projectRoot, 'node_modules/.vite/seo-prerender'),
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const [{ default: App }, { ErrorBoundary }] = await Promise.all([
    vite.ssrLoadModule('/src/App.tsx'),
    vite.ssrLoadModule('/src/components/error-boundary.tsx'),
  ]);
  const renderedApp = renderToString(
    React.createElement(ErrorBoundary, null, React.createElement(App)),
  );

  if (!renderedApp.includes('<h1')) {
    throw new Error('Vorab-Rendering erzeugte keine H1-Überschrift.');
  }
  if ((renderedApp.match(/<h1\b/g) || []).length !== 1) {
    throw new Error('Die gerenderte Startseite muss genau eine H1-Überschrift enthalten.');
  }

  const builtHtml = await fs.readFile(builtHtmlPath, 'utf8');
  if (!builtHtml.includes(rootMarker)) {
    throw new Error('Der Root-Platzhalter für das Vorab-Rendering fehlt im Build.');
  }

  await fs.writeFile(
    builtHtmlPath,
    builtHtml.replace(rootMarker, `<div id="root">${renderedApp}</div>`),
  );
  console.log(`Startseite vorab gerendert: ${renderedApp.length} Zeichen.`);
} finally {
  await vite.close();
}
