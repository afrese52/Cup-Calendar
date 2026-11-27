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
const viewports = [
  // Fixed DevTools CSS-pixel emulation avoids depending on the runner's window or browser zoom.
  {
    label: '400 % Browserzoom (320 CSS-Pixel, fest emuliert)',
    width: 320,
    height: 844,
    mobile: true,
  },
  { label: '360×800 Hochformat', width: 360, height: 800 },
  {
    label: '200 % Zoom (1280×900 → 640×450 CSS-Pixel)',
    width: 640,
    height: 450,
    mobile: true,
  },
  { label: '640×360 Querformat', width: 640, height: 360 },
  { label: '844×390 Querformat', width: 844, height: 390 },
  { label: '568×320 Handy-Querformat', width: 568, height: 320 },
  { label: '667×375 Handy-Querformat', width: 667, height: 375 },
];
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
  const requestUrls = new Map();
  const failedRequests = [];
  let commandId = 0;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Verbindung zu Chromium DevTools fehlgeschlagen.')), { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') {
      requestUrls.set(message.params.requestId, message.params.request.url);
    } else if (message.method === 'Network.loadingFailed') {
      failedRequests.push({
        url: requestUrls.get(message.params.requestId) ?? '',
        blockedReason: message.params.blockedReason ?? '',
      });
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

  return {
    socket,
    ready,
    send,
    navigate,
    getBlockedWebFontFailures: () => failedRequests.filter((request) =>
      request.blockedReason === 'inspector' &&
      /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(request.url)
    ),
  };
}

async function configureViewport(send, viewport) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile ?? true,
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

async function inspectPage(send, route) {
  if (route === '/') {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
  }
  const response = await send('Runtime.evaluate', {
    expression: `(() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const viewportWidth = document.documentElement.clientWidth;
      const header = document.querySelector('.topbar');
      const headerItems = Array.from(header?.children ?? []).filter(visible);
      const headerOverlaps = [];
      for (let index = 0; index < headerItems.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < headerItems.length; otherIndex += 1) {
          const first = headerItems[index].getBoundingClientRect();
          const second = headerItems[otherIndex].getBoundingClientRect();
          const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
          if (overlapWidth > 1 && overlapHeight > 1) {
            headerOverlaps.push({
              first: headerItems[index].className,
              second: headerItems[otherIndex].className,
            });
          }
        }
      }
      const zoomActions = Array.from(document.querySelectorAll(
        '.topbar a, .hero-actions a, .offline-inner a, .topic-card, .topic-footer-home, .topic-footer-links a',
      ))
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 50),
            insideViewport: rect.left >= -1 && rect.right <= viewportWidth + 1,
            contentFits: element.scrollWidth <= element.clientWidth + 1,
          };
        });
      const rectData = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const fitViewport = (element) => {
        const rect = rectData(element);
        return rect.left >= -1 && rect.right <= viewportWidth + 1 &&
          rect.top >= -1 && rect.bottom <= innerHeight + 1;
      };
      const nav = document.querySelector('nav[aria-label="CupCal-Themen"]');
      const breadcrumb = document.querySelector('nav[aria-label="Brotkrumennavigation"]');
      const currentPageLink = nav?.querySelector('a[aria-current="page"]');
      const breadcrumbCurrentPage = breadcrumb?.querySelector('[aria-current="page"]');
      const heading = document.querySelector('.topic-hero h1');
      const relatedHeading = document.querySelector('.topic-related h2');
      const cards = Array.from(document.querySelectorAll('.topic-related .topic-card'));
      const homepage = ${JSON.stringify(route)} === '/';
      const homepageHeading = homepage ? document.querySelector('#main-content h1') : null;
      const homepageLogo = homepage ? document.querySelector('.topbar .brand img') : null;
      const homepageNavigation = homepage ? document.querySelector('.home-topbar .nav-links') : null;
      const homepageActions = homepage
        ? ['.hero-actions .button-primary', '.hero-actions .button-muted', '.topbar .nav-cta']
            .map((selector) => document.querySelector(selector))
        : [];
      const homepageTopicCards = homepage
        ? Array.from(document.querySelectorAll('.topic-directory .topic-card'))
        : [];
      const homepageSkipLink = homepage ? document.querySelector('.skip-link') : null;
      const homepageSkipLinkFocused = homepageSkipLink ? {
        active: document.activeElement === homepageSkipLink,
        visible: visible(homepageSkipLink),
        insideViewport: fitViewport(homepageSkipLink),
      } : null;
      const homepageFocusTargets = homepage
        ? Array.from(document.querySelectorAll(
            '.home-topbar .nav-links a, .home-topbar .nav-cta, .hero-actions a, ' +
            '.offline-inner a, .topic-directory .topic-card, .footer .topic-footer-links a',
          ))
        : [];
      const homepageLandmarks = homepage
        ? ['.home-topbar', '#main-content', '.footer'].map((selector) => {
            const element = document.querySelector(selector);
            const rect = element?.getBoundingClientRect();
            return {
              selector,
              present: Boolean(element),
              insideViewport: Boolean(rect && rect.left >= -1 && rect.right <= viewportWidth + 1),
              contentFits: selector === '#main-content'
                ? null
                : Boolean(element && element.scrollWidth <= element.clientWidth + 1),
            };
          })
        : [];
      const homepageFocused = [];
      document.documentElement.style.scrollBehavior = 'auto';
      for (const target of homepageFocusTargets) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.focus();
        const rect = rectData(target);
        homepageFocused.push({
          label: target.getAttribute('aria-label') || target.textContent.trim().slice(0, 50),
          hasLink: Boolean(target.getAttribute('href')),
          active: document.activeElement === target,
          visible: visible(target),
          insideViewport: rect.left >= -1 && rect.right <= viewportWidth + 1 &&
            rect.top >= -1 && rect.bottom <= innerHeight + 1,
          contentFits: target.scrollWidth <= target.clientWidth + 1,
          topicCard: target.classList.contains('topic-card'),
        });
      }
      const action = document.querySelector('.nav-cta');
      const breadcrumbLink = breadcrumb?.querySelector('a[href]');
      const footerAction = document.querySelector('.topic-footer-home');
      document.documentElement.style.scrollBehavior = 'auto';
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
          if (element.closest('.ticker, .art-orbit')) return false;
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          text: element.textContent.trim().slice(0, 60),
          ...rectData(element),
        }));
      const clippedElements = [document.querySelector('.topic-shell'), ...mainElements]
        .filter((element) => {
          if (!element || element.closest('.ticker')) return false;
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
      const clippingText = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const text = textNode.textContent.trim();
        const parent = textNode.parentElement;
        if (!text || !parent || parent.closest('.ticker') || !visible(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rects = Array.from(range.getClientRects());
        for (const rect of rects) {
          let clipped = rect.left < -1 || rect.right > viewportWidth + 1;
          let ancestor = parent.parentElement;
          while (!clipped && ancestor) {
            const style = getComputedStyle(ancestor);
            const bounds = ancestor.getBoundingClientRect();
            if (['hidden', 'clip'].includes(style.overflowX) &&
              (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) clipped = true;
            if (['hidden', 'clip'].includes(style.overflowY) &&
              (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) clipped = true;
            ancestor = ancestor.parentElement;
          }
          if (clipped) clippingText.push({
            text: text.slice(0, 70),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
          });
        }
      }
      const offscreenControls = Array.from(document.querySelectorAll(
        'img, a, button, [role="button"], input, select, textarea',
      ))
        .filter(visible)
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 50),
          ...rectData(element),
        }))
        .filter((element) => element.left < -1 || element.right > viewportWidth + 1);
      const summary = {
        viewportWidth,
        viewportHeight: innerHeight,
        deviceScreenWidth: screen.width,
        documentWidth: document.documentElement.scrollWidth,
        headerOverlaps,
        zoomActions,
        homepage,
        homepageHeadingVisible: visible(homepageHeading),
        homepageLogoVisible: visible(homepageLogo),
        homepageNavigationVisible: visible(homepageNavigation),
        homepageNavigationLinks: Array.from(homepageNavigation?.querySelectorAll('a[href]') ?? []).filter(visible).length,
        homepageActionsVisible: homepageActions.map(visible),
        homepageTopicLinks: homepageTopicCards.filter(visible).length,
        homepageSkipLinkFocused,
        homepageTopicCards: homepageTopicCards.map((card) => ({
          visible: visible(card),
          hasLink: Boolean(card.getAttribute('href')),
          text: card.textContent.trim(),
          contentFits: card.scrollWidth <= card.clientWidth + 1,
        })),
        homepageLandmarks,
        homepageFocused,
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
        offscreenControls,
        clippingText,
        clippedElements,
        focused,
      };
      return summary;
    })()`,
    returnByValue: true,
  });
  if (!response.result?.value) {
    throw new Error(
      response.exceptionDetails?.exception?.description ??
        response.exceptionDetails?.text ??
        'Chromium konnte die Layoutmessung nicht auswerten.',
    );
  }
  return response.result.value;
}

async function inspectForcedColors(send) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value: 'active' }],
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });

  const response = await send('Runtime.evaluate', {
    expression: `(() => {
      const nav = document.querySelector('nav[aria-label="CupCal-Themen"]');
      const breadcrumb = document.querySelector('nav[aria-label="Brotkrumennavigation"]');
      const navLink = nav?.querySelector('a[href]');
      const currentNav = nav?.querySelector('a[aria-current="page"]');
      const breadcrumbLink = breadcrumb?.querySelector('a[href]');
      const currentBreadcrumb = breadcrumb?.querySelector('[aria-current="page"]');
      const styles = (element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          textDecorationLine: style.textDecorationLine,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
        };
      };
      navLink?.focus();
      const navFocusVisible = Boolean(navLink?.matches(':focus-visible'));
      const navFocus = navLink ? styles(navLink) : null;
      currentNav?.focus();
      const currentNavFocusVisible = Boolean(currentNav?.matches(':focus-visible'));
      const currentNavFocus = currentNav ? styles(currentNav) : null;
      breadcrumbLink?.focus();
      const breadcrumbFocusVisible = Boolean(breadcrumbLink?.matches(':focus-visible'));
      const breadcrumbFocus = breadcrumbLink ? styles(breadcrumbLink) : null;
      return {
        forcedColorsActive: matchMedia('(forced-colors: active)').matches,
        navVisible: Boolean(nav && nav.getBoundingClientRect().width > 0),
        navLink: navLink ? styles(navLink) : null,
        currentNav: currentNav ? styles(currentNav) : null,
        currentBreadcrumb: currentBreadcrumb ? styles(currentBreadcrumb) : null,
        navFocusVisible,
        navFocus,
        currentNavFocusVisible,
        currentNavFocus,
        breadcrumbFocusVisible,
        breadcrumbFocus,
      };
    })()`,
    returnByValue: true,
  });
  if (!response.result?.value) {
    throw new Error(
      response.exceptionDetails?.exception?.description ??
        response.exceptionDetails?.text ??
        'Chromium konnte den erzwungenen Farbmodus nicht auswerten.',
    );
  }
  return response.result.value;
}

function assertPageLayout(page, viewport, result) {
  const issues = [];
  if (result.viewportWidth !== viewport.width) issues.push(`Viewport ist ${result.viewportWidth}px statt ${viewport.width}px breit`);
  if (result.viewportHeight !== viewport.height) issues.push(`Viewport ist ${result.viewportHeight}px statt ${viewport.height}px hoch`);
  if (result.documentWidth > viewport.width + 1) issues.push(`Seitenbreite ${result.documentWidth}px verursacht horizontales Scrollen`);
  if (result.headerOverlaps.length > 0) issues.push('Elemente in der Kopfzeile überlappen sich');
  if (result.zoomActions.some((action) => !action.insideViewport || !action.contentFits)) {
    issues.push('Mindestens eine Aktion liegt außerhalb des sichtbaren Bereichs oder ihr Text wird abgeschnitten');
  }
  if (result.homepage) {
    if (!result.homepageHeadingVisible) issues.push('Überschrift der Startseite fehlt oder ist nicht sichtbar');
    if (!result.homepageLogoVisible) issues.push('Logo der Startseite fehlt oder ist nicht sichtbar');
    if (!result.homepageNavigationVisible || result.homepageNavigationLinks !== 4) {
      issues.push('Startseiten-Navigation ist nicht vollständig sichtbar');
    }
    if (result.homepageActionsVisible.length !== 3 || result.homepageActionsVisible.includes(false)) {
      issues.push('Mindestens eine Aktion der Startseite fehlt oder ist nicht sichtbar');
    }
    if (result.homepageLandmarks.length !== 3 || result.homepageLandmarks.some((landmark) =>
      !landmark.present || !landmark.insideViewport || landmark.contentFits === false
    )) {
      issues.push('Kopf-, Haupt- oder Fußbereich der Startseite ist nicht vollständig im Viewport');
    }
    if (result.homepageTopicLinks !== 3 || result.homepageTopicCards.some((card) =>
      !card.visible || !card.hasLink || !card.text || !card.contentFits
    )) {
      issues.push('Mindestens eine Themenkarte der Startseite fehlt, ist abgeschnitten oder nicht verlinkt');
    }
    if (!result.homepageSkipLinkFocused?.active || !result.homepageSkipLinkFocused.visible ||
      !result.homepageSkipLinkFocused.insideViewport
    ) {
      issues.push('Sprunglink ist beim Tastaturfokus nicht sichtbar');
    }
    if (result.homepageFocused.length !== 14 || result.homepageFocused.some((target) =>
      !target.hasLink || !target.active || !target.visible || !target.insideViewport ||
      !target.contentFits
    )) {
      issues.push('Mindestens ein Aktions- oder Themenlink der Startseite lässt sich nicht sichtbar fokussieren');
    }
  } else {
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
  }
  if (result.offscreenMainElements.length > 0) issues.push('Inhaltsbereiche ragen aus dem Bildschirm heraus');
  if (result.offscreenControls.length > 0) issues.push('Logo oder Bedienelemente ragen aus dem Bildschirm heraus');
  if (result.clippingText.length > 0) issues.push('Text wird am Bildschirmrand oder durch einen Container abgeschnitten');
  if (result.clippedElements.length > 0) issues.push('Inhalte werden durch einen Container abgeschnitten');
  if (!result.homepage && result.focused.some((target) =>
    !target.present || !target.hasLink || !target.active || !target.visible || !target.insideViewport
  )) {
    issues.push('Breadcrumb, Startseiten- oder Kartenlink ist nicht sichtbar fokussierbar');
  }
  assert.deepEqual(
    issues,
    [],
    `${page.path} bei ${viewport.label}: ${issues.join('; ')}\n${JSON.stringify(result, null, 2)}`,
  );
}

function assertForcedColors(page, result) {
  const issues = [];
  const isOpaque = (value) => value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)';
  const hasFocusOutline = (focusVisible, style) =>
    focusVisible
    && style?.outlineStyle === 'solid'
    && Number.parseFloat(style.outlineWidth) >= 3
    && isOpaque(style.outlineColor);

  if (!result.forcedColorsActive) issues.push('forced-colors: active wurde nicht aktiviert');
  if (!result.navVisible || !result.navLink) issues.push('Themennavigation ist nicht sichtbar');
  if (!result.navLink?.textDecorationLine.includes('underline')) {
    issues.push('Links der Themennavigation sind nicht zusätzlich unterstrichen');
  }
  if (
    !isOpaque(result.currentNav?.backgroundColor)
    || result.currentNav?.color === result.currentNav?.backgroundColor
    || !result.currentNav?.textDecorationLine.includes('underline')
  ) {
    issues.push('Aktueller Themenlink ist nicht deutlich vom übrigen Linktext unterscheidbar');
  }
  if (
    !isOpaque(result.currentBreadcrumb?.backgroundColor)
    || result.currentBreadcrumb?.color === result.currentBreadcrumb?.backgroundColor
  ) {
    issues.push('Aktuelle Seite in der Brotkrumennavigation ist nicht deutlich markiert');
  }
  if (!hasFocusOutline(result.navFocusVisible, result.navFocus)) {
    issues.push('Fokusrahmen der Themennavigation ist nicht sichtbar');
  }
  if (!hasFocusOutline(result.currentNavFocusVisible, result.currentNavFocus)) {
    issues.push('Fokusrahmen des aktuellen Themenlinks ist nicht sichtbar');
  }
  if (!hasFocusOutline(result.breadcrumbFocusVisible, result.breadcrumbFocus)) {
    issues.push('Fokusrahmen des Brotkrumenlinks ist nicht sichtbar');
  }

  assert.deepEqual(
    issues,
    [],
    `${page.path} im Windows-Kontrastmodus: ${issues.join('; ')}\n${JSON.stringify(result, null, 2)}`,
  );
}

async function run() {
  const blockWebFonts = process.argv.includes('--block-web-fonts');
  const html = await readFile(path.join(publicRoot, 'index.html'), 'utf8').catch(() => {
    throw new Error('Kein Produktionsbuild gefunden. Führe zuerst „pnpm run build“ aus.');
  });
  const assetReference = html.match(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/)?.[1];
  assert.ok(assetReference, 'Der Produktionsbuild enthält keinen CSS- oder JavaScript-Assetpfad.');
  const assetPath = new URL(assetReference, 'http://localhost/').pathname;
  const assetBasePath = assetPath.slice(0, assetPath.lastIndexOf('/assets/')) || '/';
  const server = createStaticServer({ root: publicRoot, basePath: assetBasePath });
  let browser;
  let devTools;

  try {
    const baseUrl = await listenOnEphemeralPort(server);
    browser = await startChromium();
    devTools = connectToDevTools(browser.pageTarget.webSocketDebuggerUrl);
    await devTools.ready;
    await devTools.send('Page.enable');
    await devTools.send('Runtime.enable');
    await devTools.send('Network.enable');
    if (blockWebFonts) {
      await devTools.send('Network.setBlockedURLs', {
        urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'],
      });
      console.log('Externe Webfonts blockiert (fonts.googleapis.com und fonts.gstatic.com).');
    }

    const pages = [{ path: '/', title: 'Startseite' }, ...seoTopicPages];
    for (const page of pages) {
      for (const viewport of viewports) {
        await configureViewport(devTools.send, viewport);
        await devTools.navigate(new URL(page.path, baseUrl).href);
        await waitForPage(devTools.send);
        const result = await inspectPage(devTools.send, page.path);
        assertPageLayout(page, viewport, result);
        console.log(
          `${page.path} · ${viewport.label}: Inhalte, Logos und Bedienelemente sichtbar; kein Seitenüberlauf.`,
        );
      }
      if (page.path !== '/') {
        await configureViewport(devTools.send, { width: 1280, height: 900, mobile: false });
        await devTools.navigate(new URL(page.path, baseUrl).href);
        await waitForPage(devTools.send);
        const forcedColorsResult = await inspectForcedColors(devTools.send);
        assertForcedColors(page, forcedColorsResult);
        await devTools.send('Emulation.setEmulatedMedia', { features: [] });
        console.log(`${page.path} · Windows-Kontrastmodus: Navigation, Breadcrumbs und Fokusrahmen sichtbar.`);
      }
    }
    if (blockWebFonts) {
      const blockedRequests = devTools.getBlockedWebFontFailures();
      assert.ok(
        blockedRequests.length > 0,
        'Keine externe Webfont-Anfrage wurde blockiert; der Fallback-Lauf hat die Sperre nicht bestätigt.',
      );
      console.log(`${blockedRequests.length} externe Webfont-Anfragen nachweislich blockiert.`);
    }
    console.log(
      `Layoutcheck bestanden: ${pages.length} Seiten bei ${viewports.map(({ label }) => label).join(', ')}.`,
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
  console.error(`Mobiler Layout-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
