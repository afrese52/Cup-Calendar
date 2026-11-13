import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { createAccountDeletionToken, getAccountDeletionTokenStatus } from "../services/accountDeletionToken";
import { getSupabaseAdmin } from "../services/supabase";

const router: IRouter = Router();
const confirmationSchema = z.object({
  confirmationToken: z.string().min(1).max(2048),
});

type AccountUser = { id: string; email: string | null };
type UserResolution =
  | { user: AccountUser }
  | { error: "unauthenticated" | "unavailable" };

async function resolveSignedInUser(req: Request): Promise<UserResolution> {
  const token = (req.header("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: "unauthenticated" };

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      if (error && error.status !== 401 && error.code !== "bad_jwt") {
        req.log.warn(
          { authStatus: error.status, authCode: error.code },
          "Supabase could not verify the account deletion session",
        );
        return { error: "unavailable" };
      }
      return { error: "unauthenticated" };
    }
    return { user: { id: data.user.id, email: data.user.email ?? null } };
  } catch {
    req.log.error("Could not verify the account deletion session");
    return { error: "unavailable" };
  }
}

function respondToAuthFailure(res: Response, error: "unauthenticated" | "unavailable"): void {
  res.status(error === "unavailable" ? 503 : 401).json({
    error: error === "unavailable"
      ? "Die Anmeldung kann gerade nicht geprüft werden."
      : "Bitte melde dich zuerst an.",
  });
}

router.post("/v1/account/deletion/request", async (req, res): Promise<void> => {
  const resolution = await resolveSignedInUser(req);
  if ("error" in resolution) {
    respondToAuthFailure(res, resolution.error);
    return;
  }

  const signingKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!signingKey) {
    req.log.error("Account deletion is unavailable because its signing key is not configured");
    res.status(503).json({ error: "Der Kontodienst ist vorübergehend nicht verfügbar." });
    return;
  }

  try {
    const confirmation = createAccountDeletionToken(resolution.user.id, signingKey);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      confirmationToken: confirmation.token,
      expiresAt: confirmation.expiresAt,
    });
  } catch {
    req.log.error("Could not create an account deletion confirmation token");
    res.status(503).json({ error: "Der Bestätigungslink konnte nicht erstellt werden." });
  }
});

router.post("/v1/account/deletion/confirm", async (req, res): Promise<void> => {
  const resolution = await resolveSignedInUser(req);
  if ("error" in resolution) {
    respondToAuthFailure(res, resolution.error);
    return;
  }

  const parsedBody = confirmationSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Der Bestätigungslink ist ungültig oder abgelaufen." });
    return;
  }

  const signingKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!signingKey) {
    req.log.error("Account deletion is unavailable because its signing key is not configured");
    res.status(503).json({ error: "Das Konto konnte gerade nicht gelöscht werden." });
    return;
  }

  const tokenStatus = getAccountDeletionTokenStatus(
    parsedBody.data.confirmationToken,
    signingKey,
    resolution.user.id,
  );
  if (tokenStatus === "invalid") {
    res.status(400).json({ error: "Der Bestätigungslink ist ungültig oder abgelaufen. Fordere bitte einen neuen an." });
    return;
  }
  if (tokenStatus === "foreign-account") {
    res.status(403).json({ error: "Der Bestätigungslink gehört zu einem anderen Konto." });
    return;
  }

  try {
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(resolution.user.id);
    if (error) {
      req.log.error(
        { authStatus: error.status, authCode: error.code },
        "Supabase could not delete the confirmed account",
      );
      res.status(503).json({ error: "Das Konto konnte gerade nicht gelöscht werden. Bitte versuche es erneut." });
      return;
    }
    res.status(204).end();
  } catch {
    req.log.error("Could not delete the confirmed account");
    res.status(503).json({ error: "Das Konto konnte gerade nicht gelöscht werden. Bitte versuche es erneut." });
  }
});

export default router;
