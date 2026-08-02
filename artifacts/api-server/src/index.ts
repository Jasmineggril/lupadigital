import app from "./app";
import { logger } from "./lib/logger";
import { resolvePort } from "./lib/port";
import { ensureRequiredEnv } from "./lib/secretConfig";

const port = resolvePort(process.env.PORT);

// Em produção (ou quando STRICT_ENV_CHECK=1) garantimos variáveis essenciais.
if (process.env.NODE_ENV === "production" || process.env.STRICT_ENV_CHECK === "1") {
  ensureRequiredEnv(["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
