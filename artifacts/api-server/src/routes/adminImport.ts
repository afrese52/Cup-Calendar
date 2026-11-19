import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { getSnapshotFreshness, parseMhtSchedule } from "../../scripts/dry-run-mht-import.mjs";
import { parseIcsSchedule } from "../../scripts/ics-import.mjs";
import { getAdminImportAccess, getSafeUpcomingEvents, parseAdminEmailAllowlist } from "../services/adminImportAccess";
import {
  getSupabaseAdmin,
  getMhtEventChanges,
  isMissingEventMetadataColumns,
  EventMetadataMigrationRequiredError,
  listRecentMhtImports,
  commitMhtImport,
  MhtImportTransactionError,
  ALLOWED_TOURNAMENT_TYPES,
  getEventTournamentType,
  TournamentTypeCorrectionError,
  TournamentTypeCorrectionLogError,
  updateEventTournamentType,
  listRecentTournamentTypeCorrections,
  type MhtImportEvent,
  type ExistingMhtEvent,
} from "../services/supabase";
import { MAX_MHT_UPLOAD_BYTES } from "../lib/uploadLimits";
import { getMhtImportSkippedCounts } from "../services/mhtImportCounts";

const uploadText = express.text({ type: "text/plain", limit: MAX_MHT_UPLOAD_BYTES });
const requestBodySchema = z.string().min(1, "Die Datei ist leer.").max(MAX_MHT_UPLOAD_BYTES);
const importDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Das Datum muss im Format JJJJ-MM-TT angegeben werden.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month! - 1
      && parsed.getUTCDate() === day;
  }, "Das Datum ist ungültig.");
const tournamentTypePreviewSchema = z.object({
  eventId: z.string().trim().min(1).max(255),
  tournamentType: z.enum(ALLOWED_TOURNAMENT_TYPES),
}).strict();
const tournamentTypeUpdateSchema = z.object({
  eventId: z.string().trim().min(1).max(255),
  expectedTournamentType: z.enum(ALLOWED_TOURNAMENT_TYPES),
  tournamentType: z.enum(ALLOWED_TOURNAMENT_TYPES),
}).strict();
const IMPORT_HISTORY_LIMIT = 20;
const TOURNAMENT_TYPE_CORRECTION_HISTORY_LIMIT = 50;

type ImportDateRange = { startDate: string; endDate: string };
type ParsedSchedule = {
  sourceUrl: string | null;
  snapshotAt: string | null;
  snapshotAgeMs: number | null;
  isSnapshotStale: boolean;
  region: string;
  timeZone: string;
  cardCount: number;
  validCount: number;
  invalidCount: number;
  upcomingAtSnapshot: number | null;
  events: MhtImportEvent[];
  issues: { id?: string | null; title?: string | null; errors: string[] }[];
};

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

function parseImportDateRange(req: Request): { range: ImportDateRange | null; error: string | null } {
  const rawStart = req.query["startDate"];
  const rawEnd = req.query["endDate"];
  if (rawStart === undefined && rawEnd === undefined) return { range: null, error: null };
  if (typeof rawStart !== "string" || typeof rawEnd !== "string") {
    return { range: null, error: "Start- und Enddatum müssen gemeinsam angegeben werden." };
  }

  const start = importDateSchema.safeParse(rawStart);
  const end = importDateSchema.safeParse(rawEnd);
  if (!start.success) return { range: null, error: start.error.issues[0]?.message ?? "Das Startdatum ist ungültig." };
  if (!end.success) return { range: null, error: end.error.issues[0]?.message ?? "Das Enddatum ist ungültig." };
  if (start.data > end.data) return { range: null, error: "Das Startdatum darf nicht nach dem Enddatum liegen." };
  return { range: { startDate: start.data, endDate: end.data }, error: null };
}

function getLocalCalendarDate(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseSchedule(sourceText: string) {
  try {
    return parseMhtSchedule(Buffer.from(sourceText, "utf8"), { timeZone: "Europe/Berlin" }) as ParsedSchedule;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Die MHT-Datei konnte nicht gelesen werden.",
    );
  }
}

function parseScheduleFile(
  sourceText: string,
  region: string | undefined,
  scheduleParser: typeof parseSchedule,
): ParsedSchedule {
  if (/^\uFEFF?\s*BEGIN:VCALENDAR(?:\r?\n|$)/im.test(sourceText.trimStart())) {
    return parseIcsSchedule(sourceText, { region, timeZone: "Europe/Berlin" }) as ParsedSchedule;
  }
  return scheduleParser(sourceText);
}

function getRequestedRegion(req: Request, res: Response): string | undefined | null {
  const rawRegion = req.query["region"];
  if (rawRegion === undefined) return undefined;
  if (
    typeof rawRegion !== "string"
    || !["EU", "NAE", "NAW", "BR", "ASIA", "OCE", "ME", "GLOBAL"].includes(rawRegion.toUpperCase())
  ) {
    res.status(400).json({ error: "Bitte wähle eine gültige Turnierregion." });
    return null;
  }
  return rawRegion.toUpperCase();
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
    const admin = getSupabaseAdmin();
    type ExistingRow = { id: string } & ExistingMhtEvent;
    type QueryResult = {
      data: ExistingRow[] | null;
      error: { code?: string; message?: string; details?: string } | null;
    };
    let { data, error } = await admin
      .from("fortnite_events")
      .select("id, title, game_mode, game_ruleset, tournament_series, team_format, tournament_type, category, start_time, end_time")
      .in("id", eventIds) as unknown as QueryResult;
    if (error && isMissingEventMetadataColumns(error)) {
      ({ data, error } = await admin
        .from("fortnite_events")
        .select("id, title, game_mode, team_format, tournament_type, category, start_time, end_time")
        .in("id", eventIds) as unknown as QueryResult);
    }
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.id, {
      title: row.title,
      game_mode: row.game_mode,
      game_ruleset: row.game_ruleset ?? null,
      tournament_series: row.tournament_series ?? null,
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
  requestedDateRange: ImportDateRange | null = null,
  scheduleParser: typeof parseSchedule = parseSchedule,
  region?: string,
) {
  const schedule = parseScheduleFile(sourceText, region, scheduleParser);
  const plan = getSafeUpcomingEvents(schedule.events, schedule.snapshotAt);
  const allUpcomingDates = plan.upcoming.map((event) => getLocalCalendarDate(event.start_time, schedule.timeZone));
  const dateRange = requestedDateRange ?? (allUpcomingDates.length > 0
    ? {
        startDate: allUpcomingDates.reduce((earliest, date) => date < earliest ? date : earliest),
        endDate: allUpcomingDates.reduce((latest, date) => date > latest ? date : latest),
      }
    : null);
  const upcoming = dateRange
    ? plan.upcoming.filter((event) => {
        const eventDate = getLocalCalendarDate(event.start_time, schedule.timeZone);
        return eventDate >= dateRange.startDate && eventDate <= dateRange.endDate;
      })
    : plan.upcoming;
  const importable = upcoming.filter((event) => event.review_warnings.length === 0);
  const existingEvents = await findExistingEvents(importable.map((event) => event.id));

  return {
    sourceUrl: schedule.sourceUrl,
    snapshotAt: schedule.snapshotAt,
    snapshotAgeMs: schedule.snapshotAgeMs,
    isSnapshotStale: schedule.isSnapshotStale,
    region: schedule.region,
    timeZone: schedule.timeZone,
    startDate: dateRange?.startDate ?? null,
    endDate: dateRange?.endDate ?? null,
    cardCount: schedule.cardCount,
    upcomingCount: upcoming.length,
    importableCount: importable.length,
    warningCount: upcoming.length - importable.length,
    invalidCount: schedule.invalidCount,
    outOfRangeCount: plan.upcoming.length - upcoming.length,
    newCount: importable.filter((event) => !existingEvents.has(event.id)).length,
    updateCount: importable.filter((event) => existingEvents.has(event.id)).length,
    events: upcoming.map((event) => ({
      id: event.id,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      gameMode: event.game_mode,
      gameRuleset: event.game_ruleset,
      tournamentSeries: event.tournament_series,
      teamFormat: event.team_format,
      tournamentType: event.tournament_type,
      category: event.category,
      warnings: event.review_warnings,
      willUpdate: importable.includes(event) && existingEvents.has(event.id),
      ...getMhtEventChanges(event, existingEvents.get(event.id) ?? null),
    })),
    issues: schedule.issues.map((issue) => ({
      id: issue.id ?? null,
      title: issue.title ?? null,
      errors: issue.errors,
    })),
    schedule,
    importableEvents: importable,
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
  "/v1/admin/events/tournament-type/preview",
  requireImportAdmin,
  async (req, res): Promise<void> => {
    const parsed = tournamentTypePreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Bitte gib eine Termin-ID und eine erlaubte neue Turnierart an.",
      });
      return;
    }

    try {
      const event = await getEventTournamentType(parsed.data.eventId);
      if (!event) {
        res.status(404).json({ error: "Der gespeicherte Termin wurde nicht gefunden." });
        return;
      }
      if (event.tournament_type === parsed.data.tournamentType) {
        res.status(400).json({ error: "Der Termin hat bereits diese Turnierart." });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({
        eventId: event.id,
        title: event.title,
        previousTournamentType: event.tournament_type,
        tournamentType: parsed.data.tournamentType,
      });
    } catch (error) {
      req.log.error({ err: error }, "Could not preview tournament type correction");
      res.status(503).json({ error: "Die Turnierart kann gerade nicht geprüft werden." });
    }
  },
);

router.patch(
  "/v1/admin/events/tournament-type",
  requireImportAdmin,
  async (req, res): Promise<void> => {
    const parsed = tournamentTypeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Bitte gib eine Termin-ID, den angezeigten bisherigen Wert und eine erlaubte neue Turnierart an.",
      });
      return;
    }
    const { eventId, expectedTournamentType, tournamentType } = parsed.data;
    if (expectedTournamentType === tournamentType) {
      res.status(400).json({ error: "Die neue Turnierart muss sich vom bisherigen Wert unterscheiden." });
      return;
    }

    try {
      const updated = await updateEventTournamentType({
        eventId,
        expectedTournamentType,
        tournamentType,
        adminUserId: (req as ImportAdminRequest).importAdminUser!.id,
        adminEmail: (req as ImportAdminRequest).importAdminUser!.email!,
      });
      if (!updated) {
        res.status(409).json({
          error: "Der Termin wurde inzwischen geändert oder gelöscht. Bitte lade die Vorschau erneut.",
        });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({
        eventId,
        previousTournamentType: expectedTournamentType,
        tournamentType,
      });
    } catch (error) {
      if (error instanceof TournamentTypeCorrectionLogError) {
        req.log.error({ err: error }, "Could not save tournament type correction and its audit log");
        res.status(503).json({
          error: "Die Turnierart wurde nicht geändert, weil das Änderungsprotokoll nicht gespeichert werden konnte. Bitte versuche es später erneut.",
        });
        return;
      }
      if (error instanceof TournamentTypeCorrectionError) {
        req.log.error({ err: error }, "Could not save tournament type correction");
      } else {
        req.log.error({ err: error }, "Unexpected tournament type correction failure");
      }
      res.status(503).json({ error: "Die Turnierart konnte gerade nicht gespeichert werden." });
    }
  },
);

router.get(
  "/v1/admin/events/tournament-type/history",
  requireImportAdmin,
  async (req, res): Promise<void> => {
    try {
      const entries = await listRecentTournamentTypeCorrections(
        TOURNAMENT_TYPE_CORRECTION_HISTORY_LIMIT,
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ entries });
    } catch (error) {
      req.log.error({ err: error }, "Could not load tournament type correction history");
      res.status(503).json({
        error: "Das Änderungsprotokoll für Turnierarten kann gerade nicht geladen werden.",
      });
    }
  },
);

router.post(
  "/v1/admin/events/import/preview",
  requireImportAdmin,
  uploadText,
  async (req, res, next): Promise<void> => {
    const sourceText = parseUploadBody(req, res);
    if (sourceText === null) return;
    const dateRangeResult = parseImportDateRange(req);
    if (dateRangeResult.error) {
      res.status(400).json({ error: dateRangeResult.error });
      return;
    }
    const region = getRequestedRegion(req, res);
    if (region === null) return;
    try {
      const preview = await buildPreview(sourceText, dateRangeResult.range, scheduleParser, region ?? undefined);
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
    const dateRangeResult = parseImportDateRange(req);
    if (dateRangeResult.error) {
      res.status(400).json({ error: dateRangeResult.error });
      return;
    }
    const region = getRequestedRegion(req, res);
    if (region === null) return;

    try {
      const preview = await buildPreview(sourceText, dateRangeResult.range, scheduleParser, region ?? undefined);
      if (!preview.schedule.snapshotAt) {
        res.status(400).json({ error: "Der Snapshot-Zeitpunkt fehlt. Diese Datei kann nicht importiert werden." });
        return;
      }
      if (preview.importableEvents.length === 0) {
        res.status(400).json({ error: "Es gibt keine eindeutig zugeordneten zukünftigen Termine zum Importieren." });
        return;
      }
      if (!preview.startDate || !preview.endDate) {
        res.status(400).json({ error: "Der Importzeitraum fehlt. Bitte prüfe die Vorschau erneut." });
        return;
      }
      if (rejectUnconfirmedStaleSnapshot(req, res, preview.schedule.snapshotAt)) return;

      const adminUser = (req as ImportAdminRequest).importAdminUser;
      if (!adminUser?.email) {
        throw new Error("Die Admin-Anmeldung enthält keine Konto-E-Mail-Adresse.");
      }
      const skippedCounts = getMhtImportSkippedCounts({
        warningCount: preview.warningCount,
        skippedPastCount: preview.skippedPastCount,
        invalidCount: preview.invalidCount,
      });
      const skippedCards = [
        ...preview.events
          .filter((event) => event.warnings.length > 0)
          .map((event) => ({
            id: event.id,
            title: event.title,
            reason: event.warnings.join(" "),
          })),
        ...preview.schedule.events
          .filter((event) => Date.parse(event.start_time) < Date.parse(preview.schedule.snapshotAt!))
          .map((event) => ({
            id: event.id,
            title: event.title,
            reason: "Der Termin lag bereits vor dem Snapshot-Zeitpunkt.",
          })),
        ...preview.issues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          reason: issue.errors.join(" "),
        })),
      ];
      const committed = await commitMhtImport(preview.importableEvents, {
        adminUserId: adminUser.id,
        adminEmail: adminUser.email,
        sourceHint: getSourceHint(preview.sourceUrl),
        startDate: preview.startDate,
        endDate: preview.endDate,
        skippedCount: skippedCounts.skippedCount,
        skippedWarningCount: skippedCounts.skippedWarningCount,
        skippedPastCount: skippedCounts.skippedPastCount,
        skippedInvalidCount: skippedCounts.skippedInvalidCount,
        skippedCards,
      });

      res.json({
        importedCount: preview.importableEvents.length,
        insertedCount: committed.insertedCount,
        updatedCount: committed.updatedCount,
        ...skippedCounts,
      });
    } catch (error) {
      req.log.error("MHT schedule import failed");
      if (error instanceof EventMetadataMigrationRequiredError) {
        res.status(503).json({
          error: "Die Datenbank ist noch nicht für Turnierserie und Regelwerk migriert. Wende die neue Supabase-Migration an und wiederhole den Import.",
        });
        return;
      }
      if (error instanceof MhtImportTransactionError) {
        res.status(503).json({
          error: "Der Import wurde nicht gespeichert. Es wurden keine Termine oder Historieneinträge übernommen.",
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
