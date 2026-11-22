import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../server/serve.js';
import { seoTopicPages } from '../src/content/seo-pages.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'dist/public');
const viewportWidths = [320, 360];
const viewportHeight = 800;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function listenOnEphemeralPort(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function stopChromium(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  try {
    if (process.platform !== 'win32' && processHandle.pid) process.kill(-processHandle.pid, 'SIGTERM');
    else processHandle.kill('SIGTERM');
  } catch {
    processHandle.kill('SIGTERM');
  }
  const exited = await Promise.race([
    new Promise((resolve) => processHandle.once('exit', () => resolve(true))),
    delay(3000).then(() => false),
  ]);
  if (exited) return;
  try {
    if (process.platform !== 'win32' && processHandle.pid) process.kill(-processHandle.pid, 'SIGKILL');
    else processHandle.kill('SIGKILL');
  } catch {
    processHandle.kill('SIGKILL');
  }
  await Promise.race([
    new Promise((resolve) => processHandle.once('exit', resolve)),
    delay(2000),
  ]);
}

async function findChromium() {
  if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
  try {
    await access('/repl/tools/bin/chromium');
    return '/repl/tools/bin/chromium';
  } catch {
    return 'chromium';
  }
}

async function waitForPageTarget(debugPort) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      // Chromium starts its DevTools endpoint shortly after the browser process.
    }
    await delay(100);
  }
  throw new Error('Chromium hat innerhalb von fünf Sekunden keine Browserseite bereitgestellt.');
}

async function startChromium() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cupcal-mobile-layout-'));
  const processHandle = spawn(await findChromium(), [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: process.platform !== 'win32',
  });

  let stderr = '';
  try {
    const debugPort = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(
        new Error(`Chromium konnte nicht gestartet werden. ${stderr.trim()}`),
      ), 10000);
      processHandle.once('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Chromium ist nicht verfügbar: ${error.message}`));
      });
      processHandle.once('exit', (code) => {
        if (code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Chromium wurde vor dem Start beendet (Code ${code}). ${stderr.trim()}`));
        }
      });
      processHandle.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (!match) return;
        clearTimeout(timeout);
        resolve(Number(match[1]));
      });
    });
    return { processHandle, userDataDir, pageTarget: await waitForPageTarget(debugPort) };
  } catch (error) {
    await stopChromium(processHandle);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    throw error;
  }
}

function connectToDevTools(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const loadWaiters = new Set();
  let commandId = 0;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Verbindung zu Chromium DevTools fehlgeschlagen.')), { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.loadEventFired') {
      for (const resolve of loadWaiters) resolve();
      loadWaiters.clear();
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  function send(method, params = {}) {
    const id = ++commandId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chromium-DevTools-Aufruf lief ab: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function navigate(url) {
    let resolveLoad;
    const loaded = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        loadWaiters.delete(resolveLoad);
        reject(new Error(`Die Seite wurde nicht rechtzeitig geladen: ${url}`));
      }, 30000);
      resolveLoad = () => {
        clearTimeout(timeout);
        resolve();
      };
      loadWaiters.add(resolveLoad);
    });
    await send('Page.navigate', { url });
    await loaded;
  }

  return { socket, ready, send, navigate };
}

async function configureViewport(send, width) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

async function waitForPage(send) {
  await send('Runtime.evaluate', {
    expression: `Promise.race([
      Promise.all([document.fonts.ready, ...Array.from(document.images, (image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 5000);
          }))]),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])`,
    awaitPromise: true,
    returnByValue: true,
  });
  await delay(150);
}

async function inspectPage(send) {
  const response = await send('Runtime.evaluate', {
    expression: `(() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const rectData = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const fitViewport = (element) => {
        const rect = rectData(element);
        return rect.left >= -1 && rect.right <= innerWidth + 1 &&
          rect.top >= -1 && rect.bottom <= innerHeight + 1;
      };
      const nav = document.querySelector('nav[aria-label="CupCal-Themen"]');
      const breadcrumb = document.querySelector('nav[aria-label="Brotkrumennavigation"]');
      const currentPageLink = nav?.querySelector('a[aria-current="page"]');
      const breadcrumbCurrentPage = breadcrumb?.querySelector('[aria-current="page"]');
      const heading = document.querySelector('.topic-hero h1');
      const relatedHeading = document.querySelector('.topic-related h2');
      const cards = Array.from(document.querySelectorAll('.topic-related .topic-card'));
      const action = document.querySelector('.nav-cta');
      const breadcrumbLink = breadcrumb?.querySelector('a[href]');
      const footerAction = document.querySelector('.topic-footer-home');
      const initialNavRect = nav?.getBoundingClientRect();
      const navigationLinksInitiallyVisible = Array.from(nav?.querySelectorAll('a[href]') ?? [])
        .map((link) => {
          const rect = link.getBoundingClientRect();
          return visible(link) && initialNavRect &&
            rect.left >= initialNavRect.left - 1 && rect.right <= initialNavRect.right + 1 &&
            rect.top >= initialNavRect.top - 1 && rect.bottom <= initialNavRect.bottom + 1;
        });
      const navFocus = [];
      for (const link of Array.from(nav?.querySelectorAll('a[href]') ?? [])) {
        link.focus();
        const rect = rectData(link);
        const navRect = nav.getBoundingClientRect();
        navFocus.push({
          label: link.textContent.trim(),
          active: document.activeElement === link,
          visible: visible(link),
          insideNavigation: rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1,
        });
      }
      const focusTargets = [
        ['Brotkrumenlink', breadcrumbLink],
        ['Startseiten-Aktion', action],
        ...cards.map((card, index) => ['Themenkarte ' + (index + 1), card]),
        ['Fußzeilen-Aktion', footerAction],
      ];
      const focused = [];
      for (const [label, target] of focusTargets) {
        if (!target) {
          focused.push({ label, present: false });
          continue;
        }
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.focus();
        focused.push({
          label,
          present: true,
          hasLink: target.tagName !== 'A' || Boolean(target.getAttribute('href')),
          active: document.activeElement === target,
          visible: visible(target),
          insideViewport: fitViewport(target),
        });
      }
      heading?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const headingInsideViewport = Boolean(heading && fitViewport(heading));
      relatedHeading?.scrollIntoView({ block: 'center', inline: 'nearest' });
      const relatedHeadingInsideViewport = Boolean(relatedHeading && fitViewport(relatedHeading));
      const mainElements = Array.from(document.querySelectorAll('main *')).filter(visible);
      const offscreenMainElements = mainElements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        })
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          text: element.textContent.trim().slice(0, 60),
          ...rectData(element),
        }));
      const clippedElements = [document.querySelector('.topic-shell'), ...mainElements]
        .filter((element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const clipsHorizontally = ['hidden', 'clip'].includes(style.overflowX) &&
            element.scrollWidth > element.clientWidth + 1;
          const clipsVertically = ['hidden', 'clip'].includes(style.overflowY) &&
            element.scrollHeight > element.clientHeight + 1;
          return clipsHorizontally || clipsVertically;
        })
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        }));
      const summary = {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        navigationVisible: visible(nav),
        navigationLinksInitiallyVisible,
        navigationLinks: navFocus,
        navigationCurrentPage: currentPageLink?.textContent.trim() ?? '',
        breadcrumbVisible: visible(breadcrumb),
        breadcrumbCurrentPage: breadcrumbCurrentPage?.textContent.trim() ?? '',
        headingText: heading?.textContent.trim() ?? '',
        headingVisible: visible(heading),
        headingInsideViewport,
        relatedHeadingVisible: visible(relatedHeading),
        relatedHeadingInsideViewport,
        cardCount: cards.length,
        cards: cards.map((card) => ({
          visible: visible(card),
          hasLink: Boolean(card.getAttribute('href')),
          text: card.textContent.trim(),
          contentFits: card.scrollWidth <= card.clientWidth + 1,
        })),
        offscreenMainElements,
        clippedElements,
        focused,
      };
      return summary;
    })()`,
    returnByValue: true,
  });
  return response.result.value;
}

function assertPageLayout(page, width, result) {
  const issues = [];
  if (result.viewportWidth !== width) issues.push(`Viewport ist ${result.viewportWidth}px statt ${width}px breit`);
  if (result.documentWidth > width + 1) issues.push(`Seitenbreite ${result.documentWidth}px verursacht horizontales Scrollen`);
  if (!result.navigationVisible || result.navigationLinks.length !== 3) issues.push('Themen-Navigation ist nicht vollständig sichtbar');
  if (result.navigationLinksInitiallyVisible.length !== 3 || result.navigationLinksInitiallyVisible.includes(false)) {
    issues.push('Mindestens ein Themenlink ist im Ausgangszustand abgeschnitten');
  }
  if (result.navigationLinks.some((link) => !link.visible || !link.active || !link.insideNavigation)) {
    issues.push('Mindestens ein Themenlink lässt sich nicht sichtbar fokussieren');
  }
  if (!result.navigationCurrentPage) issues.push('Aktuelle Seite ist in der Navigation nicht markiert');
  if (!result.breadcrumbVisible || !result.breadcrumbCurrentPage) issues.push('Breadcrumb oder aktuelle Seite fehlt');
  if (result.navigationCurrentPage !== result.breadcrumbCurrentPage) {
    issues.push('Navigation und Breadcrumb markieren unterschiedliche Seiten');
  }
  if (!result.headingVisible || !result.headingText || !result.headingInsideViewport) {
    issues.push('Hauptüberschrift ist nicht sichtbar oder passt nicht in den Bildschirm');
  }
  if (!result.relatedHeadingVisible || !result.relatedHeadingInsideViewport || result.cardCount !== 2) {
    issues.push('Themenkarten oder deren Überschrift fehlen oder sind abgeschnitten');
  }
  if (result.cards.some((card) => !card.visible || !card.hasLink || !card.text || !card.contentFits)) {
    issues.push('Mindestens eine Themenkarte ist unsichtbar oder nicht verlinkt');
  }
  if (result.offscreenMainElements.length > 0) issues.push('Inhaltsbereiche ragen aus dem Bildschirm heraus');
  if (result.clippedElements.length > 0) issues.push('Inhalte werden durch einen Container abgeschnitten');
  if (result.focused.some((target) =>
    !target.present || !target.hasLink || !target.active || !target.visible || !target.insideViewport
  )) {
    issues.push('Breadcrumb, Startseiten- oder Kartenlink ist nicht sichtbar fokussierbar');
  }
  assert.deepEqual(issues, [], `${page.path} bei ${width}px: ${issues.join('; ')}\n${JSON.stringify(result, null, 2)}`);
}

async function run() {
  await readFile(path.join(publicRoot, 'index.html')).catch(() => {
    throw new Error('Kein Produktionsbuild gefunden. Führe zuerst „pnpm run build“ aus.');
  });
  const server = createStaticServer({ root: publicRoot, basePath: '/' });
  let browser;
  let devTools;

  try {
    const baseUrl = await listenOnEphemeralPort(server);
    browser = await startChromium();
    devTools = connectToDevTools(browser.pageTarget.webSocketDebuggerUrl);
    await devTools.ready;
    await devTools.send('Page.enable');
    await devTools.send('Runtime.enable');

    for (const page of seoTopicPages) {
      for (const width of viewportWidths) {
        await configureViewport(devTools.send, width);
        await devTools.navigate(new URL(page.path, baseUrl).href);
        await waitForPage(devTools.send);
        const result = await inspectPage(devTools.send);
        assertPageLayout(page, width, result);
        console.log(`${page.path} · ${width}px: Navigation, Breadcrumb, Überschriften, Karten und Links sichtbar; kein Seitenüberlauf.`);
      }
    }
    console.log(`Mobiler Layout-Test bestanden: ${seoTopicPages.length} Themenseiten bei ${viewportWidths.join('px und ')}px.`);
  } finally {
    devTools?.socket.close();
    if (browser) {
      await stopChromium(browser.processHandle);
      await rm(browser.userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
    await closeServer(server);
  }
}

run().catch((error) => {
  console.error(`Mobiler Layout-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
