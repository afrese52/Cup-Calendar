import { createSign } from "node:crypto";

export const CUPCAL_SEARCH_CONSOLE_PROPERTY = "https://cupcal.af-software.app/";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE_URL = "https://searchconsole.googleapis.com";
const MAX_REPORT_DAYS = 16 * 31;

export type SearchConsoleReportRequest = {
  urls: string[];
  startDate: string;
  endDate: string;
  comparisonStartDate: string;
  comparisonEndDate: string;
};

export type SearchConsoleReportItem = {
  url: string;
  indexing: {
    verdict: string | null;
    coverageState: string | null;
    robotsTxtState: string | null;
    indexingState: string | null;
    lastCrawlTime: string | null;
    pageFetchState: string | null;
    googleCanonical: string | null;
    userCanonical: string | null;
  };
  performance: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number | null;
  };
  queries: SearchConsoleQuery[];
  queryComparisons: SearchConsoleQueryComparison[];
  countries: SearchConsoleCountry[];
  devices: SearchConsoleDevice[];
};

export type SearchConsoleQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

export type SearchConsoleQueryComparison = {
  query: string;
  currentClicks: number | null;
  currentImpressions: number | null;
  comparisonClicks: number | null;
  comparisonImpressions: number | null;
  status: "both" | "new" | "not_visible";
};

export type SearchConsoleCountry = {
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

export type SearchConsoleDeviceType = "DESKTOP" | "MOBILE" | "TABLET";

export type SearchConsoleDevice = {
  device: SearchConsoleDeviceType;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

export class SearchConsoleError extends Error {
  readonly kind: "not_configured" | "google_auth_failed" | "google_api_failed";

  constructor(kind: "not_configured" | "google_auth_failed" | "google_api_failed") {
    super(kind);
    this.name = "SearchConsoleError";
    this.kind = kind;
  }
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function getServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw) throw new SearchConsoleError("not_configured");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SearchConsoleError("not_configured");
  }
  if (!parsed || typeof parsed !== "object") throw new SearchConsoleError("not_configured");

  const candidate = parsed as Partial<ServiceAccount>;
  if (
    typeof candidate.client_email !== "string"
    || !candidate.client_email.includes("@")
    || typeof candidate.private_key !== "string"
    || !candidate.private_key.includes("PRIVATE KEY")
  ) {
    throw new SearchConsoleError("not_configured");
  }
  return {
    client_email: candidate.client_email,
    private_key: candidate.private_key,
  };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function createServiceAccountAssertion(
  account: ServiceAccount,
  nowSeconds: number,
): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: account.client_email,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(account.private_key)
    .toString("base64url");
  return `${unsignedToken}.${signature}`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month! - 1
    && parsed.getUTCDate() === day;
}

export function validateSearchConsoleReportRequest(
  input: SearchConsoleReportRequest,
  now = new Date(),
): SearchConsoleReportRequest {
  if (input.urls.length < 1 || input.urls.length > 10) {
    throw new TypeError("Bitte gib zwischen einer und zehn CupCal-Seiten an.");
  }
  if (
    !isCalendarDate(input.startDate)
    || !isCalendarDate(input.endDate)
    || !isCalendarDate(input.comparisonStartDate)
    || !isCalendarDate(input.comparisonEndDate)
  ) {
    throw new TypeError("Der ausgewählte Zeitraum ist ungültig.");
  }
  const today = now.toISOString().slice(0, 10);
  if (
    input.startDate > input.endDate
    || input.comparisonStartDate > input.comparisonEndDate
  ) {
    throw new TypeError("Das Startdatum muss vor oder am Enddatum liegen.");
  }
  if (input.endDate > today || input.comparisonEndDate > today) {
    throw new TypeError("Der Zeitraum darf nicht in der Zukunft liegen.");
  }
  for (const [startDate, endDate] of [
    [input.startDate, input.endDate],
    [input.comparisonStartDate, input.comparisonEndDate],
  ]) {
    const startMillis = Date.parse(`${startDate}T00:00:00.000Z`);
    const endMillis = Date.parse(`${endDate}T00:00:00.000Z`);
    if (endMillis - startMillis > MAX_REPORT_DAYS * 24 * 60 * 60 * 1000) {
      throw new TypeError("Jeder Zeitraum darf höchstens 16 Monate umfassen.");
    }
  }

  const urls = input.urls.map((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new TypeError("Eine URL ist ungültig.");
    }
    if (
      parsed.protocol !== "https:"
      || parsed.hostname !== "cupcal.af-software.app"
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      throw new TypeError("Es sind nur HTTPS-Seiten der CupCal-Domain erlaubt.");
    }
    return parsed.toString();
  });

  return { ...input, urls: [...new Set(urls)] };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createSearchConsoleClient(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number; email: string } | null = null;

  async function getAccessToken(account: ServiceAccount): Promise<string> {
    if (
      cachedToken
      && cachedToken.email === account.client_email
      && cachedToken.expiresAt > now() + 60_000
    ) {
      return cachedToken.value;
    }

    let assertion: string;
    try {
      assertion = createServiceAccountAssertion(account, Math.floor(now() / 1000));
    } catch {
      throw new SearchConsoleError("not_configured");
    }
    let response: Response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SearchConsoleError("google_auth_failed");
    }

    const payload = await readJson(response);
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new SearchConsoleError("google_auth_failed");
    }
    const expiresIn = asNumber(payload.expires_in, 3600);
    cachedToken = {
      value: payload.access_token,
      expiresAt: now() + expiresIn * 1000,
      email: account.client_email,
    };
    return cachedToken.value;
  }

  async function googlePost(
    url: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SearchConsoleError("google_api_failed");
    }
    if (!response.ok) throw new SearchConsoleError("google_api_failed");
    return await readJson(response);
  }

  return {
    isConfigured(): boolean {
      try {
        getServiceAccount(env["GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON"]);
        return true;
      } catch {
        return false;
      }
    },

    async getReport(input: SearchConsoleReportRequest): Promise<SearchConsoleReportItem[]> {
      const validated = validateSearchConsoleReportRequest(input);
      const account = getServiceAccount(env["GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON"]);
      const token = await getAccessToken(account);
      const analyticsEndpoint =
        `${API_BASE_URL}/webmasters/v3/sites/${encodeURIComponent(CUPCAL_SEARCH_CONSOLE_PROPERTY)}/searchAnalytics/query`;

      return await Promise.all(validated.urls.map(async (url): Promise<SearchConsoleReportItem> => {
        const [inspection, analytics, queryAnalytics, comparisonQueryAnalytics, countryAnalytics, deviceAnalytics] = await Promise.all([
          googlePost(`${API_BASE_URL}/v1/urlInspection/index:inspect`, token, {
            inspectionUrl: url,
            siteUrl: CUPCAL_SEARCH_CONSOLE_PROPERTY,
            languageCode: "de-DE",
          }),
          googlePost(analyticsEndpoint, token, {
            startDate: validated.startDate,
            endDate: validated.endDate,
            dimensions: ["page"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "page", operator: "equals", expression: url }],
            }],
            rowLimit: 1,
          }),
          googlePost(analyticsEndpoint, token, {
            startDate: validated.startDate,
            endDate: validated.endDate,
            dimensions: ["query"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "page", operator: "equals", expression: url }],
            }],
            rowLimit: 100,
          }),
          googlePost(analyticsEndpoint, token, {
            startDate: validated.comparisonStartDate,
            endDate: validated.comparisonEndDate,
            dimensions: ["query"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "page", operator: "equals", expression: url }],
            }],
            rowLimit: 100,
          }),
          googlePost(analyticsEndpoint, token, {
            startDate: validated.startDate,
            endDate: validated.endDate,
            dimensions: ["country"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "page", operator: "equals", expression: url }],
            }],
            rowLimit: 250,
          }),
          googlePost(analyticsEndpoint, token, {
            startDate: validated.startDate,
            endDate: validated.endDate,
            dimensions: ["device"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "page", operator: "equals", expression: url }],
            }],
            rowLimit: 3,
          }),
        ]);

        const inspectionResult = inspection["inspectionResult"];
        const indexResult = inspectionResult && typeof inspectionResult === "object"
          ? (inspectionResult as Record<string, unknown>)["indexStatusResult"]
          : null;
        const index = indexResult && typeof indexResult === "object"
          ? indexResult as Record<string, unknown>
          : {};
        const rows = Array.isArray(analytics["rows"]) ? analytics["rows"] : [];
        const row = rows[0] && typeof rows[0] === "object"
          ? rows[0] as Record<string, unknown>
          : {};
        const queryRows = Array.isArray(queryAnalytics["rows"]) ? queryAnalytics["rows"] : [];
        const comparisonQueryRows = Array.isArray(comparisonQueryAnalytics["rows"])
          ? comparisonQueryAnalytics["rows"]
          : [];
        const countryRows = Array.isArray(countryAnalytics["rows"]) ? countryAnalytics["rows"] : [];
        const deviceRows = Array.isArray(deviceAnalytics["rows"]) ? deviceAnalytics["rows"] : [];
        const position = row["position"];

        const queries = parseSearchConsoleQueries(queryRows);
        const comparisonQueries = parseSearchConsoleQueries(comparisonQueryRows);
        const currentByQuery = new Map(queries.map((query) => [query.query, query]));
        const comparisonByQuery = new Map(comparisonQueries.map((query) => [query.query, query]));
        const queryNames = new Set([...currentByQuery.keys(), ...comparisonByQuery.keys()]);
        const queryComparisons = [...queryNames].map((query): SearchConsoleQueryComparison => {
          const current = currentByQuery.get(query);
          const comparison = comparisonByQuery.get(query);
          return {
            query,
            currentClicks: current?.clicks ?? null,
            currentImpressions: current?.impressions ?? null,
            comparisonClicks: comparison?.clicks ?? null,
            comparisonImpressions: comparison?.impressions ?? null,
            status: current && comparison ? "both" : current ? "new" : "not_visible",
          };
        }).sort((a, b) =>
          (b.currentImpressions ?? 0) + (b.comparisonImpressions ?? 0)
          - (a.currentImpressions ?? 0) - (a.comparisonImpressions ?? 0)
          || a.query.localeCompare(b.query),
        );

        return {
          url,
          indexing: {
            verdict: asString(index["verdict"]),
            coverageState: asString(index["coverageState"]),
            robotsTxtState: asString(index["robotsTxtState"]),
            indexingState: asString(index["indexingState"]),
            lastCrawlTime: asString(index["lastCrawlTime"]),
            pageFetchState: asString(index["pageFetchState"]),
            googleCanonical: asString(index["googleCanonical"]),
            userCanonical: asString(index["userCanonical"]),
          },
          performance: {
            clicks: asNumber(row["clicks"]),
            impressions: asNumber(row["impressions"]),
            ctr: asNumber(row["ctr"]),
            position: typeof position === "number" && Number.isFinite(position) ? position : null,
          },
          countries: countryRows.flatMap((countryRow): SearchConsoleCountry[] => {
            if (!countryRow || typeof countryRow !== "object") return [];
            const countryData = countryRow as Record<string, unknown>;
            const keys = countryData["keys"];
            const country = Array.isArray(keys) && typeof keys[0] === "string"
              ? keys[0].trim().toUpperCase()
              : "";
            if (!country) return [];
            const countryPosition = countryData["position"];
            return [{
              country,
              clicks: asNumber(countryData["clicks"]),
              impressions: asNumber(countryData["impressions"]),
              ctr: asNumber(countryData["ctr"]),
              position: typeof countryPosition === "number" && Number.isFinite(countryPosition)
                ? countryPosition
                : null,
            }];
          }),
          devices: deviceRows.flatMap((deviceRow): SearchConsoleDevice[] => {
            if (!deviceRow || typeof deviceRow !== "object") return [];
            const deviceData = deviceRow as Record<string, unknown>;
            const keys = deviceData["keys"];
            const device = Array.isArray(keys) && typeof keys[0] === "string"
              ? keys[0].trim().toUpperCase()
              : "";
            if (device !== "DESKTOP" && device !== "MOBILE" && device !== "TABLET") return [];
            const devicePosition = deviceData["position"];
            return [{
              device,
              clicks: asNumber(deviceData["clicks"]),
              impressions: asNumber(deviceData["impressions"]),
              ctr: asNumber(deviceData["ctr"]),
              position: typeof devicePosition === "number" && Number.isFinite(devicePosition)
                ? devicePosition
                : null,
            }];
          }),
          queries,
          queryComparisons,
        };
      }));
    },
  };
}

function parseSearchConsoleQueries(rows: unknown[]): SearchConsoleQuery[] {
  return rows.flatMap((queryRow): SearchConsoleQuery[] => {
    if (!queryRow || typeof queryRow !== "object") return [];
    const queryData = queryRow as Record<string, unknown>;
    const keys = queryData["keys"];
    const query = Array.isArray(keys) && typeof keys[0] === "string"
      ? keys[0].trim()
      : "";
    if (!query) return [];
    const queryPosition = queryData["position"];
    return [{
      query,
      clicks: asNumber(queryData["clicks"]),
      impressions: asNumber(queryData["impressions"]),
      ctr: asNumber(queryData["ctr"]),
      position: typeof queryPosition === "number" && Number.isFinite(queryPosition)
        ? queryPosition
        : null,
    }];
  });
}

const searchConsoleClient = createSearchConsoleClient();

export function isSearchConsoleConfigured(): boolean {
  return searchConsoleClient.isConfigured();
}

export function getSearchConsoleServiceAccountEmail(): string | null {
  try {
    return getServiceAccount(process.env["GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON"]).client_email;
  } catch {
    return null;
  }
}

export function getSearchConsoleReport(
  input: SearchConsoleReportRequest,
): Promise<SearchConsoleReportItem[]> {
  return searchConsoleClient.getReport(input);
}
