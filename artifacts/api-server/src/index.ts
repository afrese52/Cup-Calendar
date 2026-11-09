import app from "./app";
import { logger } from "./lib/logger";
import { syncTournaments } from "./services/tournaments";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  void syncTournaments().catch((syncError: unknown) => {
    logger.error({ err: syncError }, "Initial tournament sync failed");
  });

  const syncTimer = setInterval(() => {
    void syncTournaments().catch((syncError: unknown) => {
      logger.error({ err: syncError }, "Scheduled tournament sync failed");
    });
  }, 30 * 60 * 1000);
  syncTimer.unref();
});
