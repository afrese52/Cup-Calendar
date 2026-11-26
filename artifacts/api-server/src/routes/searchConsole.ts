import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireImportAdmin } from "./adminImport";
import {
  getSearchConsoleReport,
  getSearchConsoleServiceAccountEmail,
  isSearchConsoleConfigured,
  SearchConsoleError,
} from "../services/searchConsole";

const requestSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(2048)).min(1).max(10),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparisonStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparisonEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export function createSearchConsoleRouter(options: {
  report?: typeof getSearchConsoleReport;
  isConfigured?: typeof isSearchConsoleConfigured;
} = {}): IRouter {
  const router: IRouter = Router();
  const report = options.report ?? getSearchConsoleReport;
  const configured = options.isConfigured ?? isSearchConsoleConfigured;

  router.get(
    "/v1/admin/search-console/status",
    requireImportAdmin,
    (_req, res): void => {
      res.json({
        configured: configured(),
        property: "https://cupcal.af-software.app/",
        serviceAccountEmail: getSearchConsoleServiceAccountEmail(),
      });
    },
  );

  router.post(
    "/v1/admin/search-console/report",
    requireImportAdmin,
    async (req, res): Promise<void> => {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Bitte prüfe URLs und Zeitraum." });
        return;
      }

      try {
        const data = await report(parsed.data);
        res.setHeader("Cache-Control", "no-store");
        res.json({ property: "https://cupcal.af-software.app/", data });
      } catch (error) {
        if (error instanceof TypeError) {
          res.status(400).json({ error: error.message });
          return;
        }
        if (error instanceof SearchConsoleError) {
          if (error.kind === "not_configured") {
            res.status(503).json({
              error: "Search Console ist noch nicht eingerichtet. Google-Dienstkonto und Property-Zugriff fehlen.",
            });
            return;
          }
          res.status(502).json({
            error: error.kind === "google_auth_failed"
              ? "Die Google-Anmeldung ist fehlgeschlagen. Prüfe die Dienstkonto-Konfiguration."
              : "Google Search Console ist momentan nicht erreichbar oder der Zugriff fehlt.",
          });
          return;
        }
        req.log.error({ err: error }, "Search Console report failed");
        res.status(500).json({ error: "Der Search-Console-Bericht konnte nicht geladen werden." });
      }
    },
  );

  return router;
}

export default createSearchConsoleRouter();
