import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let dom;
let root;
let vite;
let App;
let trackedEvents;
let autoIntersect = true;
let activeObserver;
class TestIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    activeObserver = this;
  }

  observe(target) {
    if (autoIntersect) this.trigger(target);
  }

  trigger(target) {
    this.callback([{ isIntersecting: true, intersectionRatio: 1, target }]);
  }

  unobserve() {}

  disconnect() {}
}
const availabilityCtas = [
  { testId: 'button-download-status', placement: 'header' },
  { testId: 'button-availability', placement: 'hero' },
  { testId: 'link-offline-info', placement: 'offline_band' },
];

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://cupcal.test/',
  });

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IntersectionObserver: { configurable: true, value: TestIntersectionObserver },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  trackedEvents = [];
  dom.window.umami = {
    track: (...args) => trackedEvents.push(args),
  };

  vite = await createServer({
    configFile: false,
    appType: 'custom',
    root: websiteRoot,
    plugins: [react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    logLevel: 'error',
  });
  ({ default: App } = await vite.ssrLoadModule('/src/App.tsx'));

  root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => {
    root.render(createElement(App, { pathname: '/' }));
  });
});

async function renderApp(pathname, clearEvents = true) {
  if (clearEvents) trackedEvents.length = 0;
  await act(async () => {
    root.render(createElement(App, { pathname }));
  });
}

async function click(testId) {
  const element = dom.window.document.querySelector(`[data-testid="${testId}"]`);
  assert.ok(element, `Element mit data-testid="${testId}" muss vorhanden sein`);
  await act(async () => element.click());
}

async function viewAvailabilitySection() {
  const section = dom.window.document.querySelector('[data-analytics-section="availability"]');
  assert.ok(section, 'Der Verfügbarkeitsbereich muss vorhanden sein');
  await act(async () => activeObserver.trigger(section));
}

afterEach(() => {
  autoIntersect = true;
});

after(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  await vite?.close();
  dom?.window.close();
});

for (const { testId, placement } of availabilityCtas) {
  test(`Status-CTA in ${placement} meldet das richtige Analytics-Ereignis`, async () => {
    trackedEvents.length = 0;
    dom.window.sessionStorage.clear();
    const cta = dom.window.document.querySelector(`[data-testid="${testId}"]`);

    assert.ok(cta, `CTA mit data-testid="${testId}" muss auf der Startseite vorhanden sein`);
    await act(async () => cta.click());

    assert.deepEqual(trackedEvents, [
      ['availability_cta_click', { placement }],
    ]);
  });
}

test('Bereichsansichten vor dem Klick bleiben ohne CTA-Zuordnung', async () => {
  autoIntersect = false;
  dom.window.sessionStorage.clear();
  await renderApp('/vor-dem-klick/');

  await viewAvailabilitySection();
  await click('button-download-status');
  await renderApp('/nach-dem-klick/', false);
  await viewAvailabilitySection();

  assert.deepEqual(
    trackedEvents.filter(([name]) => name === 'content_section_view'),
    [
      ['content_section_view', { section: 'availability', page: '/vor-dem-klick/' }],
      ['content_section_view', { section: 'availability', page: '/nach-dem-klick/', cta_placement: 'header' }],
    ],
  );

  autoIntersect = true;
});

test('Bei mehreren Statusklicks wird die zuletzt angeklickte Platzierung zugeordnet', async () => {
  autoIntersect = false;
  dom.window.sessionStorage.clear();
  await renderApp('/mehrere-klicks/');

  await click('button-availability');
  await click('link-offline-info');
  await viewAvailabilitySection();

  assert.deepEqual(
    trackedEvents.filter(([name]) => name === 'content_section_view'),
    [
      ['content_section_view', { section: 'availability', page: '/mehrere-klicks/', cta_placement: 'offline_band' }],
    ],
  );

  autoIntersect = true;
});

test('Inhaltsereignisse aller CupCal-Themenseiten enthalten Seite und Bereich', async () => {
  const { seoTopicPages } = await vite.ssrLoadModule('/src/content/seo-pages.ts');
  assert.ok(seoTopicPages.length > 0, 'Mindestens eine CupCal-Themenseite muss geprüft werden');

  for (const page of seoTopicPages) {
    await renderApp(page.path);

    const contentEvents = trackedEvents.filter(([name]) => name === 'content_section_view');
    assert.deepEqual(
      contentEvents,
      [
        ['content_section_view', { section: 'topic_article', page: page.path }],
        ['content_section_view', { section: 'related_topics', page: page.path }],
      ],
      `Jeder Inhaltsbereich auf ${page.path} muss mit page und section gesendet werden`,
    );
  }
});
