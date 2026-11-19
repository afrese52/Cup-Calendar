import assert from 'node:assert/strict';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { after, test } from 'node:test';

import {
  chooseContentEncoding,
  createStaticServer,
  resolvePublicFile,
} from './serve.js';

let temporaryRoot;
let server;
let origin;

function getResponse(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${origin}${pathname}`,
      { headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('selects an accepted compression format by quality', () => {
  assert.equal(chooseContentEncoding('gzip, br'), 'br');
  assert.equal(chooseContentEncoding('br;q=0.2, gzip;q=0.8'), 'gzip');
  assert.equal(chooseContentEncoding('gzip;q=0, br;q=0'), null);
  assert.equal(chooseContentEncoding('identity'), null);
});

test('serves compressed content and preserves SPA and static-file behavior', async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'cupcal-static-'));
  await mkdir(join(temporaryRoot, 'assets'));
  const page = `<main>${'CupCal tournament calendar '.repeat(100)}</main>`;
  const script = `window.cupcal = '${'calendar '.repeat(200)}';`;
  await writeFile(join(temporaryRoot, 'index.html'), page);
  await writeFile(join(temporaryRoot, 'assets', 'app.js'), script);

  server = createStaticServer({ root: temporaryRoot, basePath: '/' });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;

  const brotliPage = await getResponse('/', {
    'accept-encoding': 'br, gzip',
  });
  assert.equal(brotliPage.status, 200);
  assert.equal(brotliPage.headers['content-encoding'], 'br');
  assert.equal(brotliPage.headers.vary, 'Accept-Encoding');
  assert.equal(brotliDecompressSync(brotliPage.body).toString(), page);

  const gzipScript = await getResponse('/assets/app.js', {
    'accept-encoding': 'gzip',
  });
  assert.equal(gzipScript.status, 200);
  assert.equal(gzipScript.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(gzipScript.body).toString(), script);

  const spaRoute = await getResponse('/kalender/');
  assert.equal(spaRoute.status, 200);
  assert.equal(spaRoute.body.toString(), page);
  assert.equal(spaRoute.headers['cache-control'], 'no-cache');

  const missingAsset = await getResponse('/assets/missing.js');
  assert.equal(missingAsset.status, 404);
});

test('rejects paths that escape the public directory', () => {
  assert.equal(resolvePublicFile('/workspace/public', '/../secret.txt'), null);
  assert.equal(resolvePublicFile('/workspace/public', '/%2e%2e/secret.txt'), null);
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
