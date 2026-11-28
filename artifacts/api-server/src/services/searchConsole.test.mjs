import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  createSearchConsoleClient,
  CUPCAL_SEARCH_CONSOLE_PROPERTY,
  hasCanonicalSnapshotChanged,
  SearchConsoleError,
  shouldRecordCanonicalSnapshot,
  validateSearchConsoleReportRequest,
} from "./searchConsole.ts";

const now = new Date("2026-11-21T12:00:00.000Z");
const validRequest = {
  urls: ["https://cupcal.af-software.app/", "https://cupcal.af-software.app/turnierkalender-app/"],
  startDate: "2026-10-25",
  endDate: "2026-11-21",
  comparisonStartDate: "2026-09-27",
  comparisonEndDate: "2026-10-24",
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

test("speichert nur vollständige und veränderte Canonical-Zustände in der Historie", () => {
  const previous = {
    userCanonical: "https://cupcal.af-software.app/",
    googleCanonical: "https://www.cupcal.af-software.app/",
  };

  assert.equal(hasCanonicalSnapshotChanged(previous, { ...previous }), false);
  const changed = {
    ...previous,
    googleCanonical: "https://cupcal.af-software.app/",
  };
  assert.equal(hasCanonicalSnapshotChanged(previous, changed), true);
  assert.equal(shouldRecordCanonicalSnapshot(null, previous), true);
  assert.equal(shouldRecordCanonicalSnapshot(previous, { ...previous }), false);
  assert.equal(shouldRecordCanonicalSnapshot(previous, changed), true);
  assert.equal(shouldRecordCanonicalSnapshot(previous, {
    userCanonical: "https://cupcal.af-software.app/",
    googleCanonical: null,
  }), false);
});

test("uses the readonly OAuth scope and maps index and search performance data", async () => {
  const calls = [];
  const historySnapshots = [];
  const env = serviceAccountEnv();
  const client = createSearchConsoleClient({
    env,
    now: () => now.getTime(),
    canonicalHistoryStore: async (snapshot) => {
      historySnapshots.push(snapshot);
      return {
        firstDetectedAt: "2026-11-19T10:36:01.000Z",
        lastChangedAt: "2026-11-20T10:36:01.000Z",
      };
    },
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
              userCanonical: " https://www.cupcal.af-software.app/ ",
            },
          },
        });
      }
      assert.match(url, /searchAnalytics\/query$/);
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.dimensionFilterGroups, [{
        filters: [{
          dimension: "page",
          operator: "equals",
          expression: validRequest.urls[0],
        }],
      }]);
      if (body.dimensions[0] === "query") {
        assert.equal(body.rowLimit, 100);
        const comparisonPeriod = body.startDate === validRequest.comparisonStartDate;
        assert.equal(body.startDate, comparisonPeriod ? validRequest.comparisonStartDate : validRequest.startDate);
        assert.equal(body.endDate, comparisonPeriod ? validRequest.comparisonEndDate : validRequest.endDate);
        return Response.json({ rows: comparisonPeriod
          ? [
            { keys: ["cupcal kalender"], clicks: 3, impressions: 50, ctr: 0.06, position: 5.5 },
            { keys: ["alter cupcal begriff"], clicks: 1, impressions: 20, ctr: 0.05, position: 8.1 },
          ]
          : [
            { keys: ["cupcal kalender"], clicks: 8, impressions: 100, ctr: 0.08, position: 4.5 },
            { keys: ["fortnite cup termine"], clicks: 2, impressions: 30, ctr: 0.0667, position: 7.1 },
          ] });
      }
      assert.equal(body.startDate, validRequest.startDate);
      assert.equal(body.endDate, validRequest.endDate);
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
      userCanonical: "https://www.cupcal.af-software.app/",
      canonicalHistory: {
        firstDetectedAt: "2026-11-19T10:36:01.000Z",
        lastChangedAt: "2026-11-20T10:36:01.000Z",
      },
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
    queryComparisons: [
      {
        query: "cupcal kalender",
        currentClicks: 8,
        currentImpressions: 100,
        currentPosition: 4.5,
        comparisonClicks: 3,
        comparisonImpressions: 50,
        comparisonPosition: 5.5,
        status: "both",
      },
      {
        query: "fortnite cup termine",
        currentClicks: 2,
        currentImpressions: 30,
        currentPosition: 7.1,
        comparisonClicks: null,
        comparisonImpressions: null,
        comparisonPosition: null,
        status: "new",
      },
      {
        query: "alter cupcal begriff",
        currentClicks: null,
        currentImpressions: null,
        currentPosition: null,
        comparisonClicks: 1,
        comparisonImpressions: 20,
        comparisonPosition: 8.1,
        status: "not_visible",
      },
    ],
  });
  assert.deepEqual(historySnapshots, [{
    url: validRequest.urls[0],
    userCanonical: "https://www.cupcal.af-software.app/",
    googleCanonical: "https://cupcal.af-software.app/",
  }]);
  assert.equal(calls.length, 7);
  assert.ok(calls.slice(1).every(({ init }) => init.headers.authorization === "Bearer mock-access-token"));
  assert.ok(calls.slice(1).every(({ init }) => init.method === "POST"));
  for (const { init } of calls.slice(2)) {
    const body = JSON.parse(String(init.body));
    if (body.dimensions[0] === "query" && body.startDate === validRequest.comparisonStartDate) {
      assert.equal(body.endDate, validRequest.comparisonEndDate);
    } else {
      assert.equal(body.startDate, validRequest.startDate);
      assert.equal(body.endDate, validRequest.endDate);
    }
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
  assert.deepEqual(result?.queryComparisons, []);
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
        comparisonPeriod: body.startDate === validRequest.comparisonStartDate,
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
        ? Response.json({ rows: [{ keys: [`Suchbegriff ${requestedPages.at(-1)?.comparisonPeriod ? "Vergleich" : "aktuell"} für ${pageUrl}`], clicks: 1, impressions: 4 }] })
        : Response.json({ rows: [{ clicks: 1, impressions: 4 }] });
    },
  });

  const result = await client.getReport(validRequest);
  assert.deepEqual(result.map((item) => item.queries[0]?.query), [
    `Suchbegriff aktuell für ${validRequest.urls[0]}`,
    `Suchbegriff aktuell für ${validRequest.urls[1]}`,
  ]);
  assert.deepEqual(result.map((item) => item.queryComparisons.map(({ query, status }) => [query, status])), [
    [
      [`Suchbegriff aktuell für ${validRequest.urls[0]}`, "new"],
      [`Suchbegriff Vergleich für ${validRequest.urls[0]}`, "not_visible"],
    ],
    [
      [`Suchbegriff aktuell für ${validRequest.urls[1]}`, "new"],
      [`Suchbegriff Vergleich für ${validRequest.urls[1]}`, "not_visible"],
    ],
  ]);
  assert.deepEqual(result.map((item) => item.countries[0]?.country), ["DEU", "FRA"]);
  assert.deepEqual(result.map((item) => item.devices[0]?.device), ["MOBILE", "MOBILE"]);
  for (const dimension of ["query", "country", "device"]) {
    assert.equal(
      requestedPages.filter(({ dimensions }) => dimensions[0] === dimension).length,
      dimension === "query" ? 4 : 2,
    );
  }
  assert.ok(requestedPages.every(({ pageUrl }) => validRequest.urls.includes(pageUrl)));
  assert.ok(requestedPages.every(({ startDate, endDate, comparisonPeriod }) =>
    comparisonPeriod
      ? startDate === validRequest.comparisonStartDate && endDate === validRequest.comparisonEndDate
      : startDate === validRequest.startDate && endDate === validRequest.endDate));
});

test("validates the comparison period independently", () => {
  assert.throws(
    () => validateSearchConsoleReportRequest({ ...validRequest, comparisonStartDate: "2026-02-30" }, now),
    /Zeitraum ist ungültig/,
  );
  assert.throws(
    () => validateSearchConsoleReportRequest({ ...validRequest, comparisonEndDate: "2026-11-22" }, now),
    /Zukunft/,
  );
  assert.throws(
    () => validateSearchConsoleReportRequest({
      ...validRequest,
      comparisonStartDate: "2026-10-25",
      comparisonEndDate: "2026-10-24",
    }, now),
    /Startdatum muss vor oder am Enddatum liegen/,
  );
  assert.throws(
    () => validateSearchConsoleReportRequest({ ...validRequest, comparisonStartDate: "2025-06-01" }, now),
    /16 Monate/,
  );
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
