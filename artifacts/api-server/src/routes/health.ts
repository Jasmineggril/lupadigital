import { HealthCheckResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";

/**
 * Endpoint de health check da API.
 * Mantém a verificação de disponibilidade em um ponto único,
 * sem depender de acesso direto ao banco pelo frontend.
 */
const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({
    ...data,
    service: "api-server",
    timestamp: new Date().toISOString(),
  });
});

export default router;
