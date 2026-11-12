import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCOUNT_DELETION_TOKEN_TTL_SECONDS = 30 * 60;

type AccountDeletionClaims = {
  sub: string;
  exp: number;
  nonce: string;
};

function signPayload(payload: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(payload).digest("base64url");
}

export function createAccountDeletionToken(
  userId: string,
  signingKey: string,
  now = Date.now(),
): { token: string; expiresAt: string } {
  if (!userId || !signingKey) {
    throw new Error("A user and signing key are required.");
  }

  const expiresAtSeconds = Math.floor(now / 1000) + ACCOUNT_DELETION_TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: expiresAtSeconds,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const token = `${payload}.${signPayload(payload, signingKey)}`;

  return {
    token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

export function verifyAccountDeletionToken(
  token: string,
  signingKey: string,
  now = Date.now(),
): AccountDeletionClaims | null {
  if (!signingKey || token.length > 2048) return null;

  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return null;
  }

  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = Buffer.from(signPayload(payload, signingKey), "base64url");
  const provided = Buffer.from(signature, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AccountDeletionClaims>;
    if (
      typeof claims.sub !== "string"
      || !claims.sub
      || typeof claims.exp !== "number"
      || !Number.isInteger(claims.exp)
      || claims.exp <= Math.floor(now / 1000)
      || typeof claims.nonce !== "string"
      || !/^[A-Za-z0-9_-]{20,}$/.test(claims.nonce)
    ) {
      return null;
    }
    return claims as AccountDeletionClaims;
  } catch {
    return null;
  }
}
