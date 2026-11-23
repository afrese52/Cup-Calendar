import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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
let trackedEvents;
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
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx');

  root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => {
    root.render(createElement(App, { pathname: '/' }));
  });
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
    const cta = dom.window.document.querySelector(`[data-testid="${testId}"]`);

    assert.ok(cta, `CTA mit data-testid="${testId}" muss auf der Startseite vorhanden sein`);
    await act(async () => cta.click());

    assert.deepEqual(trackedEvents, [
      ['availability_cta_click', { placement }],
    ]);
  });
}
