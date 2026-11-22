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
const mobileViewport = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
const runs = Number(process.env.PERFORMANCE_RUNS ?? 3);
const pageMetrics = `(() => {
  window.__cupcalVitals = { lcp: 0, lcpTarget: '', cls: 0, longTasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cupcalVitals.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__cupcalVitals.lcp = entry.startTime;
        const target = entry.element;
        window.__cupcalVitals.lcpTarget = target
          ? target.tagName.toLowerCase() +
            (target.id ? '#' + target.id : '') +
            (typeof target.className === 'string' && target.className
              ? '.' + target.className.trim().replace(/\\s+/g, '.')
              : '')
          : entry.url || '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__cupcalVitals.longTasks.push(entry.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
})();`;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(Number.isInteger(runs) && runs > 0, 'PERFORMANCE_RUNS muss eine positive ganze Zahl sein.');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function stopBrowser(browser) {
  if (!browser || browser.exitCode !== null || browser.signalCode !== null) return;
  try {
    process.kill(-browser.pid, 'SIGTERM');
  } catch {
    browser.kill('SIGTERM');
  }
  await Promise.race([
    new Promise((resolve) => browser.once('exit', resolve)),
    delay(3000).then(() => {
      try {
        process.kill(-browser.pid, 'SIGKILL');
      } catch {
        browser.kill('SIGKILL');
      }
    }),
  ]);
}

async function startBrowser() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cupcal-mobile-performance-'));
  const browser = spawn(process.env.CHROMIUM_BIN ?? '/repl/tools/bin/chromium', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });

  let stderr = '';
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Chromium-Start abgelaufen: ${stderr.trim()}`)), 10000);
      browser.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      browser.once('exit', (code) => {
        if (code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Chromium wurde mit Code ${code} beendet: ${stderr.trim()}`));
        }
      });
      browser.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (!match) return;
        clearTimeout(timeout);
        resolve(Number(match[1]));
      });
    });

    let page;
    for (let attempt = 0; attempt < 50 && !page; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
      if (response?.ok) {
        page = (await response.json()).find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      }
      if (!page) await delay(100);
    }
    assert.ok(page, 'Chromium hat keine DevTools-Seite bereitgestellt.');
    return { browser, userDataDir, page };
  } catch (error) {
    await stopBrowser(browser);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    throw error;
  }
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const loadWaiters = new Set();
  const networkResources = new Map();
  let commandId = 0;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Verbindung zu Chromium fehlgeschlagen.')), { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') {
      networkResources.set(message.params.requestId, {
        url: message.params.request.url,
        startedAt: message.params.timestamp,
        type: message.params.type ?? '',
        mimeType: '',
        encodedBytes: 0,
        endedAt: 0,
      });
    } else if (message.method === 'Network.responseReceived') {
      const resource = networkResources.get(message.params.requestId);
      if (resource) {
        resource.status = message.params.response.status;
        resource.mimeType = message.params.response.mimeType;
      }
    } else if (message.method === 'Network.loadingFinished') {
      const resource = networkResources.get(message.params.requestId);
      if (resource) {
        resource.encodedBytes = message.params.encodedDataLength ?? 0;
        resource.endedAt = message.params.timestamp;
      }
    } else if (message.method === 'Network.loadingFailed') {
      const resource = networkResources.get(message.params.requestId);
      if (resource) resource.failed = message.params.errorText;
    }
    if (message.method === 'Page.loadEventFired') {
      for (const resolve of loadWaiters) resolve();
      loadWaiters.clear();
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });

  function send(method, params = {}) {
    const id = ++commandId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chromium-Aufruf abgelaufen: ${method}`));
      }, 20000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function navigate(url) {
    let resolveLoad;
    const loaded = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        loadWaiters.delete(resolveLoad);
        reject(new Error(`Seite nicht rechtzeitig geladen: ${url}`));
      }, 45000);
      resolveLoad = () => {
        clearTimeout(timeout);
        resolve();
      };
      loadWaiters.add(resolveLoad);
    });
    await send('Page.navigate', { url });
    await loaded;
  }
  function clearNetworkResources() {
    networkResources.clear();
  }
  function getNetworkResources() {
    return [...networkResources.values()].filter((resource) => resource.type !== 'Other');
  }
  return { socket, ready, send, navigate, clearNetworkResources, getNetworkResources };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Browserauswertung fehlgeschlagen.');
  }
  return result.result.value;
}

function summarize(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

async function run() {
  await readFile(path.join(publicRoot, 'index.html')).catch(() => {
    throw new Error('Kein Produktionsbuild gefunden. Führe zuerst „pnpm run build“ aus.');
  });

  const server = createStaticServer({ root: publicRoot, basePath: '/' });
  let browserState;
  let devTools;
  try {
    const baseUrl = await listen(server);
    browserState = await startBrowser();
    devTools = connect(browserState.page.webSocketDebuggerUrl);
    await devTools.ready;
    await devTools.send('Page.enable');
    await devTools.send('Runtime.enable');
    await devTools.send('Network.enable');
    await devTools.send('Network.setCacheDisabled', { cacheDisabled: true });
    await devTools.send('Emulation.setDeviceMetricsOverride', mobileViewport);
    await devTools.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await devTools.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
      connectionType: 'cellular4g',
    });
    await devTools.send('Page.addScriptToEvaluateOnNewDocument', { source: pageMetrics });

    const routes = ['/', ...seoTopicPages.map((page) => page.path)];
    for (const route of routes) {
      const results = [];
      for (let runNumber = 1; runNumber <= runs; runNumber += 1) {
        devTools.clearNetworkResources();
        await devTools.send('Network.clearBrowserCache');
        await devTools.navigate(new URL(route, baseUrl).href);
        await evaluate(devTools.send, `Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 8000))])`);
        await delay(300);
        const sample = await evaluate(devTools.send, `(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          const largest = resources
            .map((item) => ({
              url: new URL(item.name).pathname.split('/').pop() || new URL(item.name).hostname,
              type: item.initiatorType,
              bytes: item.transferSize || item.encodedBodySize || 0,
              duration: item.duration,
            }))
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10);
          return {
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
            lcp: window.__cupcalVitals?.lcp ?? 0,
            lcpTarget: window.__cupcalVitals?.lcpTarget ?? '',
            cls: window.__cupcalVitals?.cls ?? 0,
            dcl: nav?.domContentLoadedEventEnd ?? 0,
            load: nav?.loadEventEnd ?? 0,
            largest,
            longTasks: window.__cupcalVitals?.longTasks ?? [],
          };
        })()`);
        results.push(sample);
        sample.networkResources = devTools.getNetworkResources();
        console.log(`${route} · Lauf ${runNumber}/${runs}: FCP ${formatMs(sample.fcp)}, LCP ${formatMs(sample.lcp)}, Laden ${formatMs(sample.load)}, CLS ${sample.cls.toFixed(3)}`);
      }

      const metric = (key) => summarize(results.map((result) => result[key]));
      const longTasks = results.map((result) => result.longTasks.reduce((sum, duration) => sum + duration, 0));
      const topResources = results[0].largest;
      const networkSummary = new Map();
      for (const resource of results[0].networkResources) {
        const kind = resource.mimeType.startsWith('font/') ? 'Schriftdatei'
          : resource.mimeType === 'text/css' ? 'CSS'
          : resource.mimeType.includes('javascript') ? 'Skript'
          : resource.mimeType.startsWith('image/') ? 'Bild'
          : resource.mimeType;
        const current = networkSummary.get(kind) ?? { count: 0, bytes: 0, longestMs: 0, assets: [] };
        const duration = resource.endedAt && resource.startedAt
          ? (resource.endedAt - resource.startedAt) * 1000
          : 0;
        current.count += 1;
        current.bytes += resource.encodedBytes;
        current.longestMs = Math.max(current.longestMs, duration);
        current.assets.push(`${new URL(resource.url).pathname.split('/').pop() || new URL(resource.url).hostname} ${Math.round(duration)} ms/${Math.round(resource.encodedBytes / 1024)} KiB`);
        networkSummary.set(kind, current);
      }
      const totalTransferBytes = [...networkSummary.values()].reduce((sum, item) => sum + item.bytes, 0);
      console.log(
        `${route} · Median: FCP ${formatMs(metric('fcp'))}, LCP ${formatMs(metric('lcp'))}, DCL ${formatMs(metric('dcl'))}, Laden ${formatMs(metric('load'))}, CLS ${metric('cls').toFixed(3)}.`,
      );
      console.log(
        `  Übertragene Ressourcen ~${Math.round(totalTransferBytes / 1024)} KiB; lange Aufgaben median ${formatMs(summarize(longTasks))}.`,
      );
      console.log(`  LCP-Element: ${results[0].lcpTarget || 'nicht erkannt'}`);
      console.log(`  Langsamste Ressourcen: ${topResources.map((item) => `${item.url} (${Math.round(item.duration)} ms${item.bytes ? `, ${Math.round(item.bytes / 1024)} KiB` : ''})`).join(', ') || 'keine Daten'}`);
      for (const [kind, values] of networkSummary) {
        console.log(`  ${kind}: ${values.count}×, ${Math.round(values.bytes / 1024)} KiB, längste ${Math.round(values.longestMs)} ms · ${values.assets.join(', ')}`);
      }
    }
    console.log(`Mobiler Labortest abgeschlossen: ${routes.length} Seiten, ${runs} kalte Läufe je Seite, 390×844, 4× CPU, 4G mit 150 ms Latenz.`);
  } finally {
    devTools?.socket.close();
    if (browserState) {
      await stopBrowser(browserState.browser);
      await rm(browserState.userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run().catch((error) => {
  console.error(`Mobiler Leistungstest fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
