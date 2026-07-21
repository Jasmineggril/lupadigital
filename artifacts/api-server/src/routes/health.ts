import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });

  try {
    const result = await db.execute(sql`SELECT current_database() as db, now()::text as ts`);
    const rows = (result as any).rows ?? result;
    const row = Array.isArray(rows) ? rows[0] : rows;

    res.json({
      ...data,
      database: {
        ok: true,
        database: row?.db ?? null,
        latencyMs: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({
      ...data,
      database: {
        ok: false,
        error: "Banco indisponível",
        detail: message.includes("password") || message.includes("auth") ? "Credenciais inválidas" : "Tempo limite ou host inacessível",
      },
    });
  }
});

export default router;
