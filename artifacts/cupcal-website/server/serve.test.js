import assert from 'node:assert/strict';
import { brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
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

function getResponse(
  pathname,
  headers = {},
  requestOrigin = origin,
  method = 'GET',
) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${requestOrigin}${pathname}`,
      { headers, method },
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

  const brotliHead = await getResponse(
    '/',
    { 'accept-encoding': 'br, gzip' },
    origin,
    'HEAD',
  );
  assert.equal(brotliHead.status, brotliPage.status);
  for (const header of [
    'cache-control',
    'content-encoding',
    'content-length',
    'content-type',
    'vary',
    'x-content-type-options',
  ]) {
    assert.equal(
      brotliHead.headers[header],
      brotliPage.headers[header],
      header,
    );
  }
  assert.equal(
    brotliHead.headers['content-length'],
    String(brotliPage.body.length),
  );
  assert.equal(brotliHead.body.length, 0);

  const gzipScript = await getResponse('/assets/app.js', {
    'accept-encoding': 'gzip',
  });
  assert.equal(gzipScript.status, 200);
  assert.equal(gzipScript.headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(gzipScript.body).toString(), script);

  const gzipHead = await getResponse(
    '/assets/app.js',
    { 'accept-encoding': 'gzip' },
    origin,
    'HEAD',
  );
  assert.equal(gzipHead.status, gzipScript.status);
  assert.equal(
    gzipHead.headers['content-encoding'],
    gzipScript.headers['content-encoding'],
  );
  assert.equal(
    gzipHead.headers['content-length'],
    gzipScript.headers['content-length'],
  );
  assert.equal(
    gzipHead.headers['content-type'],
    gzipScript.headers['content-type'],
  );
  assert.equal(gzipHead.headers.vary, gzipScript.headers.vary);
  assert.equal(gzipHead.body.length, 0);

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
  assert.equal(
    identityExplicitlyExcluded.headers['content-encoding'],
    undefined,
  );
  assert.equal(identityExplicitlyExcluded.headers.vary, 'Accept-Encoding');
  assert.equal(identityExplicitlyExcluded.body.toString(), 'Not Acceptable');

  const rejectedHead = await getResponse(
    '/',
    { 'accept-encoding': 'identity;q=0, gzip;q=0, br;q=0' },
    origin,
    'HEAD',
  );
  assert.equal(rejectedHead.status, 406);
  assert.equal(rejectedHead.headers['content-encoding'], undefined);
  assert.equal(
    rejectedHead.headers['content-type'],
    identityExplicitlyExcluded.headers['content-type'],
  );
  assert.equal(
    rejectedHead.headers['content-length'],
    identityExplicitlyExcluded.headers['content-length'],
  );
  assert.equal(
    rejectedHead.headers.vary,
    identityExplicitlyExcluded.headers.vary,
  );
  assert.equal(rejectedHead.body.length, 0);

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

test('falls back to the original page and asset when compression fails', async () => {
  const originalPage = `<main>${'CupCal calendar '.repeat(100)}</main>`;
  const originalScript = `window.cupcal = '${'events '.repeat(200)}';`;
  const fallbackRoot = await mkdtemp(join(tmpdir(), 'cupcal-static-fallback-'));
  await mkdir(join(fallbackRoot, 'assets'));
  await writeFile(join(fallbackRoot, 'index.html'), originalPage);
  await writeFile(join(fallbackRoot, 'assets', 'app.js'), originalScript);
  const compressionFailureEvents = [];

  const fallbackServer = createStaticServer({
    root: fallbackRoot,
    basePath: '/',
    reportCompressionFailure: (event) => compressionFailureEvents.push(event),
    getCompressedRepresentation: async (_filePath, encoding) => {
      throw new Error(`simulated ${encoding} compression failure`);
    },
  });
  await new Promise((resolve, reject) => {
    fallbackServer.once('error', reject);
    fallbackServer.listen(0, '127.0.0.1', resolve);
  });
  const fallbackOrigin = `http://127.0.0.1:${fallbackServer.address().port}`;

  try {
    const pageResponse = await getResponse(
      '/',
      { 'accept-encoding': 'br, gzip' },
      fallbackOrigin,
    );
    assert.equal(pageResponse.status, 200);
    assert.equal(pageResponse.headers['content-encoding'], undefined);
    assert.equal(pageResponse.headers['content-length'], String(Buffer.byteLength(originalPage)));
    assert.equal(pageResponse.body.toString(), originalPage);

    const assetResponse = await getResponse(
      '/assets/app.js',
      { 'accept-encoding': 'gzip' },
      fallbackOrigin,
    );
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers['content-encoding'], undefined);
    assert.equal(assetResponse.headers['content-length'], String(Buffer.byteLength(originalScript)));
    assert.equal(assetResponse.body.toString(), originalScript);

    assert.deepEqual(compressionFailureEvents, [
      {
        event: 'cupcal.static_compression.failure',
        version: 1,
        encoding: 'br',
        failureCount: 1,
      },
      {
        event: 'cupcal.static_compression.failure',
        version: 1,
        encoding: 'gzip',
        failureCount: 2,
      },
    ]);
    assert.equal(
      JSON.stringify(compressionFailureEvents).includes(fallbackRoot),
      false,
    );
  } finally {
    await new Promise((resolve) => fallbackServer.close(resolve));
    await rm(fallbackRoot, { recursive: true, force: true });
  }
});

test('serves the uncompressed response when compression failure reporting fails', async () => {
  const original = `<main>${'CupCal tournament calendar '.repeat(100)}</main>`;
  const fallbackRoot = await mkdtemp(join(tmpdir(), 'cupcal-static-monitor-failure-'));
  await writeFile(join(fallbackRoot, 'index.html'), original);
  const fallbackServer = createStaticServer({
    root: fallbackRoot,
    reportCompressionFailure: async () => {
      throw new Error('simulated monitoring failure');
    },
    compress: async () => {
      throw new Error('simulated compression failure');
    },
  });
  await new Promise((resolve, reject) => {
    fallbackServer.once('error', reject);
    fallbackServer.listen(0, '127.0.0.1', resolve);
  });

  try {
    const response = await getResponse(
      '/',
      { 'accept-encoding': 'gzip' },
      `http://127.0.0.1:${fallbackServer.address().port}`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.equal(response.body.toString(), original);
  } finally {
    await new Promise((resolve) => fallbackServer.close(resolve));
    await rm(fallbackRoot, { recursive: true, force: true });
  }
});

test('retries a failed compression and caches only the successful response', async () => {
  const original = `<main>${'CupCal tournament calendar '.repeat(100)}</main>`;
  const retryRoot = await mkdtemp(join(tmpdir(), 'cupcal-static-retry-'));
  await writeFile(join(retryRoot, 'index.html'), original);
  let compressionAttempts = 0;

  const retryServer = createStaticServer({
    root: retryRoot,
    basePath: '/',
    compress: async (body, encoding) => {
      assert.equal(encoding, 'gzip');
      compressionAttempts += 1;
      if (compressionAttempts === 1) {
        throw new Error('simulated temporary compression failure');
      }
      return gzipSync(body);
    },
  });
  await new Promise((resolve, reject) => {
    retryServer.once('error', reject);
    retryServer.listen(0, '127.0.0.1', resolve);
  });
  const retryOrigin = `http://127.0.0.1:${retryServer.address().port}`;

  try {
    const failedAttempt = await getResponse(
      '/',
      { 'accept-encoding': 'gzip' },
      retryOrigin,
    );
    assert.equal(failedAttempt.status, 200);
    assert.equal(failedAttempt.headers['content-encoding'], undefined);
    assert.equal(failedAttempt.headers['content-length'], String(Buffer.byteLength(original)));
    assert.equal(failedAttempt.body.toString(), original);

    const successfulRetry = await getResponse(
      '/',
      { 'accept-encoding': 'gzip' },
      retryOrigin,
    );
    assert.equal(successfulRetry.status, 200);
    assert.equal(successfulRetry.headers['content-encoding'], 'gzip');
    assert.equal(gunzipSync(successfulRetry.body).toString(), original);
    assert.equal(compressionAttempts, 2);

    const cachedSuccess = await getResponse(
      '/',
      { 'accept-encoding': 'gzip' },
      retryOrigin,
    );
    assert.equal(cachedSuccess.headers['content-encoding'], 'gzip');
    assert.deepEqual(cachedSuccess.body, successfulRetry.body);
    assert.equal(compressionAttempts, 2);
  } finally {
    await new Promise((resolve) => retryServer.close(resolve));
    await rm(retryRoot, { recursive: true, force: true });
  }
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
