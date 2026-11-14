import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { getSnapshotFreshness, parseMhtSchedule } from "../../scripts/dry-run-mht-import.mjs";
import { getAdminImportAccess, getSafeUpcomingEvents, parseAdminEmailAllowlist } from "../services/adminImportAccess";
import {
  getSupabaseAdmin,
  getMhtEventChanges,
  ImportHistoryWriteError,
  listRecentMhtImports,
  recordMhtImportHistory,
  upsertMhtEvents,
  type ExistingMhtEvent,
} from "../services/supabase";
import { MAX_MHT_UPLOAD_BYTES } from "../lib/uploadLimits";
import { getMhtImportSkippedCounts } from "../services/mhtImportCounts";

const uploadText = express.text({ type: "text/plain", limit: MAX_MHT_UPLOAD_BYTES });
const requestBodySchema = z.string().min(1, "Die Datei ist leer.").max(MAX_MHT_UPLOAD_BYTES);
const IMPORT_HISTORY_LIMIT = 20;

type ImportAdminRequest = Request & {
  importAdminUser?: { id: string; email: string | null };
};

class ExistingEventsQueryError extends Error {
  constructor(cause: unknown) {
    super("Vorhandene Termine konnten nicht geprüft werden.", { cause });
    this.name = "ExistingEventsQueryError";
  }
}

async function resolveSignedInUser(req: Request): Promise<
  | { id: string; email: string | null }
  | { error: "unauthenticated" | "unavailable" }
> {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: "unauthenticated" };

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error) {
      req.log.warn(
        { authStatus: error.status, authCode: error.code },
        "Supabase rejected the admin importer session",
      );
      return {
        error: error.status === 401 || error.code === "bad_jwt"
          ? "unauthenticated"
          : "unavailable",
      };
    }
    if (!data.user) return { error: "unauthenticated" };
    return { id: data.user.id, email: data.user.email ?? null };
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
  (req as ImportAdminRequest).importAdminUser = user;
  next();
}

function getSourceHint(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.slice(0, 255);
  } catch {
    return null;
  }
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

function rejectUnconfirmedStaleSnapshot(
  req: Request,
  res: Response,
  snapshotAt: string,
): boolean {
  const freshness = getSnapshotFreshness(snapshotAt);
  if (!freshness.isSnapshotStale || req.query["confirmStaleSnapshot"] === "true") {
    return false;
  }

  res.status(409).json({
    error: "Der Snapshot ist inzwischen älter als 24 Stunden. Prüfe die aktualisierte Vorschau und bestätige den Import erneut.",
    snapshotAt,
    snapshotAgeMs: freshness.snapshotAgeMs,
    isSnapshotStale: true,
  });
  return true;
}

async function findExistingEvents(
  eventIds: string[],
): Promise<Map<string, ExistingMhtEvent>> {
  if (eventIds.length === 0) return new Map();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("fortnite_events")
      .select("id, title, game_mode, team_format, tournament_type, category, start_time, end_time")
      .in("id", eventIds);
    if (error) throw error;
    return new Map((data ?? []).map((row: {
      id: string;
    } & ExistingMhtEvent) => [row.id, {
      title: row.title,
      game_mode: row.game_mode,
      team_format: row.team_format,
      tournament_type: row.tournament_type,
      category: row.category,
      start_time: row.start_time,
      end_time: row.end_time,
    }]));
  } catch (error) {
    throw new ExistingEventsQueryError(error);
  }
}

async function buildPreview(
  sourceText: string,
  scheduleParser: typeof parseSchedule = parseSchedule,
) {
  const schedule = scheduleParser(sourceText);
  const plan = getSafeUpcomingEvents(schedule.events, schedule.snapshotAt);
  const existingEvents = await findExistingEvents(plan.importable.map((event) => event.id));

  return {
    sourceUrl: schedule.sourceUrl,
    snapshotAt: schedule.snapshotAt,
    snapshotAgeMs: schedule.snapshotAgeMs,
    isSnapshotStale: schedule.isSnapshotStale,
    region: schedule.region,
    timeZone: schedule.timeZone,
    cardCount: schedule.cardCount,
    upcomingCount: plan.upcoming.length,
    importableCount: plan.importable.length,
    warningCount: plan.upcoming.length - plan.importable.length,
    invalidCount: schedule.invalidCount,
    newCount: plan.importable.filter((event) => !existingEvents.has(event.id)).length,
    updateCount: plan.importable.filter((event) => existingEvents.has(event.id)).length,
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
      willUpdate: plan.importable.includes(event) && existingEvents.has(event.id),
      ...getMhtEventChanges(event, existingEvents.get(event.id) ?? null),
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

export function createAdminImportRouter(options: {
  scheduleParser?: typeof parseSchedule;
} = {}): IRouter {
  const router: IRouter = Router();
  const scheduleParser = options.scheduleParser ?? parseSchedule;

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
      const preview = await buildPreview(sourceText, scheduleParser);
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
      const preview = await buildPreview(sourceText, scheduleParser);
      if (!preview.schedule.snapshotAt) {
        res.status(400).json({ error: "Der Snapshot-Zeitpunkt fehlt. Diese Datei kann nicht importiert werden." });
        return;
      }
      if (preview.importableEvents.length === 0) {
        res.status(400).json({ error: "Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren." });
        return;
      }
      if (rejectUnconfirmedStaleSnapshot(req, res, preview.schedule.snapshotAt)) return;

      const existingEvents = await findExistingEvents(preview.importableEvents.map((event) => event.id));
      if (rejectUnconfirmedStaleSnapshot(req, res, preview.schedule.snapshotAt)) return;
      await upsertMhtEvents(preview.importableEvents);
      const insertedCount = preview.importableEvents.filter((event) => !existingEvents.has(event.id)).length;
      const updatedCount = preview.importableEvents.length - insertedCount;
      const adminUser = (req as ImportAdminRequest).importAdminUser;
      if (!adminUser?.email) {
        throw new Error("Die Admin-Anmeldung enthält keine Konto-E-Mail-Adresse.");
      }
      const skippedCounts = getMhtImportSkippedCounts({
        warningCount: preview.warningCount,
        skippedPastCount: preview.skippedPastCount,
        invalidCount: preview.invalidCount,
      });
      await recordMhtImportHistory({
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        sourceHint: getSourceHint(preview.sourceUrl),
        insertedCount,
        updatedCount,
        skippedCount: skippedCounts.skippedCount,
        skippedWarningCount: skippedCounts.skippedWarningCount,
        skippedPastCount: skippedCounts.skippedPastCount,
        skippedInvalidCount: skippedCounts.skippedInvalidCount,
      });

      res.json({
        importedCount: preview.importableEvents.length,
        insertedCount,
        updatedCount,
        ...skippedCounts,
      });
    } catch (error) {
      req.log.error("MHT schedule import failed");
      if (error instanceof ImportHistoryWriteError) {
        res.status(503).json({
          error: "Die Termine wurden gespeichert, aber der Historieneintrag fehlt. Bitte wende dich an die Administration, bevor du erneut importierst.",
        });
        return;
      }
      res.status(503).json({
        error: "Der Import konnte nicht vollständig abgeschlossen werden. Prüfe die Termine und starte den Import bei Bedarf erneut.",
      });
    }
  },
);

router.get("/v1/admin/events/import/history", requireImportAdmin, async (req, res): Promise<void> => {
  try {
    const entries = await listRecentMhtImports(IMPORT_HISTORY_LIMIT);
    res.setHeader("Cache-Control", "no-store");
    res.json({ entries });
  } catch (error) {
    req.log.error({ err: error }, "Could not load admin MHT import history");
    res.status(503).json({ error: "Die Importhistorie kann gerade nicht geladen werden." });
  }
});

  return router;
}

export default createAdminImportRouter();
