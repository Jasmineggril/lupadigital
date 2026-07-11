import cors from "cors";
import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { supabaseAuthMiddleware } from "./lib/supabase";
import router from "./routes";

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach supabase auth payload (if provided) to each request
app.use(supabaseAuthMiddleware());

app.use("/api", router);

// Central error handler: captura exceções não tratadas nas rotas,
// registra contexto e retorna resposta JSON padronizada.
app.use((err: any, _req: any, res: any, _next: any) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ err: message, stack: err?.stack ?? null }, "unhandled_error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
