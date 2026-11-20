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
  assert.equal(chooseContentEncoding('*'), 'br');
  assert.equal(chooseContentEncoding('gzip;q=0, *;q=1'), 'br');
  assert.equal(chooseContentEncoding('br;q=0, gzip;q=0.5, *;q=1'), 'gzip');
  assert.equal(chooseContentEncoding('*;q=0'), null);
  assert.equal(chooseContentEncoding('gzip;q=0, br;q=0'), null);
  assert.equal(chooseContentEncoding('identity'), null);
  assert.equal(chooseContentEncoding(undefined), null);
  assert.equal(chooseContentEncoding(''), null);
});

test('serves compressed content, generated pages, and real 404 responses', async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'cupcal-static-'));
  await mkdir(join(temporaryRoot, 'assets'));
  await mkdir(join(temporaryRoot, 'turnierzeiten'));
  const page = `<main>${'CupCal tournament calendar '.repeat(100)}</main>`;
  const script = `window.cupcal = '${'calendar '.repeat(200)}';`;
  const topicPage = '<main><h1>Turnierzeiten in deiner Gerätezeitzone</h1></main>';
  const notFoundPage = '<main><h1>Diese Seite gibt es nicht.</h1></main>';
  await writeFile(join(temporaryRoot, 'index.html'), page);
  await writeFile(join(temporaryRoot, '404.html'), notFoundPage);
  await writeFile(join(temporaryRoot, 'assets', 'app.js'), script);
  await writeFile(join(temporaryRoot, 'assets', 'tiny.txt'), 'CupCal');
  await writeFile(join(temporaryRoot, 'turnierzeiten', 'index.html'), topicPage);

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

  const identityOnly = await getResponse('/', {
    'accept-encoding': 'identity',
  });
  assert.equal(identityOnly.status, 200);
  assert.equal(identityOnly.headers['content-encoding'], undefined);
  assert.equal(identityOnly.body.toString(), page);

  const noCompressionHeader = await getResponse('/');
  assert.equal(noCompressionHeader.status, 200);
  assert.equal(noCompressionHeader.headers['content-encoding'], undefined);
  assert.equal(noCompressionHeader.body.toString(), page);

  const gzipExcluded = await getResponse('/', {
    'accept-encoding': 'gzip;q=0, br;q=1',
  });
  assert.equal(gzipExcluded.status, 200);
  assert.equal(gzipExcluded.headers['content-encoding'], 'br');
  assert.equal(brotliDecompressSync(gzipExcluded.body).toString(), page);

  const identityExplicitlyExcluded = await getResponse('/', {
    'accept-encoding': 'identity;q=0, gzip;q=0, br;q=0',
  });
  assert.equal(identityExplicitlyExcluded.status, 406);
  assert.equal(identityExplicitlyExcluded.headers['content-encoding'], undefined);
  assert.equal(identityExplicitlyExcluded.headers.vary, 'Accept-Encoding');

  const tinyResourceRequiresCompression = await getResponse('/assets/tiny.txt', {
    'accept-encoding': 'gzip, identity;q=0',
  });
  assert.equal(tinyResourceRequiresCompression.status, 200);
  assert.equal(tinyResourceRequiresCompression.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(tinyResourceRequiresCompression.body).toString(), 'CupCal');

  const wildcardExcludesAll = await getResponse('/', {
    'accept-encoding': '*;q=0',
  });
  assert.equal(wildcardExcludesAll.status, 406);

  const wildcardExcludesCompressionOnly = await getResponse('/', {
    'accept-encoding': '*;q=0, identity;q=1',
  });
  assert.equal(wildcardExcludesCompressionOnly.status, 200);
  assert.equal(wildcardExcludesCompressionOnly.headers['content-encoding'], undefined);

  const unknownRoute = await getResponse('/kalender/');
  assert.equal(unknownRoute.status, 404);
  assert.equal(unknownRoute.body.toString(), notFoundPage);
  assert.equal(unknownRoute.headers['cache-control'], 'no-cache');

  const topicRoute = await getResponse('/turnierzeiten/');
  assert.equal(topicRoute.status, 200);
  assert.equal(topicRoute.body.toString(), topicPage);

  const topicRouteWithoutSlash = await getResponse('/turnierzeiten');
  assert.equal(topicRouteWithoutSlash.status, 200);
  assert.equal(topicRouteWithoutSlash.body.toString(), topicPage);

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
