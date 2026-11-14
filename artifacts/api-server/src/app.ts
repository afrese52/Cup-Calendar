import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import authEmailHookRouter from "./routes/authEmailHook";
import { logger } from "./lib/logger";
import { MAX_MHT_UPLOAD_BYTES } from "./lib/uploadLimits";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Supabase signs the exact raw JSON body, so this endpoint must run before express.json().
app.use("/api", authEmailHookRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 500;
  if (status === 413) {
    res.status(413).json({
      error: `Die Datei ist zu groß. Bitte lade eine Datei unter ${MAX_MHT_UPLOAD_BYTES / (1024 * 1024)} MB hoch.`,
    });
    return;
  }
  logger.error({ err: error }, "Unhandled API request error");
  res.status(500).json({ error: "Die Anfrage konnte nicht verarbeitet werden." });
});

export default app;
