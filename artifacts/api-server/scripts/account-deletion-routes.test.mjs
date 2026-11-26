import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { createAccountDeletionToken, verifyAccountDeletionToken } from "../src/services/accountDeletionToken.ts";

const supabaseUrl = "https://account-deletion-test.supabase.invalid";
const serviceRoleKey = "test-service-role-key";
const currentSigningKey = "current-test-signing-key-for-account-deletion";
const previousSigningKey = "previous-test-signing-key-for-account-deletion";
const authenticatedUserId = "123e4567-e89b-12d3-a456-426614174000";
const secondAuthenticatedUserId = "123e4567-e89b-12d3-a456-426614174001";
const accountIdsByAccessToken = new Map([
  ["test-user-access-token", authenticatedUserId],
  ["account-a-access-token", authenticatedUserId],
  ["account-b-access-token", secondAuthenticatedUserId],
]);

function saveEnvironmentValue(name) {
  return [name, process.env[name]];
}

function restoreEnvironmentValue([name, value]) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine an available test port.");
  }
  await new Promise((resolve, reject) => {
    probe.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

test("beide Kontolösch-Endpunkte antworten mit fehlendem oder zu schwachem Schlüssel mit 503", async () => {
  const originalFetch = globalThis.fetch;
  const savedEnvironment = [
    saveEnvironmentValue("PORT"),
    saveEnvironmentValue("SUPABASE_URL"),
    saveEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY"),
    saveEnvironmentValue("CUPCAL_ACCOUNT_DELETION_SIGNING_KEY"),
    saveEnvironmentValue("CUPCAL_ACCOUNT_DELETION_PREVIOUS_SIGNING_KEY"),
  ];
  const deletionRequests = [];
  const port = await getAvailablePort();

  process.env.PORT = String(port);
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  delete process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const authorization = new Headers(init?.headers).get("authorization") ?? "";
    if (url.startsWith(supabaseUrl)) {
      if (/\/auth\/v1\/admin\/users(?:\/|$)/.test(url)) deletionRequests.push(url);
      if (/\/auth\/v1\/admin\/users(?:\/|$)/.test(url)) {
        return Response.json({
          id: authenticatedUserId,
          aud: "authenticated",
          role: "authenticated",
          email: "account-deletion-test@example.invalid",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        });
      }
      if (url.endsWith("/auth/v1/user")) {
        const userId = accountIdsByAccessToken.get(authorization.replace(/^Bearer\s+/i, ""));
        if (!userId) return Response.json({ message: "Invalid session" }, { status: 401 });
        return Response.json({
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: `${userId}@example.invalid`,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        });
      }
      return Response.json({ message: "Unexpected Supabase request" }, { status: 500 });
    }
    return originalFetch(input, init);
  };

  let server;
  try {
    ({ server } = await import("../dist/index.mjs"));
    if (!server.listening) {
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
    }

    const baseUrl = `http://127.0.0.1:${port}/api/v1/account/deletion`;
    const headers = { Authorization: "Bearer test-user-access-token" };
    for (const invalidKey of [undefined, "too-short"]) {
      if (invalidKey === undefined) delete process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY;
      else process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY = invalidKey;

      const requestResponse = await originalFetch(`${baseUrl}/request`, {
        method: "POST",
        headers,
      });
      assert.equal(requestResponse.status, 503);
      assert.deepEqual(await requestResponse.json(), {
        error: "Der Kontodienst ist vorübergehend nicht verfügbar.",
      });

      const confirmResponse = await originalFetch(`${baseUrl}/confirm`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationToken: "valid-shaped-but-unverifiable-token" }),
      });
      assert.equal(confirmResponse.status, 503);
      assert.deepEqual(await confirmResponse.json(), {
        error: "Das Konto konnte gerade nicht gelöscht werden.",
      });
    }

    process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY = currentSigningKey;
    process.env.CUPCAL_ACCOUNT_DELETION_PREVIOUS_SIGNING_KEY = previousSigningKey;

    const issueResponse = await originalFetch(`${baseUrl}/request`, {
      method: "POST",
      headers,
    });
    assert.equal(issueResponse.status, 200);
    const issued = await issueResponse.json();
    assert.equal(verifyAccountDeletionToken(issued.confirmationToken, currentSigningKey)?.sub, authenticatedUserId);
    assert.equal(verifyAccountDeletionToken(issued.confirmationToken, previousSigningKey), null);

    const oldLink = createAccountDeletionToken(authenticatedUserId, previousSigningKey);
    const confirmResponse = await originalFetch(`${baseUrl}/confirm`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationToken: oldLink.token }),
    });
    assert.equal(confirmResponse.status, 204);
    assert.ok(deletionRequests.length > 0);
    assert.ok(deletionRequests.every((url) => url.endsWith(`/${authenticatedUserId}`)));

    const accountAHeaders = { Authorization: "Bearer account-a-access-token" };
    const accountBHeaders = { Authorization: "Bearer account-b-access-token" };
    const parallelResponses = await Promise.all([
      originalFetch(`${baseUrl}/request`, { method: "POST", headers: accountAHeaders }),
      originalFetch(`${baseUrl}/request`, { method: "POST", headers: accountBHeaders }),
      originalFetch(`${baseUrl}/request`, { method: "POST", headers: accountAHeaders }),
      originalFetch(`${baseUrl}/request`, { method: "POST", headers: accountBHeaders }),
    ]);
    assert.deepEqual(
      parallelResponses.map((response) => response.status),
      [200, 200, 200, 200],
      "Zwei unabhängige Sitzungen müssen gleichzeitig und wiederholt Links anfordern können.",
    );
    assert.ok(
      parallelResponses.every((response) => response.headers.get("cache-control") === "no-store"),
      "Bestätigungslinks dürfen nicht zwischengespeichert werden.",
    );

    const parallelLinks = await Promise.all(parallelResponses.map((response) => response.json()));
    assert.equal(
      new Set(parallelLinks.map((link) => link.confirmationToken)).size,
      parallelLinks.length,
      "Jede wiederholte Anforderung muss einen eigenen Bestätigungslink erhalten.",
    );
    assert.deepEqual(
      parallelLinks.map((link) => verifyAccountDeletionToken(link.confirmationToken, currentSigningKey)?.sub),
      [authenticatedUserId, secondAuthenticatedUserId, authenticatedUserId, secondAuthenticatedUserId],
      "Jeder parallele Link muss ausschließlich dem Konto seiner Sitzung gehören.",
    );
    assert.ok(parallelLinks.every((link) => Number.isFinite(Date.parse(link.expiresAt))));

    const deletionsBeforeForeignConfirmations = deletionRequests.length;
    const foreignConfirmations = await Promise.all([
      originalFetch(`${baseUrl}/confirm`, {
        method: "POST",
        headers: { ...accountBHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationToken: parallelLinks[0].confirmationToken }),
      }),
      originalFetch(`${baseUrl}/confirm`, {
        method: "POST",
        headers: { ...accountAHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationToken: parallelLinks[1].confirmationToken }),
      }),
    ]);
    assert.deepEqual(
      foreignConfirmations.map((response) => response.status),
      [403, 403],
      "Ein Konto darf keinen parallel angeforderten Link des anderen Kontos bestätigen.",
    );
    assert.equal(
      deletionRequests.length,
      deletionsBeforeForeignConfirmations,
      "Abgelehnte fremde Links dürfen keine Kontolöschung auslösen.",
    );
  } finally {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    globalThis.fetch = originalFetch;
    savedEnvironment.forEach(restoreEnvironmentValue);
  }
});
