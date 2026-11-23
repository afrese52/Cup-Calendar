import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const publicRoot = resolve(fileURLToPath(new URL('../dist/public/', import.meta.url)));
const MINIMUM_COMPRESS_BYTES = 512;
const NOT_ACCEPTABLE_BODY = 'Not Acceptable';
const bodyCache = new Map();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

const COMPRESSIBLE_TYPES = new Set([
  'application/json',
  'application/manifest+json',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/html',
  'text/javascript',
  'text/plain',
]);

function writeCompressionFailureEvent(event) {
  console.error(JSON.stringify(event));
}

function parseAcceptEncoding(header = '') {
  const encodings = new Map();

  for (const item of header.split(',')) {
    const [namePart, ...parameters] = item.trim().toLowerCase().split(';');
    if (!namePart) continue;
    const qualityParameter = parameters.find((parameter) =>
      parameter.trim().startsWith('q='),
    );
    const quality = qualityParameter
      ? Number(qualityParameter.trim().slice(2))
      : 1;
    encodings.set(
      namePart,
      Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0,
    );
  }

  return encodings;
}

export function chooseContentEncoding(header) {
  const encodings = parseAcceptEncoding(header);
  const quality = (name) =>
    encodings.has(name) ? encodings.get(name) : encodings.get('*') || 0;
  const brotliQuality = quality('br');
  const gzipQuality = quality('gzip');

  if (brotliQuality <= 0 && gzipQuality <= 0) return null;
  return brotliQuality >= gzipQuality ? 'br' : 'gzip';
}

function isIdentityAcceptable(header) {
  if (header === undefined) return true;

  const encodings = parseAcceptEncoding(header);
  if (encodings.has('identity')) return encodings.get('identity') > 0;
  if (encodings.has('*')) return encodings.get('*') > 0;
  return true;
}

export function resolvePublicFile(root, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname).replaceAll('\\', '/');
  } catch {
    return null;
  }

  const resolvedRoot = resolve(root);
  const relativePath = decodedPath.replace(/^\/+/, '') || 'index.html';
  const filePath = resolve(resolvedRoot, relativePath);

  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${sep}`)) {
    return null;
  }

  return filePath;
}

async function compressRepresentation(original, encoding) {
  if (encoding === 'br') {
    return brotliAsync(original, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    });
  }
  if (encoding === 'gzip') {
    return gzipAsync(original, { level: 6 });
  }
  return original;
}

async function getRepresentation(
  filePath,
  encoding,
  original,
  compress = compressRepresentation,
) {
  const cacheKey = `${filePath}:${encoding || 'identity'}`;
  if (bodyCache.has(cacheKey)) return bodyCache.get(cacheKey);

  const representation = encoding
    ? await compress(original, encoding)
    : original;

  bodyCache.set(cacheKey, representation);
  return representation;
}

function cacheControlFor(pathname, isHtml) {
  if (isHtml || pathname === '/index.html' || pathname === '/') {
    return 'no-cache';
  }
  if (/^\/assets\/.+-[\w-]{6,}\./.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

export function createStaticServer({
  root = publicRoot,
  basePath = process.env.BASE_PATH || '/',
  compress = compressRepresentation,
  getCompressedRepresentation,
  reportCompressionFailure = writeCompressionFailureEvent,
} = {}) {
  const normalizedBasePath =
    basePath === '/' ? '' : `/${basePath.replace(/^\/+|\/+$/g, '')}`;
  const getRepresentationForRequest =
    getCompressedRepresentation ||
    ((filePath, encoding, original) =>
      getRepresentation(filePath, encoding, original, compress));
  let compressionFailureCount = 0;

  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end('Method Not Allowed');
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    if (
      normalizedBasePath &&
      (pathname === normalizedBasePath ||
        pathname.startsWith(`${normalizedBasePath}/`))
    ) {
      pathname = pathname.slice(normalizedBasePath.length) || '/';
    }

    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    let filePath = resolvePublicFile(root, requestedPath);
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    let original;
    let responseStatus = 200;
    try {
      original = await readFile(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
        console.error('Static file read failed:', error.message);
        response.writeHead(500);
        response.end('Internal Server Error');
        return;
      }

      if (!extname(pathname) && pathname !== '/') {
        const directoryIndex = resolvePublicFile(
          root,
          `${pathname.replace(/\/+$/, '')}/index.html`,
        );
        try {
          original = await readFile(directoryIndex);
          filePath = directoryIndex;
        } catch (indexError) {
          if (indexError.code !== 'ENOENT' && indexError.code !== 'EISDIR') {
            console.error('Static page read failed:', indexError.message);
            response.writeHead(500);
            response.end('Internal Server Error');
            return;
          }
        }
      }

      if (!original) {
        if (extname(pathname) || pathname.startsWith('/assets/')) {
          response.writeHead(404);
          response.end('Not Found');
          return;
        }

        filePath = resolvePublicFile(root, '/404.html');
        responseStatus = 404;
        try {
          original = await readFile(filePath);
        } catch {
          response.writeHead(404);
          response.end('Not Found');
          return;
        }
      }
    }

    const extension = extname(filePath).toLowerCase();
    const contentType =
      MIME_TYPES[extension] || 'application/octet-stream';
    const baseContentType = contentType.split(';', 1)[0];
    const acceptEncoding = request.headers['accept-encoding'];
    const identityAcceptable = isIdentityAcceptable(acceptEncoding);
    const canCompress =
      COMPRESSIBLE_TYPES.has(baseContentType) &&
      (original.length >= MINIMUM_COMPRESS_BYTES || !identityAcceptable);
    let encoding = canCompress
      ? chooseContentEncoding(acceptEncoding)
      : null;

    if (!encoding && !identityAcceptable) {
      response.writeHead(406, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': Buffer.byteLength(NOT_ACCEPTABLE_BODY),
        'vary': 'Accept-Encoding',
      });
      response.end(request.method === 'HEAD' ? undefined : NOT_ACCEPTABLE_BODY);
      return;
    }

    let body;
    try {
      body = encoding
        ? await getRepresentationForRequest(filePath, encoding, original)
        : original;
    } catch (error) {
      compressionFailureCount += 1;
      try {
        const reportingResult = reportCompressionFailure({
          event: 'cupcal.static_compression.failure',
          version: 1,
          encoding,
          failureCount: compressionFailureCount,
        });
        if (reportingResult && typeof reportingResult.then === 'function') {
          void Promise.resolve(reportingResult).catch(() => {});
        }
      } catch {
        // Reporting must never interrupt the uncompressed response fallback.
      }
      body = original;
      encoding = null;
    }

    const headers = {
      'cache-control': cacheControlFor(pathname, extension === '.html'),
      'content-length': body.length,
      'content-type': contentType,
      'vary': 'Accept-Encoding',
      'x-content-type-options': 'nosniff',
    };
    if (encoding) headers['content-encoding'] = encoding;

    response.writeHead(responseStatus, headers);
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  createStaticServer().listen(port, '0.0.0.0', () => {
    console.log(`Serving compressed CupCal website on port ${port}`);
  });
}
