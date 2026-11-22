import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../server/serve.js';
import { seoTopicPages } from '../src/content/seo-pages.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'dist/public');
const mobileViewports = [
  { label: '320×844 Hochformat', width: 320, height: 844 },
  { label: '360×800 Hochformat', width: 360, height: 800 },
  { label: '390×844 Hochformat (bisher)', width: 390, height: 844 },
  { label: '640×360 Querformat', width: 640, height: 360 },
  { label: '844×390 Querformat', width: 844, height: 390 },
];
const defaultLimit = 0.1;
const defaultRuns = 3;

const instrumentLayoutShifts = `(() => {
  window.__cupcalLayoutShifts = [];
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__cupcalLayoutShifts.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          startTime: entry.startTime,
          sources: (entry.sources ?? []).slice(0, 4).map((source) => ({
            node: source.node ? {
              tag: source.node.tagName,
              id: source.node.id || '',
              className: typeof source.node.className === 'string' ? source.node.className : '',
            } : null,
            previousRect: source.previousRect ? {
              x: source.previousRect.x,
              y: source.previousRect.y,
              width: source.previousRect.width,
              height: source.previousRect.height,
            } : null,
            currentRect: source.currentRect ? {
              x: source.currentRect.x,
              y: source.currentRect.y,
              width: source.currentRect.width,
              height: source.currentRect.height,
            } : null,
          })),
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    window.__cupcalLayoutShiftApiUnavailable = true;
  }
})();`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readPositiveNumber(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  assert.ok(Number.isFinite(parsed) && parsed > 0, `${label} muss eine positive Zahl sein.`);
  return parsed;
}

function calculateCls(entries) {
  const eligibleEntries = entries
    .filter((entry) => !entry.hadRecentInput && Number.isFinite(entry.value))
    .sort((first, second) => first.startTime - second.startTime);

  let sessionValue = 0;
  let sessionStart = 0;
  let previousEntryTime = 0;
  let currentSession = [];
  let maxSession = [];

  for (const entry of eligibleEntries) {
    const startsNewSession =
      currentSession.length === 0 ||
      entry.startTime - previousEntryTime > 1000 ||
      entry.startTime - sessionStart > 5000;

    if (startsNewSession) {
      sessionValue = entry.value;
      sessionStart = entry.startTime;
      currentSession = [entry];
    } else {
      sessionValue += entry.value;
      currentSession.push(entry);
    }

    if (sessionValue > maxSession.reduce((sum, item) => sum + item.value, 0)) {
      maxSession = [...currentSession];
    }
    previousEntryTime = entry.startTime;
  }

  return {
    value: maxSession.reduce((sum, entry) => sum + entry.value, 0),
    entries: maxSession,
  };
}

function formatRect(rect) {
  if (!rect) return 'nicht verfügbar';
  return `x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, ${Math.round(rect.width)}×${Math.round(rect.height)}`;
}

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
    if (process.platform !== 'win32' && processHandle.pid) {
      process.kill(-processHandle.pid, 'SIGTERM');
    } else {
      processHandle.kill('SIGTERM');
    }
  } catch {
    processHandle.kill('SIGTERM');
  }

  const exited = await Promise.race([
    new Promise((resolve) => processHandle.once('exit', () => resolve(true))),
    delay(3000).then(() => false),
  ]);
  if (exited) return;

  try {
    if (process.platform !== 'win32' && processHandle.pid) {
      process.kill(-processHandle.pid, 'SIGKILL');
    } else {
      processHandle.kill('SIGKILL');
    }
  } catch {
    processHandle.kill('SIGKILL');
  }
  await Promise.race([
    new Promise((resolve) => processHandle.once('exit', resolve)),
    delay(2000),
  ]);
}

async function readTargetList(debugPort) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  assert.equal(response.status, 200, 'Chromium hat keine DevTools-Zielseite bereitgestellt.');
  return response.json();
}

async function waitForPageTarget(debugPort) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await readTargetList(debugPort);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Chromium needs a short moment to expose its DevTools endpoint.
    }
    await delay(100);
  }
  throw new Error('Chromium hat innerhalb von fünf Sekunden keine Browserseite bereitgestellt.');
}

async function startChromium() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cupcal-mobile-cls-'));
  const executable = process.env.CHROMIUM_BIN ?? 'chromium';
  const processHandle = spawn(executable, [
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
  const debugPort = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Chromium konnte nicht gestartet werden. ${stderr.trim()}`));
    }, 10000);

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

  try {
    const pageTarget = await waitForPageTarget(debugPort);
    return { processHandle, userDataDir, pageTarget };
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
    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
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

async function waitForFontsAndImages(send) {
  await send('Runtime.evaluate', {
    expression: `Promise.race([
      Promise.all([
        document.fonts.ready,
        ...Array.from(document.images, (image) => image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 8000);
            })),
      ]),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ])`,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function collectLayoutShifts(send) {
  const response = await send('Runtime.evaluate', {
    expression: `({
      entries: window.__cupcalLayoutShifts ?? [],
      observerUnavailable: Boolean(window.__cupcalLayoutShiftApiUnavailable),
    })`,
    returnByValue: true,
  });
  return response.result.value;
}

async function configureMobile(send, viewport) {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', {
    ...viewport,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 93_750,
    connectionType: 'cellular4g',
  });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentLayoutShifts });
}

async function run() {
  const html = await readFile(path.join(publicRoot, 'index.html'), 'utf8').catch(() => {
    throw new Error('Kein Produktionsbuild gefunden. Führe zuerst „pnpm run build“ aus.');
  });
  const assetReference = html.match(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/)?.[1];
  assert.ok(assetReference, 'Der Produktionsbuild enthält keinen CSS- oder JavaScript-Assetpfad.');
  const assetPath = new URL(assetReference, 'http://localhost/').pathname;
  const assetBasePath = assetPath.slice(0, assetPath.lastIndexOf('/assets/')) || '/';

  const limit = readPositiveNumber(process.env.CLS_MAX, defaultLimit, 'CLS_MAX');
  const runs = readPositiveNumber(process.env.CLS_RUNS, defaultRuns, 'CLS_RUNS');
  assert.ok(Number.isInteger(runs), 'CLS_RUNS muss eine ganze Zahl sein.');
  const server = createStaticServer({ root: publicRoot, basePath: assetBasePath });
  let browser;
  let devTools;

  try {
    const baseUrl = await listenOnEphemeralPort(server);
    browser = await startChromium();
    devTools = connectToDevTools(browser.pageTarget.webSocketDebuggerUrl);
    await devTools.ready;
    await configureMobile(devTools.send, mobileViewports[0]);

    const routes = ['/', ...seoTopicPages.map((page) => page.path)];
    const failures = [];

    for (const route of routes) {
      for (const viewport of mobileViewports) {
        const measurements = [];
        for (let runNumber = 1; runNumber <= runs; runNumber += 1) {
          const url = new URL(route, baseUrl).href;
          await devTools.send('Emulation.setDeviceMetricsOverride', {
            ...viewport,
            deviceScaleFactor: 3,
            mobile: true,
          });
          await devTools.send('Network.clearBrowserCache');
          await devTools.navigate(url);
          await waitForFontsAndImages(devTools.send);
          await delay(750);

          const result = await collectLayoutShifts(devTools.send);
          assert.equal(
            result.observerUnavailable,
            false,
            'Dieser Chromium-Build unterstützt keine Layout-Shift-Messung.',
          );
          const cls = calculateCls(result.entries);
          measurements.push(cls.value);
          console.log(
            `${route} · ${viewport.label} · Lauf ${runNumber}/${runs}: CLS ${cls.value.toFixed(3)} (Grenzwert ${limit.toFixed(3)}) · ${cls.entries.length} relevante Verschiebungen`,
          );

          if (cls.value > limit) {
            failures.push(`${route} bei ${viewport.label}, Lauf ${runNumber}: CLS ${cls.value.toFixed(3)}`);
          }
          if (cls.value > 0) {
            for (const entry of cls.entries) {
              for (const source of entry.sources ?? []) {
                if (!source.node) continue;
                const target = [source.node.tag, source.node.id, source.node.className]
                  .filter(Boolean)
                  .join('.');
                console.log(
                  `  Verschiebungsquelle: ${target || 'unbekanntes Element'} · ${formatRect(source.previousRect)} → ${formatRect(source.currentRect)}`,
                );
              }
            }
          }
        }
        const maximum = Math.max(...measurements);
        console.log(`${route} · ${viewport.label} · höchster CLS über ${runs} Läufe: ${maximum.toFixed(3)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`CLS-Grenzwert ${limit.toFixed(3)} überschritten:\n${failures.join('\n')}`);
    }
    console.log(
      `Mobiler CLS-Check bestanden: ${routes.length} Seiten, ${mobileViewports.length} Ansichten, ${runs} Läufe je Ansicht, Grenzwert ${limit.toFixed(3)}.`,
    );
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
  console.error(`Mobiler CLS-Check fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
