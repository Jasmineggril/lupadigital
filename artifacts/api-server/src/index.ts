import "./load-env";
import * as Sentry from "@sentry/node";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";

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

// Rede de segurança: um erro não tratado em um handler async (ex.: falha no
// Supabase em /edital/share) vira rejeição não capturada e derruba o processo
// inteiro. Aqui logamos e mantemos o servidor vivo; o Express Error Handler
// cobre os erros que passam por next(err).
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection — keeping server alive");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught exception — keeping server alive");
});

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
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — starting server anyway");
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening (with migration errors)");
    });
  });
