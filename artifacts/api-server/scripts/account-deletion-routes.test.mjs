import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";

const supabaseUrl = "https://account-deletion-test.supabase.invalid";
const serviceRoleKey = "test-service-role-key";
const authenticatedUserId = "123e4567-e89b-12d3-a456-426614174000";

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
  ];
  const deletionRequests = [];
  const port = await getAvailablePort();

  process.env.PORT = String(port);
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  delete process.env.CUPCAL_ACCOUNT_DELETION_SIGNING_KEY;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(supabaseUrl)) {
      if (/\/auth\/v1\/admin\/users(?:\/|$)/.test(url)) deletionRequests.push(url);
      if (url.endsWith("/auth/v1/user")) {
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
    assert.deepEqual(deletionRequests, []);
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
