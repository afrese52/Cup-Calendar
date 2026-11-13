import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_TOKEN_TTL_SECONDS,
  createAccountDeletionToken,
  getAccountDeletionTokenStatus,
  verifyAccountDeletionToken,
} from "./accountDeletionToken.ts";

const signingKey = "test-only-signing-key";
const userId = "123e4567-e89b-12d3-a456-426614174000";
const now = Date.UTC(2026, 10, 12, 12, 0, 0);

test("signiert ein Bestätigungstoken mit begrenzter Laufzeit für das richtige Konto", () => {
  const created = createAccountDeletionToken(userId, signingKey, now);

  assert.equal(
    created.expiresAt,
    new Date(now + ACCOUNT_DELETION_TOKEN_TTL_SECONDS * 1000).toISOString(),
  );
  assert.equal(verifyAccountDeletionToken(created.token, signingKey, now)?.sub, userId);
});

test("weist manipulierte, fremd signierte und abgelaufene Token ab", () => {
  const created = createAccountDeletionToken(userId, signingKey, now);
  const [payload, signature] = created.token.split(".");

  assert.equal(verifyAccountDeletionToken(`${payload}.invalid`, signingKey, now), null);
  assert.equal(verifyAccountDeletionToken(created.token, "different-key", now), null);
  assert.equal(
    verifyAccountDeletionToken(
      created.token,
      signingKey,
      now + (ACCOUNT_DELETION_TOKEN_TTL_SECONDS + 1) * 1000,
    ),
    null,
  );
  assert.ok(payload);
  assert.ok(signature);
});

test("weist beschädigte Tokenformate zurück", () => {
  assert.equal(verifyAccountDeletionToken("", signingKey, now), null);
  assert.equal(verifyAccountDeletionToken("not.a.valid.token", signingKey, now), null);
  assert.equal(verifyAccountDeletionToken("%%%.%%%", signingKey, now), null);
});

test("gibt einen Löschcode nur für das serverseitig angemeldete Konto frei", () => {
  const { token } = createAccountDeletionToken(userId, signingKey, now);
  assert.equal(getAccountDeletionTokenStatus(token, signingKey, userId, now), "valid");
  assert.equal(
    getAccountDeletionTokenStatus(token, signingKey, "different-account", now),
    "foreign-account",
  );
  assert.equal(getAccountDeletionTokenStatus(token, signingKey, "", now), "invalid");
});

test("gibt abgelaufene oder manipulierte Löschcodes auch für das richtige Konto nicht frei", () => {
  const { token } = createAccountDeletionToken(userId, signingKey, now);
  assert.equal(
    getAccountDeletionTokenStatus(
      token,
      signingKey,
      userId,
      now + ACCOUNT_DELETION_TOKEN_TTL_SECONDS * 1000,
    ),
    "invalid",
  );
  assert.equal(getAccountDeletionTokenStatus(`${token}x`, signingKey, userId, now), "invalid");
});
