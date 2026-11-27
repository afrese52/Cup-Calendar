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

test('Startseite verlinkt alle Themenseiten und erfasst Ziel sowie Platzierung', async () => {
  const { seoTopicPages } = await vite.ssrLoadModule('/src/content/seo-pages.ts');
  await renderApp('/');

  for (const page of seoTopicPages) {
    const directoryLink = dom.window.document.querySelector(`[data-testid="link-topic-${page.slug}"]`);
    assert.ok(directoryLink, `Themenseite ${page.slug} muss im Themenbereich der Startseite verlinkt sein`);
    assert.equal(directoryLink.getAttribute('href'), page.path);
    assert.equal(directoryLink.tagName, 'A', `Themenseite ${page.slug} muss ein echter Link sein`);
    assert.equal(directoryLink.tabIndex, 0, `Themenseite ${page.slug} muss per Tastatur erreichbar sein`);
    assert.ok(directoryLink.textContent.trim(), `Themenseite ${page.slug} braucht sichtbaren Linktext`);
    assert.ok(directoryLink.getAttribute('aria-label')?.trim(), `Themenseite ${page.slug} braucht einen zugänglichen Namen`);

    trackedEvents.length = 0;
    directoryLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await act(async () => directoryLink.click());
    assert.deepEqual(trackedEvents, [
      ['site_navigation_click', { destination: page.slug, placement: 'home_topic_directory' }],
    ]);

    const footerLink = dom.window.document.querySelector(`[data-testid="link-footer-${page.slug}"]`);
    assert.ok(footerLink, `Themenseite ${page.slug} muss auch im Footer verlinkt sein`);
    assert.equal(footerLink.getAttribute('href'), page.path);
    assert.equal(footerLink.tagName, 'A', `Footerlink ${page.slug} muss ein echter Link sein`);
    assert.equal(footerLink.tabIndex, 0, `Footerlink ${page.slug} muss per Tastatur erreichbar sein`);
    assert.ok(footerLink.textContent.trim(), `Footerlink ${page.slug} braucht sichtbaren Linktext`);

    trackedEvents.length = 0;
    footerLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await act(async () => footerLink.click());
    assert.deepEqual(trackedEvents, [
      ['site_navigation_click', { destination: page.slug, placement: 'footer' }],
    ]);
  }
  dom.window.sessionStorage.clear();
});

test('Themenseitenbesuche ordnen den tatsächlichen Einstieg der Startseite zu', async () => {
  const { seoTopicPages } = await vite.ssrLoadModule('/src/content/seo-pages.ts');

  for (const page of seoTopicPages) {
    for (const placement of ['home_topic_directory', 'footer']) {
      dom.window.sessionStorage.clear();
      trackedEvents.length = 0;
      await renderApp('/');

      const homepageLink = placement === 'footer'
        ? `[data-testid="link-footer-${page.slug}"]`
        : `[data-testid="link-topic-${page.slug}"]`;
      const link = dom.window.document.querySelector(homepageLink);
      assert.ok(link, `Einstieg ${placement} für ${page.slug} muss vorhanden sein`);
      link.addEventListener('click', (event) => event.preventDefault(), { once: true });
      await act(async () => link.click());
      await renderApp(page.path, false);

      assert.deepEqual(
        trackedEvents.filter(([name]) => name === 'topic_page_entry'),
        [['topic_page_entry', { destination: page.slug, placement }]],
        `Der Besuch auf ${page.path} muss dem Einstieg ${placement} zugeordnet werden`,
      );
      assert.equal(dom.window.sessionStorage.length, 0, 'Die verbrauchte Zuordnung darf nicht erneut zählen');
    }
  }
});

test('Direkte und nicht passende Themenseitenbesuche erhalten keine Einstiegszuordnung', async () => {
  const { seoTopicPages } = await vite.ssrLoadModule('/src/content/seo-pages.ts');
  assert.ok(seoTopicPages.length > 1, 'Mindestens zwei Themenseiten müssen vorhanden sein');

  dom.window.sessionStorage.clear();
  trackedEvents.length = 0;
  await renderApp(seoTopicPages[0].path);
  assert.equal(trackedEvents.some(([name]) => name === 'topic_page_entry'), false);

  dom.window.sessionStorage.setItem(
    'cupcal:topic-entry-attribution',
    JSON.stringify({
      destination: seoTopicPages[0].slug,
      placement: 'footer',
      clickedAt: Date.now(),
    }),
  );
  trackedEvents.length = 0;
  await renderApp(seoTopicPages[1].path);
  assert.equal(trackedEvents.some(([name]) => name === 'topic_page_entry'), false);
  assert.equal(dom.window.sessionStorage.length, 0, 'Eine nicht passende alte Zuordnung muss verworfen werden');
});
