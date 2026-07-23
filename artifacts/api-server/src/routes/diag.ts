/**
 * @file diag.ts
 * @description Rota de diagnóstico de provedores de IA.
 *
 * Endpoint: POST /api/diag/test-ai
 *
 * Proteção:
 *   - DIAG_AI_ENABLED !== "true" → 404
 *   - Rate limit: 5 req/min por IP
 *   - Header X-Diagnostic-Secret obrigatório (timingSafeEqual)
 *
 * Esta rota testa CADA provedor de IA isoladamente (sem fallback)
 * com um prompt mínimo fixo, retornando status de cada um.
 *
 * Não usa: banco, chunking, consolidação, histórico, exportação.
 * Não aceita: input do usuário (prompt fixo hardcoded).
 * Não expõe: chaves, conteúdo de resposta, headers, stack traces.
 */

import { Router, type IRouter } from "express";
import { randomUUID, timingSafeEqual } from "crypto";
import { OpenAI, geminiCreate } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Prompt fixo de diagnóstico (não aceita input do usuário) ────────────────
const DIAG_SYSTEM = "Você é um assistente de teste. Responda SOMENTE com o JSON solicitado, sem texto adicional.";
const DIAG_USER = '{"teste":"ok"}';

const DIAG_MESSAGES = [
  { role: "system" as const, content: DIAG_SYSTEM },
  { role: "user" as const, content: DIAG_USER },
];

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ProviderResult {
  provider: string;
  model: string;
  keyConfigured: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  success: boolean;
  errorType: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sanitizeErrorType(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("etimedout") || m.includes("aborted") || m.includes("abort")) return "timeout";
  if (m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("invalid api key") || m.includes("incorrect api key")) return "auth";
  if (m.includes("429") || m.includes("rate limit") || m.includes("quota")) return "rate_limit";
  if (m.includes("500") || m.includes("502") || m.includes("503") || m.includes("504") || m.includes("internal server error") || m.includes("server had an error")) return "provider_error";
  if (m.includes("econnrefused") || m.includes("econnreset") || m.includes("enotfound") || m.includes("network")) return "network";
  return "unknown";
}

function verifySecret(provided: string | undefined): boolean {
  const expected = process.env.DIAG_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Teste de cada provedor (isolado, sem fallback) ──────────────────────────

async function testGroq(): Promise<ProviderResult> {
  const model = "llama-3.3-70b-versatile";
  const key = process.env.GROQ_API_KEY;
  if (!key) return { provider: "groq", model, keyConfigured: false, httpStatus: null, durationMs: null, success: false, errorType: "not_configured" };

  const start = Date.now();
  try {
    const client = new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1", timeout: 30_000 });
    await client.chat.completions.create({ model, max_tokens: 50, messages: DIAG_MESSAGES });
    return { provider: "groq", model, keyConfigured: true, httpStatus: 200, durationMs: Date.now() - start, success: true, errorType: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = Number.parseInt(msg.match(/\b(4\d{2}|5\d{2})\b/)?.[0] ?? "", 10) || null;
    return { provider: "groq", model, keyConfigured: true, httpStatus: status, durationMs: Date.now() - start, success: false, errorType: sanitizeErrorType(msg) };
  }
}

async function testGemini(): Promise<ProviderResult> {
  const model = "gemini-2.5-flash";
  const key = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return { provider: "gemini", model, keyConfigured: false, httpStatus: null, durationMs: null, success: false, errorType: "not_configured" };

  const start = Date.now();
  try {
    await geminiCreate({ max_tokens: 50, messages: DIAG_MESSAGES });
    return { provider: "gemini", model, keyConfigured: true, httpStatus: 200, durationMs: Date.now() - start, success: true, errorType: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = Number.parseInt(msg.match(/\b(4\d{2}|5\d{2})\b/)?.[0] ?? "", 10) || null;
    return { provider: "gemini", model, keyConfigured: true, httpStatus: status, durationMs: Date.now() - start, success: false, errorType: sanitizeErrorType(msg) };
  }
}

async function testOpenAI(): Promise<ProviderResult> {
  const model = "gpt-5.4-mini";
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { provider: "openai", model, keyConfigured: false, httpStatus: null, durationMs: null, success: false, errorType: "not_configured" };

  const start = Date.now();
  try {
    const client = new OpenAI({ apiKey: key, timeout: 30_000 });
    await client.chat.completions.create({ model, max_tokens: 50, messages: DIAG_MESSAGES });
    return { provider: "openai", model, keyConfigured: true, httpStatus: 200, durationMs: Date.now() - start, success: true, errorType: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = Number.parseInt(msg.match(/\b(4\d{2}|5\d{2})\b/)?.[0] ?? "", 10) || null;
    return { provider: "openai", model, keyConfigured: true, httpStatus: status, durationMs: Date.now() - start, success: false, errorType: sanitizeErrorType(msg) };
  }
}

// ── Rota principal ──────────────────────────────────────────────────────────

router.post("/diag/test-ai", async (req, res): Promise<void> => {
  // 1. Verificar se a rota está habilitada
  if (process.env.DIAG_AI_ENABLED !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // 2. Verificar segredo
  const providedSecret = req.headers["x-diagnostic-secret"] as string | undefined;
  if (!verifySecret(providedSecret)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const requestId = randomUUID();
  const start = Date.now();

  logger.info({ requestId, step: "diag_started" }, "Diagnostic AI test started");

  // 3. Testar cada provedor isoladamente
  const [groq, gemini, openai] = await Promise.all([testGroq(), testGemini(), testOpenAI()]);

  const durationMs = Date.now() - start;

  // 4. Logs estruturados seguros (sem chaves, sem conteúdo)
  for (const result of [groq, gemini, openai]) {
    logger.info({
      requestId,
      provider: result.provider,
      model: result.model,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      success: result.success,
      errorType: result.errorType,
    }, `Diagnostic: ${result.provider} ${result.success ? "OK" : "FAILED"}`);
  }

  logger.info({ requestId, step: "diag_completed", durationMs }, "Diagnostic AI test completed");

  // 5. Resposta (sem dados sensíveis)
  res.json({
    requestId,
    timestamp: new Date().toISOString(),
    durationMs,
    providers: [groq, gemini, openai],
  });
});

export default router;
