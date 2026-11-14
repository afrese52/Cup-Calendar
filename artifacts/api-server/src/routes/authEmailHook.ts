import express, { Router, type IRouter } from "express";
import nodemailer from "nodemailer";
import { createAuthEmailMessages, parseAuthEmailHookPayload, verifyAuthEmailHookSignature } from "../services/authEmailHook";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const rawJsonBody = express.raw({ type: "application/json", limit: "64kb" });

router.post("/v1/hooks/send-email", rawJsonBody, async (req, res): Promise<void> => {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const secret = process.env["SUPABASE_AUTH_SEND_EMAIL_HOOK_SECRET"];
  if (!secret) {
    logger.error("Supabase Send Email Hook secret is not configured");
    res.status(503).json({ error: "Der E-Maildienst ist vorübergehend nicht verfügbar." });
    return;
  }

  const headers = {
    "webhook-id": typeof req.header("webhook-id") === "string" ? req.header("webhook-id")! : "",
    "webhook-timestamp": typeof req.header("webhook-timestamp") === "string" ? req.header("webhook-timestamp")! : "",
    "webhook-signature": typeof req.header("webhook-signature") === "string" ? req.header("webhook-signature")! : "",
  };

  let verifiedPayload: unknown;
  try {
    verifiedPayload = verifyAuthEmailHookSignature(body, headers, secret);
  } catch {
    res.status(401).json({ error: "Die E-Mailanfrage konnte nicht verifiziert werden." });
    return;
  }

  const payload = parseAuthEmailHookPayload(verifiedPayload);
  if (!payload) {
    res.status(400).json({ error: "Die E-Mailanfrage ist ungültig." });
    return;
  }

  const supabaseUrl = process.env["SUPABASE_URL"];
  const smtpUser = process.env["IONOS_SMTP_USER"];
  const smtpPassword = process.env["IONOS_SMTP_PASSWORD"];
  if (!supabaseUrl || !smtpUser || !smtpPassword) {
    logger.error("Supabase Send Email Hook mail settings are incomplete");
    res.status(503).json({ error: "Der E-Maildienst ist vorübergehend nicht verfügbar." });
    return;
  }

  let messages;
  try {
    messages = createAuthEmailMessages(payload, supabaseUrl);
  } catch {
    res.status(400).json({ error: "Die angeforderte Authentifizierungs-E-Mail ist ungültig." });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.ionos.de",
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    for (const message of messages) {
      await transporter.sendMail({
        from: { name: "CupCal", address: smtpUser },
        ...message,
      });
    }
    res.status(200).end();
  } catch {
    // Never log SMTP errors or request data: either may contain authentication material.
    logger.error("IONOS did not accept a Supabase Auth email");
    res.status(502).json({ error: "Die E-Mail konnte nicht versendet werden." });
  } finally {
    transporter.close();
  }
});

export default router;
