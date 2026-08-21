import { Router, type IRouter, type Request, type Response } from "express";
import getSupabaseAdmin from "../lib/supabase";
import { cacheStats } from "../lib/aiCache";

const HEALTHZ_TIMEOUT_MS = 5_000;

const router: IRouter = Router();

function getRequestId(req: Request): string {
  return (req as any).id ?? "unknown";
}

/**
 * GET /healthz — Liveness probe (always 200 if server is running).
 */
router.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    cache: cacheStats(),
  });
});

/**
 * GET /readyz — Readiness probe (checks DB connectivity).
 */
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
      duration,
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
      duration,
    });
  }
});

/**
 * GET /readyz/deep — Deep readiness (DB + AI provider check).
 */
router.get("/readyz/deep", async (req: Request, res: Response) => {
  const requestId = getRequestId(req);
  const checks: Record<string, { ok: boolean; detail?: string; durationMs: number }> = {};

  // DB check
  const dbStart = performance.now();
  try {
    const supabase = getSupabaseAdmin();
    const result = await Promise.race([
      supabase.from("edital_analyses").select("id", { head: true, count: "exact" }).limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), HEALTHZ_TIMEOUT_MS)
      ),
    ]);
    checks.database = {
      ok: !result.error,
      detail: result.error?.message ?? undefined,
      durationMs: Math.round(performance.now() - dbStart),
    };
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - dbStart),
    };
  }

  // AI provider check (lightweight — just verify key exists)
  const aiStart = performance.now();
  const groqKey = process.env.GROQ_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  const aiOk = groqKey.length > 10 || openaiKey.length > 10;
  checks.ai = {
    ok: aiOk,
    detail: aiOk ? undefined : "No AI provider keys configured",
    durationMs: Math.round(performance.now() - aiStart),
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  const totalDuration = Math.round(performance.now() - performance.now());

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks,
    requestId,
  });
});

export default router;
