import { Router, type IRouter, type Request, type Response } from "express";
import getSupabaseAdmin from "../lib/supabase";

const HEALTHZ_TIMEOUT_MS = 5_000;

const router: IRouter = Router();

function getRequestId(req: Request): string {
  return (req as any).id ?? "unknown";
}

router.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

router.get("/readyz", async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const start = performance.now();

  try {
    const supabase = getSupabaseAdmin();
    const result = await Promise.race([
      supabase.from("edital_analyses").select("id", { head: true, count: "exact" }).limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), HEALTHZ_TIMEOUT_MS)
      ),
    ]);

    const ok = !result.error;
    const duration = Math.round(performance.now() - start);

    req.log?.info({ requestId, code: ok ? "DB_OK" : "DB_ERROR", duration, database: { ok } }, "Readiness check passed");

    res.json({
      status: ok ? "ok" : "degraded",
      database: { ok, detail: result.error?.message ?? null },
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.includes("timeout");
    const code = isTimeout ? "ERR_DB_TIMEOUT" : "ERR_DB_AUTH";
    const detail = isTimeout ? "Tempo limite ou host inacessível" : "Credenciais inválidas";
    const duration = Math.round(performance.now() - start);

    req.log?.warn({ requestId, code, duration, database: { ok: false } }, "Readiness check failed");

    res.status(503).json({
      status: "error",
      database: { ok: false, detail },
      requestId,
    });
  }
});

export default router;
