import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  createSearchConsoleClient,
  CUPCAL_SEARCH_CONSOLE_PROPERTY,
  SearchConsoleError,
  validateSearchConsoleReportRequest,
} from "./searchConsole.ts";

const now = new Date("2026-11-21T12:00:00.000Z");
const validRequest = {
  urls: ["https://cupcal.af-software.app/", "https://cupcal.af-software.app/turnierkalender-app/"],
  startDate: "2026-10-25",
  endDate: "2026-11-21",
};

function serviceAccountEnv() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "cupcal-gsc@sample-project.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  };
}

test("validates reports to only allow CupCal HTTPS URLs and dates", () => {
  assert.deepEqual(validateSearchConsoleReportRequest(validRequest, now), validRequest);
  for (const url of [
    "http://cupcal.af-software.app/",
    "https://example.com/",
    "https://cupcal.af-software.app/?q=private",
    "https://cupcal.af-software.app.evil.test/",
  ]) {
    assert.throws(
      () => validateSearchConsoleReportRequest({ ...validRequest, urls: [url] }, now),
      /CupCal-Domain/,
    );
  }
  assert.throws(
    () => validateSearchConsoleReportRequest({ ...validRequest, endDate: "2026-11-22" }, now),
    /Zukunft/,
  );
  assert.throws(
    () => validateSearchConsoleReportRequest({ ...validRequest, startDate: "2025-06-01" }, now),
    /16 Monate/,
  );
});

test("uses the readonly OAuth scope and maps index and search performance data", async () => {
  const calls = [];
  const env = serviceAccountEnv();
  const client = createSearchConsoleClient({
    env,
    now: () => now.getTime(),
    fetchImpl: async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(String(init.body));
        const assertion = body.get("assertion");
        assert.ok(assertion);
        const claims = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString());
        assert.equal(claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");
        return Response.json({ access_token: "mock-access-token", expires_in: 3600 });
      }
      if (url.endsWith("/urlInspection/index:inspect")) {
        const body = JSON.parse(String(init.body));
        assert.equal(body.siteUrl, CUPCAL_SEARCH_CONSOLE_PROPERTY);
        return Response.json({
          inspectionResult: {
            indexStatusResult: {
              verdict: "PASS",
              coverageState: "Submitted and indexed",
              indexingState: "INDEXING_ALLOWED",
              lastCrawlTime: "2026-11-19T10:36:01Z",
              googleCanonical: "https://cupcal.af-software.app/",
            },
          },
        });
      }
      assert.match(url, /searchAnalytics\/query$/);
      const body = JSON.parse(String(init.body));
      assert.equal(body.startDate, validRequest.startDate);
      assert.equal(body.endDate, validRequest.endDate);
      assert.deepEqual(body.dimensionFilterGroups, [{
        filters: [{
          dimension: "page",
          operator: "equals",
          expression: validRequest.urls[0],
        }],
      }]);
      if (body.dimensions[0] === "query") {
        assert.equal(body.rowLimit, 100);
        return Response.json({
          rows: [
            { keys: ["cupcal kalender"], clicks: 8, impressions: 100, ctr: 0.08, position: 4.5 },
            { keys: ["fortnite cup termine"], clicks: 2, impressions: 30, ctr: 0.0667, position: 7.1 },
          ],
        });
      }
      if (body.dimensions[0] === "country") {
        assert.equal(body.rowLimit, 250);
        return Response.json({
          rows: [{ keys: ["deu"], clicks: 9, impressions: 280, ctr: 0.032, position: 8.1 }],
        });
      }
      if (body.dimensions[0] === "device") {
        assert.equal(body.rowLimit, 3);
        return Response.json({
          rows: [{ keys: ["MOBILE"], clicks: 7, impressions: 180, ctr: 0.0389, position: 6.4 }],
        });
      }
      assert.deepEqual(body.dimensions, ["page"]);
      return Response.json({ rows: [{ clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 }] });
    },
  });

  const result = await client.getReport({ ...validRequest, urls: [validRequest.urls[0]] });
  assert.deepEqual(result[0], {
    url: validRequest.urls[0],
    indexing: {
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      robotsTxtState: null,
      indexingState: "INDEXING_ALLOWED",
      lastCrawlTime: "2026-11-19T10:36:01Z",
      pageFetchState: null,
      googleCanonical: "https://cupcal.af-software.app/",
      userCanonical: null,
    },
    performance: { clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 },
    countries: [
      { country: "DEU", clicks: 9, impressions: 280, ctr: 0.032, position: 8.1 },
    ],
    devices: [
      { device: "MOBILE", clicks: 7, impressions: 180, ctr: 0.0389, position: 6.4 },
    ],
    queries: [
      { query: "cupcal kalender", clicks: 8, impressions: 100, ctr: 0.08, position: 4.5 },
      { query: "fortnite cup termine", clicks: 2, impressions: 30, ctr: 0.0667, position: 7.1 },
    ],
  });
  assert.equal(calls.length, 6);
  assert.ok(calls.slice(1).every(({ init }) => init.headers.authorization === "Bearer mock-access-token"));
  assert.ok(calls.slice(1).every(({ init }) => init.method === "POST"));
  for (const { init } of calls.slice(2)) {
    const body = JSON.parse(String(init.body));
    assert.equal(body.startDate, validRequest.startDate);
    assert.equal(body.endDate, validRequest.endDate);
    assert.equal(body.dimensionFilterGroups[0].filters[0].expression, validRequest.urls[0]);
  }
});

test("returns zeros when Search Console has no performance row", async () => {
  const env = serviceAccountEnv();
  const client = createSearchConsoleClient({
    env,
    fetchImpl: async (input) => String(input) === "https://oauth2.googleapis.com/token"
      ? Response.json({ access_token: "mock-access-token", expires_in: 3600 })
      : Response.json(String(input).endsWith("/urlInspection/index:inspect")
        ? { inspectionResult: { indexStatusResult: { verdict: "NEUTRAL" } } }
        : {}),
  });

  const [result] = await client.getReport({ ...validRequest, urls: [validRequest.urls[0]] });
  assert.deepEqual(result?.performance, { clicks: 0, impressions: 0, ctr: 0, position: null });
  assert.deepEqual(result?.queries, []);
  assert.deepEqual(result?.countries, []);
  assert.deepEqual(result?.devices, []);
});

test("filters visible search terms separately for each selected CupCal page", async () => {
  const requestedPages = [];
  const client = createSearchConsoleClient({
    env: serviceAccountEnv(),
    fetchImpl: async (input, init = {}) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "mock-access-token", expires_in: 3600 });
      }
      if (url.endsWith("/urlInspection/index:inspect")) {
        return Response.json({ inspectionResult: { indexStatusResult: {} } });
      }
      const body = JSON.parse(String(init.body));
      const pageUrl = body.dimensionFilterGroups[0].filters[0].expression;
      requestedPages.push({
        pageUrl,
        dimensions: body.dimensions,
        startDate: body.startDate,
        endDate: body.endDate,
      });
      if (body.dimensions[0] === "country") {
        return Response.json({
          rows: [{ keys: [pageUrl === validRequest.urls[0] ? "deu" : "fra"], clicks: 1, impressions: 4 }],
        });
      }
      if (body.dimensions[0] === "device") {
        return Response.json({
          rows: [{ keys: ["MOBILE"], clicks: 1, impressions: 4 }],
        });
      }
      return body.dimensions[0] === "query"
        ? Response.json({ rows: [{ keys: [`Suchbegriff für ${pageUrl}`], clicks: 1, impressions: 4 }] })
        : Response.json({ rows: [{ clicks: 1, impressions: 4 }] });
    },
  });

  const result = await client.getReport(validRequest);
  assert.deepEqual(result.map((item) => item.queries[0]?.query), [
    `Suchbegriff für ${validRequest.urls[0]}`,
    `Suchbegriff für ${validRequest.urls[1]}`,
  ]);
  assert.deepEqual(result.map((item) => item.countries[0]?.country), ["DEU", "FRA"]);
  assert.deepEqual(result.map((item) => item.devices[0]?.device), ["MOBILE", "MOBILE"]);
  for (const dimension of ["query", "country", "device"]) {
    assert.equal(
      requestedPages.filter(({ dimensions }) => dimensions[0] === dimension).length,
      2,
    );
  }
  assert.ok(requestedPages.every(({ pageUrl }) => validRequest.urls.includes(pageUrl)));
  assert.ok(requestedPages.every(({ startDate, endDate }) =>
    startDate === validRequest.startDate && endDate === validRequest.endDate));
});

test("does not reveal Google error response contents", async () => {
  const client = createSearchConsoleClient({
    env: serviceAccountEnv(),
    fetchImpl: async (input) => String(input) === "https://oauth2.googleapis.com/token"
      ? Response.json({ access_token: "mock-access-token", expires_in: 3600 })
      : new Response("private error payload", { status: 403 }),
  });

  await assert.rejects(
    client.getReport({ ...validRequest, urls: [validRequest.urls[0]] }),
    (error) => error instanceof SearchConsoleError
      && error.kind === "google_api_failed"
      && !error.message.includes("private"),
  );
});

test("rejects missing service-account credentials without exposing details", async () => {
  const client = createSearchConsoleClient({ env: {} });
  assert.equal(client.isConfigured(), false);
  await assert.rejects(
    client.getReport({ ...validRequest, urls: [validRequest.urls[0]] }),
    (error) => error instanceof SearchConsoleError && error.kind === "not_configured",
  );
});
