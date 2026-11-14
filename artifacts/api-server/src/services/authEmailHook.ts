import { Webhook } from "standardwebhooks";
import { z } from "zod";

const emailActionTypes = [
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
] as const;

const hookPayloadSchema = z.object({
  user: z.object({
    email: z.string().optional(),
    new_email: z.string().optional(),
  }).passthrough(),
  email_data: z.object({
    token: z.string().optional(),
    token_hash: z.string().optional(),
    redirect_to: z.string().optional(),
    email_action_type: z.enum(emailActionTypes),
    token_new: z.string().optional(),
    token_hash_new: z.string().optional(),
  }).passthrough(),
}).passthrough();

export type AuthEmailHookPayload = z.infer<typeof hookPayloadSchema>;

export type AuthEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const verificationActionCopy = {
  signup: {
    subject: "Bestätige deine E-Mail-Adresse für CupCal",
    intro: "Bestätige deine E-Mail-Adresse, um dein CupCal-Konto einzurichten.",
    button: "E-Mail-Adresse bestätigen",
  },
  invite: {
    subject: "Du wurdest zu CupCal eingeladen",
    intro: "Öffne den Link, um deine Einladung zu CupCal anzunehmen.",
    button: "Einladung annehmen",
  },
  magiclink: {
    subject: "Dein Anmeldelink für CupCal",
    intro: "Öffne den Link, um dich bei CupCal anzumelden.",
    button: "Bei CupCal anmelden",
  },
  recovery: {
    subject: "Setze dein CupCal-Passwort zurück",
    intro: "Öffne den Link, um ein neues Passwort für dein CupCal-Konto festzulegen.",
    button: "Passwort zurücksetzen",
  },
  email_change: {
    subject: "Bestätige deine E-Mailänderung bei CupCal",
    intro: "Öffne den Link, um die E-Mailänderung für dein CupCal-Konto zu bestätigen.",
    button: "E-Mailänderung bestätigen",
  },
  email: {
    subject: "Bestätige deine E-Mail-Adresse für CupCal",
    intro: "Bestätige deine E-Mail-Adresse für CupCal.",
    button: "E-Mail-Adresse bestätigen",
  },
  reauthentication: {
    subject: "Bestätige deine Anmeldung bei CupCal",
    intro: "Gib den Bestätigungscode ein, um deine Anmeldung bei CupCal zu bestätigen.",
    button: "Anmeldung bestätigen",
  },
} as const;

const notificationCopy = {
  password_changed_notification: {
    subject: "Dein CupCal-Passwort wurde geändert",
    text: "Das Passwort für dein CupCal-Konto wurde geändert. Wenn du diese Änderung nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
  email_changed_notification: {
    subject: "Deine CupCal-E-Mail-Adresse wurde geändert",
    text: "Die E-Mail-Adresse deines CupCal-Kontos wurde geändert. Wenn du diese Änderung nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
  phone_changed_notification: {
    subject: "Deine CupCal-Telefonnummer wurde geändert",
    text: "Die Telefonnummer deines CupCal-Kontos wurde geändert. Wenn du diese Änderung nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
  identity_linked_notification: {
    subject: "Ein Anmeldedienst wurde mit CupCal verknüpft",
    text: "Ein zusätzlicher Anmeldedienst wurde mit deinem CupCal-Konto verknüpft. Wenn du das nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
  identity_unlinked_notification: {
    subject: "Ein Anmeldedienst wurde von CupCal getrennt",
    text: "Ein Anmeldedienst wurde von deinem CupCal-Konto getrennt. Wenn du das nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
  mfa_factor_enrolled_notification: {
    subject: "Zwei-Faktor-Anmeldung für CupCal aktiviert",
    text: "Für dein CupCal-Konto wurde eine Zwei-Faktor-Anmeldemethode aktiviert. Wenn du das nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
  mfa_factor_unenrolled_notification: {
    subject: "Zwei-Faktor-Anmeldung für CupCal geändert",
    text: "Eine Zwei-Faktor-Anmeldemethode wurde von deinem CupCal-Konto entfernt. Wenn du das nicht veranlasst hast, sichere dein Konto bitte umgehend.",
  },
} as const;

const notificationActionTypes = new Set<string>(Object.keys(notificationCopy));

function requiredEmail(value: string | undefined): string {
  const parsed = z.string().email().safeParse(value);
  if (!parsed.success) {
    throw new Error("A valid recipient address is required.");
  }
  return parsed.data;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return replacements[character]!;
  });
}

function validateRedirectTo(redirectTo: string): void {
  let parsed: URL;
  try {
    parsed = new URL(redirectTo);
  } catch {
    throw new Error("A valid authentication redirect is required.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "cupcal-android:") {
    throw new Error("The authentication redirect scheme is not allowed.");
  }
}

export function buildAuthVerificationUrl(
  supabaseUrl: string,
  tokenHash: string,
  actionType: string,
  redirectTo: string,
): string {
  let projectUrl: URL;
  try {
    projectUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("The Supabase project URL is invalid.");
  }
  if (projectUrl.protocol !== "https:" || !projectUrl.hostname) {
    throw new Error("The Supabase project URL must use HTTPS.");
  }
  if (!tokenHash || !actionType || !redirectTo) {
    throw new Error("The authentication verification data is incomplete.");
  }

  validateRedirectTo(redirectTo);
  const verificationUrl = new URL("/auth/v1/verify", projectUrl.origin);
  verificationUrl.searchParams.set("token", tokenHash);
  verificationUrl.searchParams.set("type", actionType);
  // Keep the complete redirect, including its query parameters and signed deletion proof.
  verificationUrl.searchParams.set("redirect_to", redirectTo);
  return verificationUrl.toString();
}

function createVerificationMessage(
  input: {
    recipient: string | undefined;
    token: string | undefined;
    tokenHash: string | undefined;
  },
  payload: AuthEmailHookPayload,
  supabaseUrl: string,
): AuthEmailMessage {
  const { email_action_type: actionType, redirect_to: redirectTo } = payload.email_data;
  const copy = verificationActionCopy[actionType as keyof typeof verificationActionCopy];
  if (!copy) {
    throw new Error("The email action type cannot be sent as a verification email.");
  }
  const to = requiredEmail(input.recipient);
  const link = buildAuthVerificationUrl(
    supabaseUrl,
    input.tokenHash ?? "",
    actionType,
    redirectTo ?? "",
  );
  const escapedLink = escapeHtml(link);
  const codeText = input.token ? `\n\nAlternativer Bestätigungscode: ${input.token}` : "";
  const codeHtml = input.token
    ? `<p>Alternativer Bestätigungscode: <strong>${escapeHtml(input.token)}</strong></p>`
    : "";
  const text = `${copy.intro}\n\n${link}${codeText}\n\nWenn du diese Nachricht nicht angefordert hast, kannst du sie ignorieren.`;
  const html = [
    "<!doctype html><html lang=\"de\"><body>",
    `<p>${escapeHtml(copy.intro)}</p>`,
    `<p><a href="${escapedLink}">${escapeHtml(copy.button)}</a></p>`,
    codeHtml,
    "<p>Wenn du diese Nachricht nicht angefordert hast, kannst du sie ignorieren.</p>",
    "</body></html>",
  ].join("");

  return { to, subject: copy.subject, text, html };
}

function createNotificationMessage(payload: AuthEmailHookPayload): AuthEmailMessage {
  const actionType = payload.email_data.email_action_type as keyof typeof notificationCopy;
  const copy = notificationCopy[actionType];
  return {
    to: requiredEmail(payload.user.email),
    subject: copy.subject,
    text: copy.text,
    html: `<!doctype html><html lang="de"><body><p>${escapeHtml(copy.text)}</p></body></html>`,
  };
}

export function parseAuthEmailHookPayload(value: unknown): AuthEmailHookPayload | null {
  const parsed = hookPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createAuthEmailMessages(
  payload: AuthEmailHookPayload,
  supabaseUrl: string,
): AuthEmailMessage[] {
  const actionType = payload.email_data.email_action_type;
  if (notificationActionTypes.has(actionType)) {
    return [createNotificationMessage(payload)];
  }

  if (actionType === "email_change") {
    const { token, token_hash: tokenHash, token_new: tokenNew, token_hash_new: tokenHashNew } = payload.email_data;
    if (tokenHashNew && tokenHash && payload.user.email && payload.user.new_email) {
      return [
        createVerificationMessage({
          recipient: payload.user.email,
          token,
          tokenHash: tokenHashNew,
        }, payload, supabaseUrl),
        createVerificationMessage({
          recipient: payload.user.new_email,
          token: tokenNew,
          tokenHash,
        }, payload, supabaseUrl),
      ];
    }

    return [createVerificationMessage({
      recipient: payload.user.new_email ?? payload.user.email,
      token: token ?? tokenNew,
      tokenHash: tokenHash ?? tokenHashNew,
    }, payload, supabaseUrl)];
  }

  return [createVerificationMessage({
    recipient: payload.user.email,
    token: payload.email_data.token,
    tokenHash: payload.email_data.token_hash,
  }, payload, supabaseUrl)];
}

export function verifyAuthEmailHookSignature(
  payload: Buffer,
  headers: Record<string, string>,
  configuredSecret: string,
): unknown {
  const prefix = "v1,whsec_";
  if (!configuredSecret.startsWith(prefix)) {
    throw new Error("The Supabase Send Email Hook secret is malformed.");
  }
  const secret = configuredSecret.slice(prefix.length);
  return new Webhook(secret).verify(payload, headers);
}
