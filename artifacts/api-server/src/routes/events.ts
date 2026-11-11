import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import { getSupabaseAdmin } from "../services/supabase";

const router: IRouter = Router();

const querySchema = z.object({
  region: z.enum(["EU", "NAE", "NAW", "BR", "ASIA", "OCE", "ME", "GLOBAL", "ALL"]).optional(),
  game_mode: z.enum(["Battle Royale", "Zero Build", "Reload", "Community", "ALL"]).optional(),
  tournament_type: z.enum(["FNCS", "Cash Cup", "Ranked Cup", "Community", "ALL"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

function mapCategory(title: string, tournamentType: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes("qualifier") || normalized.includes("qualification") || normalized.includes("qualifikation")) {
    return "Qualifikation";
  }
  if (normalized.includes("scrim") || normalized.includes("training") || normalized.includes("practice")) {
    return "Trainingsrunde";
  }
  if (tournamentType === "FNCS" && (normalized.includes("league") || normalized.includes("division"))) {
    return "Liga";
  }
  return "Turnier";
}

router.get("/v1/events", async (req, res, next) => {
  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Ungültige Filterparameter." });
    return;
  }

  try {
    const { region, game_mode, tournament_type, from, to } = parsedQuery.data;
    let query = getSupabaseAdmin()
      .from("fortnite_events")
      .select(
        "id,title,description,region,game_mode,team_format,tournament_type,start_time,end_time,is_featured",
      )
      .order("start_time", { ascending: true });

    if (region && region !== "ALL") query = query.eq("region", region);
    if (game_mode && game_mode !== "ALL") query = query.eq("game_mode", game_mode);
    if (tournament_type && tournament_type !== "ALL") {
      query = query.eq("tournament_type", tournament_type);
    }
    if (from) query = query.gte("end_time", from);
    if (to) query = query.lte("start_time", to);

    const { data, error } = await query;
    if (error) {
      logger.error({ code: error.code }, "Could not load tournament events from Supabase");
      res.status(503).json({ error: "Turnierdaten sind vorübergehend nicht verfügbar." });
      return;
    }

    const events = (data ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      region: event.region,
      gameMode: event.game_mode,
      teamFormat: event.team_format,
      tournamentType: event.tournament_type,
      category: mapCategory(event.title, event.tournament_type),
      startTime: event.start_time,
      endTime: event.end_time,
      featured: event.is_featured,
    }));
    const etag = `"${createHash("sha256").update(JSON.stringify(events)).digest("hex")}"`;

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    res.setHeader("ETag", etag);
    if (req.header("if-none-match") === etag) {
      res.status(304).end();
      return;
    }

    res.json({ count: events.length, data: events });
  } catch (error) {
    next(error);
  }
});

export default router;
