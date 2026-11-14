import assert from "node:assert/strict";
import test from "node:test";
import { Webhook } from "standardwebhooks";
import {
  buildAuthVerificationUrl,
  createAuthEmailMessages,
  parseAuthEmailHookPayload,
  verifyAuthEmailHookSignature,
} from "./authEmailHook.ts";

const deletionRedirect =
  "https://cupcal-preview.example/auth/confirm?flow=cupcal-account-deletion&deletion_token=signed.proof";
const validPayload = {
  user: { email: "person@example.org", new_email: "new@example.org" },
  email_data: {
    token: "123456",
    token_hash: "token-hash-new",
    token_new: "654321",
    token_hash_new: "token-hash-current",
    redirect_to: deletionRedirect,
    email_action_type: "magiclink",
  },
};

test("creates an HTTPS Supabase link and preserves the full browser redirect", () => {
  const verification = new URL(buildAuthVerificationUrl(
    "https://cupcal-project.supabase.co",
    "hash.value",
    "magiclink",
    deletionRedirect,
  ));

  assert.equal(verification.protocol, "https:");
  assert.equal(verification.pathname, "/auth/v1/verify");
  assert.equal(verification.searchParams.get("token"), "hash.value");
  assert.equal(verification.searchParams.get("type"), "magiclink");
  assert.equal(verification.searchParams.get("redirect_to"), deletionRedirect);
});

test("preserves the complete native redirect, including its query string", () => {
  const redirect = "cupcal-android://auth/confirm?flow=cupcal-account-deletion&deletion_token=signed.proof";
  const verification = new URL(buildAuthVerificationUrl(
    "https://cupcal-project.supabase.co",
    "hash.value",
    "magiclink",
    redirect,
  ));

  assert.equal(verification.searchParams.get("redirect_to"), redirect);
});

test("rejects non-HTTPS Supabase origins and unsafe redirect schemes", () => {
  assert.throws(() => buildAuthVerificationUrl(
    "http://cupcal-project.supabase.co",
    "hash",
    "magiclink",
    deletionRedirect,
  ));
  assert.throws(() => buildAuthVerificationUrl(
    "https://cupcal-project.supabase.co",
    "hash",
    "magiclink",
    "javascript:alert(1)",
  ));
});

test("routes both secure email-change confirmations to the matching mailbox", () => {
  const payload = parseAuthEmailHookPayload({
    ...validPayload,
    email_data: { ...validPayload.email_data, email_action_type: "email_change" },
  });
  assert.ok(payload);
  const messages = createAuthEmailMessages(payload, "https://cupcal-project.supabase.co");

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.to, "person@example.org");
  assert.equal(messages[1]?.to, "new@example.org");
  assert.equal(new URL(messages[0].text.split("\n\n")[1]).searchParams.get("token"), "token-hash-current");
  assert.equal(new URL(messages[1].text.split("\n\n")[1]).searchParams.get("token"), "token-hash-new");
});

test("sends supported security notifications without requiring or including a token", () => {
  const payload = parseAuthEmailHookPayload({
    user: { email: "person@example.org" },
    email_data: { email_action_type: "password_changed_notification" },
  });
  assert.ok(payload);
  const messages = createAuthEmailMessages(payload, "https://cupcal-project.supabase.co");

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.to, "person@example.org");
  assert.doesNotMatch(messages[0].text, /token|verify/i);
});

test("keeps every documented Auth email action routable", () => {
  const actionTypes = [
    "signup",
    "invite",
    "magiclink",
    "recovery",
    "email_change",
    "email",
    "reauthentication",
    "password_changed_notification",
    "email_changed_notification",
    "phone_changed_notification",
    "identity_linked_notification",
    "identity_unlinked_notification",
    "mfa_factor_enrolled_notification",
    "mfa_factor_unenrolled_notification",
  ];

  for (const email_action_type of actionTypes) {
    const payload = parseAuthEmailHookPayload({
      ...validPayload,
      email_data: { ...validPayload.email_data, email_action_type },
    });
    assert.ok(payload, `Expected ${email_action_type} to be accepted`);
    const messages = createAuthEmailMessages(payload, "https://cupcal-project.supabase.co");
    assert.ok(messages.length > 0, `Expected ${email_action_type} to create a message`);
    assert.ok(messages.every((message) => message.to.includes("@")));
  }
});

test("rejects unknown action types instead of silently dropping Auth emails", () => {
  assert.equal(parseAuthEmailHookPayload({
    user: { email: "person@example.org" },
    email_data: { email_action_type: "unrecognized" },
  }), null);
});

test("verifies Supabase webhook signatures and rejects altered bodies", () => {
  const secret = `v1,whsec_${Buffer.from("test-hook-secret").toString("base64")}`;
  const webhook = new Webhook(secret.slice("v1,whsec_".length));
  const body = JSON.stringify(validPayload);
  const id = "test-webhook-id";
  const timestamp = new Date();
  const headers = {
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": webhook.sign(id, timestamp, body),
  };

  assert.deepEqual(verifyAuthEmailHookSignature(Buffer.from(body), headers, secret), validPayload);
  assert.throws(() => verifyAuthEmailHookSignature(Buffer.from(`${body} `), headers, secret));
});
