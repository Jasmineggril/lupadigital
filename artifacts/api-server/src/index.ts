import "./load-env";
import * as Sentry from "@sentry/node";
import { scrubBreadcrumb, scrubEvent, scrubUrl } from "@workspace/telemetry";
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
    tracesSampleRate: 0.05,
    enabled: process.env.NODE_ENV === "production",
    // Dados mínimos: sem IP, corpo, cookies ou cabeçalhos; ver @workspace/telemetry
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as never) as typeof event | null,
    beforeSendTransaction: (event) => {
      if (event.transaction) event.transaction = scrubUrl(event.transaction);
      if (event.request) event.request = { url: scrubUrl(event.request.url), method: event.request.method };
      return event;
    },
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as typeof crumb | null,
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
