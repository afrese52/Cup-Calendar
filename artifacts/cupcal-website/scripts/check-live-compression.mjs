import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const providedUrl = process.argv.slice(2).find((argument) => argument !== '--');
const baseUrl = new URL(
  providedUrl ||
    process.env.CUPCAL_LIVE_URL ||
    'https://cupcal.af-software.app',
);

if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  throw new Error(`Unsupported URL protocol: ${baseUrl.protocol}`);
}

const cases = [
  {
    name: 'missing Accept-Encoding',
    acceptEncoding: undefined,
    expectedStatus: 200,
    expectedEncoding: null,
  },
  {
    name: 'Brotli',
    acceptEncoding: 'br',
    expectedStatus: 200,
    expectedEncoding: 'br',
  },
  {
    name: 'Gzip',
    acceptEncoding: 'gzip',
    expectedStatus: 200,
    expectedEncoding: 'gzip',
  },
  {
    name: 'Gzip excluded while Brotli is allowed',
    acceptEncoding: 'gzip;q=0, br;q=1',
    expectedStatus: 200,
    expectedEncoding: 'br',
  },
  {
    name: 'Brotli and Gzip excluded, identity allowed',
    acceptEncoding: 'br;q=0, gzip;q=0, identity;q=1',
    expectedStatus: 200,
    expectedEncoding: null,
  },
  {
    name: 'all encodings excluded',
    acceptEncoding: 'identity;q=0, br;q=0, gzip;q=0',
    expectedStatus: 406,
    expectedEncoding: null,
  },
];

function getResponse(pathname, acceptEncoding) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(pathname, baseUrl);
    const request = (requestUrl.protocol === 'https:' ? httpsRequest : httpRequest)(
      requestUrl,
      {
        headers: {
          'user-agent': 'CupCal-live-compression-check/1.0',
          ...(acceptEncoding === undefined
            ? {}
            : { 'accept-encoding': acceptEncoding }),
        },
      },
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

function decodeBody(response) {
  const encoding = response.headers['content-encoding']?.toLowerCase();
  if (!encoding) return response.body;
  if (encoding === 'br') return brotliDecompressSync(response.body);
  if (encoding === 'gzip') return gunzipSync(response.body);
  throw new Error(`Unsupported Content-Encoding returned: ${encoding}`);
}

function variesByAcceptEncoding(value) {
  return value
    ?.split(',')
    .some((token) => token.trim().toLowerCase() === 'accept-encoding');
}

for (const testCase of cases) {
  const response = await getResponse('/', testCase.acceptEncoding);
  const actualEncoding = response.headers['content-encoding']?.toLowerCase() || null;

  assert.equal(
    response.status,
    testCase.expectedStatus,
    `${testCase.name}: unexpected HTTP status`,
  );
  assert.equal(
    actualEncoding,
    testCase.expectedEncoding,
    `${testCase.name}: unexpected Content-Encoding`,
  );
  assert.ok(
    variesByAcceptEncoding(response.headers.vary),
    `${testCase.name}: Vary must include Accept-Encoding`,
  );

  const decodedBody = decodeBody(response);
  if (response.status === 200) {
    const html = decodedBody.toString('utf8');
    assert.match(
      response.headers['content-type'] || '',
      /^text\/html\b/i,
      `${testCase.name}: expected an HTML response`,
    );
    assert.match(html, /<title\b[^>]*>[\s\S]*?<\/title>/i);
    assert.match(html, /<\/html>\s*$/i);
  } else {
    assert.equal(decodedBody.toString('utf8'), 'Not Acceptable');
  }

  console.log(
    JSON.stringify({
      domain: baseUrl.origin,
      request: testCase.name,
      acceptEncoding: testCase.acceptEncoding ?? '(omitted)',
      status: response.status,
      contentEncoding: actualEncoding ?? '(none)',
      vary: response.headers.vary,
      wireBytes: response.body.length,
      decodedBytes: decodedBody.length,
      decodedSha256: createHash('sha256').update(decodedBody).digest('hex'),
      result: 'PASS',
    }),
  );
}
