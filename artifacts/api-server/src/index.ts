import "./load-env";
import * as Sentry from "@sentry/node";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";
import { createLifecycle, installProcessHandlers } from "./lib/lifecycle";

// Sentry init — must be before any other code
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: "lupa-digital@1.0.0",
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.2,
    enabled: process.env.NODE_ENV === "production",
  });
}

// Erro fatal → encerramento controlado (o supervisor reinicia); ver lib/lifecycle.ts
const lifecycle = createLifecycle({ logger, flush: () => Sentry.flush(2000) });
installProcessHandlers(lifecycle, logger, sentryDsn ? (err) => Sentry.captureException(err) : undefined);
app.set("lifecycle", lifecycle);

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

// Run migrations before starting the server
runMigrations()
  .then(() => {
    const server = app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
    lifecycle.attach(server);
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — starting server anyway");
    const server = app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening (with migration errors)");
    });
    lifecycle.attach(server);
  });
