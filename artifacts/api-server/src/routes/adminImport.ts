import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { parseMhtSchedule } from "../../scripts/dry-run-mht-import.mjs";
import { getAdminImportAccess, getSafeUpcomingEvents, parseAdminEmailAllowlist } from "../services/adminImportAccess";
import { getSupabaseAdmin } from "../services/supabase";

const router: IRouter = Router();
const uploadText = express.text({ type: "text/plain", limit: "6mb" });
const requestBodySchema = z.string().min(1, "Die Datei ist leer.").max(6 * 1024 * 1024);

class ExistingEventsQueryError extends Error {
  constructor(cause: unknown) {
    super("Vorhandene Termine konnten nicht geprüft werden.", { cause });
    this.name = "ExistingEventsQueryError";
  }
}

async function resolveSignedInUser(req: Request): Promise<
  | { email: string | null }
  | { error: "unauthenticated" | "unavailable" }
> {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: "unauthenticated" };

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return { error: "unauthenticated" };
    return { email: data.user.email ?? null };
  } catch (error) {
    req.log.error({ err: error }, "Could not verify admin importer session");
    return { error: "unavailable" };
  }
}

async function requireImportAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await resolveSignedInUser(req);
  if ("error" in user) {
    res.status(user.error === "unavailable" ? 503 : 401).json({
      error: user.error === "unavailable"
        ? "Die Anmeldung kann gerade nicht geprüft werden."
        : "Bitte melde dich zuerst an.",
    });
    return;
  }

  const access = getAdminImportAccess(
    user.email,
    parseAdminEmailAllowlist(process.env["CUPCAL_IMPORT_ADMIN_EMAILS"]),
  );
  if (!access.authorized) {
    res.status(403).json({
      authorized: false,
      reason: access.reason,
      error: "Dieses Konto darf keine Termine importieren.",
    });
    return;
  }
  next();
}

function parseUploadBody(req: Request, res: Response): string | null {
  const parsed = requestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ungültige Datei." });
    return null;
  }
  return parsed.data;
}

function parseSchedule(sourceText: string) {
  try {
    return parseMhtSchedule(Buffer.from(sourceText, "utf8"), { timeZone: "Europe/Berlin" });
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Die MHT-Datei konnte nicht gelesen werden.",
    );
  }
}

async function findExistingEventIds(
  eventIds: string[],
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("fortnite_events")
      .select("id")
      .in("id", eventIds);
    if (error) throw error;
    return new Set((data ?? []).map((row: { id: string }) => row.id));
  } catch (error) {
    throw new ExistingEventsQueryError(error);
  }
}

async function buildPreview(sourceText: string) {
  const schedule = parseSchedule(sourceText);
  const plan = getSafeUpcomingEvents(schedule.events, schedule.snapshotAt);
  const existingIds = await findExistingEventIds(plan.importable.map((event) => event.id));

  return {
    sourceUrl: schedule.sourceUrl,
    snapshotAt: schedule.snapshotAt,
    region: schedule.region,
    timeZone: schedule.timeZone,
    cardCount: schedule.cardCount,
    upcomingCount: plan.upcoming.length,
    importableCount: plan.importable.length,
    warningCount: plan.upcoming.length - plan.importable.length,
    invalidCount: schedule.invalidCount,
    newCount: plan.importable.filter((event) => !existingIds.has(event.id)).length,
    updateCount: plan.importable.filter((event) => existingIds.has(event.id)).length,
    events: plan.upcoming.map((event) => ({
      id: event.id,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      gameMode: event.game_mode,
      teamFormat: event.team_format,
      tournamentType: event.tournament_type,
      category: event.category,
      warnings: event.review_warnings,
      willUpdate: plan.importable.includes(event) && existingIds.has(event.id),
    })),
    issues: schedule.issues.map((issue) => ({
      title: issue.title ?? null,
      errors: issue.errors,
    })),
    schedule,
    importableEvents: plan.importable,
    skippedPastCount: plan.skippedPastCount,
  };
}

router.get("/v1/admin/import-access", async (req, res): Promise<void> => {
  const user = await resolveSignedInUser(req);
  if ("error" in user) {
    res.status(user.error === "unavailable" ? 503 : 401).json({
      error: user.error === "unavailable"
        ? "Die Anmeldung kann gerade nicht geprüft werden."
        : "Bitte melde dich zuerst an.",
    });
    return;
  }

  res.json(
    getAdminImportAccess(
      user.email,
      parseAdminEmailAllowlist(process.env["CUPCAL_IMPORT_ADMIN_EMAILS"]),
    ),
  );
});

router.post(
  "/v1/admin/events/import/preview",
  requireImportAdmin,
  uploadText,
  async (req, res, next): Promise<void> => {
    const sourceText = parseUploadBody(req, res);
    if (sourceText === null) return;
    try {
      const preview = await buildPreview(sourceText);
      const { schedule: _schedule, importableEvents: _events, skippedPastCount: _skipped, ...response } = preview;
      res.json(response);
    } catch (error) {
      if (error instanceof ExistingEventsQueryError) {
        req.log.error({ err: error }, "Could not inspect existing events for MHT import");
        res.status(503).json({ error: "Vorhandene Termine können gerade nicht geprüft werden." });
        return;
      }
      res.status(400).json({
        error: error instanceof Error ? error.message : "Die MHT-Datei konnte nicht verarbeitet werden.",
      });
    }
  },
);

router.post(
  "/v1/admin/events/import",
  requireImportAdmin,
  uploadText,
  async (req, res): Promise<void> => {
    const sourceText = parseUploadBody(req, res);
    if (sourceText === null) return;

    try {
      const preview = await buildPreview(sourceText);
      if (!preview.schedule.snapshotAt) {
        res.status(400).json({ error: "Der Snapshot-Zeitpunkt fehlt. Diese Datei kann nicht importiert werden." });
        return;
      }
      if (preview.importableEvents.length === 0) {
        res.status(400).json({ error: "Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren." });
        return;
      }

      const admin = getSupabaseAdmin();
      const existingIds = await findExistingEventIds(preview.importableEvents.map((event) => event.id));
      const insertRows = preview.importableEvents
        .filter((event) => !existingIds.has(event.id))
        .map((event) => ({
          id: event.id,
          title: event.title,
          description: event.description,
          poster_url: event.poster_url,
          region: event.region,
          game_mode: event.game_mode,
          team_format: event.team_format,
          tournament_type: event.tournament_type,
          category: event.category,
          start_time: event.start_time,
          end_time: event.end_time,
          is_featured: event.is_featured,
        }));

      if (insertRows.length > 0) {
        const { error } = await admin.from("fortnite_events").insert(insertRows);
        if (error) throw error;
      }

      let updatedCount = 0;
      for (const event of preview.importableEvents) {
        if (!existingIds.has(event.id)) continue;
        const { error } = await admin
          .from("fortnite_events")
          .update({
            title: event.title,
            region: event.region,
            game_mode: event.game_mode,
            team_format: event.team_format,
            tournament_type: event.tournament_type,
            category: event.category,
            start_time: event.start_time,
            end_time: event.end_time,
          })
          .eq("id", event.id);
        if (error) throw error;
        updatedCount += 1;
      }

      res.json({
        importedCount: insertRows.length + updatedCount,
        insertedCount: insertRows.length,
        updatedCount,
        skippedWarningCount: preview.warningCount,
        skippedPastCount: preview.skippedPastCount,
      });
    } catch (error) {
      req.log.error({ err: error }, "MHT schedule import failed");
      res.status(503).json({
        error: "Der Import konnte nicht vollständig abgeschlossen werden. Prüfe die Termine und starte den Import bei Bedarf erneut.",
      });
    }
  },
);

export default router;
