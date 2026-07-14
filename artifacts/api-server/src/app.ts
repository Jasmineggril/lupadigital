/**
 * @file app.ts
 * @description Configuração central do servidor Express do LUPA Digital.
 *
 * Este arquivo monta a instância do Express com todos os middlewares globais
 * na ordem correta (segurança → logging → CORS → rate limiting → auth → rotas).
 * A ordem importa: CORS deve vir antes das rotas, e o auth middleware deve
 * vir antes do router para que req.supabaseUser esteja disponível nas rotas.
 *
 * Middlewares aplicados (em ordem):
 *   1. pino-http     — logging estruturado de todas as requisições
 *   2. helmet        — headers de segurança HTTP (CSP, HSTS, X-Frame-Options, etc.)
 *   3. cors          — controle de origens permitidas (allowlist em produção)
 *   4. defaultLimiter — rate limiting geral: 120 req/min por IP
 *   5. express.json  — parsing de corpo JSON (limite 10mb para PDFs em base64)
 *   6. supabaseAuth  — verifica e decodifica JWT Supabase em cada requisição
 *   7. ocrLimiter    — rate limiting específico: 10 req/min para /ocr-pdf
 *   8. aiLimiter     — rate limiting específico: 30 req/min para endpoints de IA
 *   9. router        — rotas da API (montadas em /api)
 *
 * Rate limiters exportados (aiLimiter, ocrLimiter) podem ser importados
 * por rotas individuais que precisem de limites diferenciados.
 */

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { supabaseAuthMiddleware } from "./lib/supabase";

const app: Express = express();

// Confia no proxy reverso (Vercel, Replit, etc.) para X-Forwarded-For.
// Necessário para que express-rate-limit identifique IPs corretamente em produção.
app.set("trust proxy", 1);

// ── CORS ─────────────────────────────────────────────────────────────────────
// Lê origens permitidas da variável de ambiente ALLOWED_ORIGINS (CSV).
// Em desenvolvimento (NODE_ENV=development), qualquer origem é aceita para
// facilitar o trabalho local. Em produção, apenas as origens listadas.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Requisições sem header Origin (curl, Postman, server-to-server) sempre passam
    if (!origin) return callback(null, true);
    // Modo desenvolvimento: libera tudo para agilizar o trabalho local
    if (process.env.NODE_ENV === "development") return callback(null, true);
    // Produção: verifica se a origem está na allowlist ou se a lista está vazia
    // (lista vazia = ainda não configurada, deixa passar com log implícito)
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origem não permitida: ${origin}`));
  },
  credentials: true, // necessário para enviar cookies/Authorization headers cross-origin
};

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Três níveis de limite para proteger recursos com custos diferentes:
// - defaultLimiter: rotas leves (HTML, JSON simples) — 120 req/min
// - aiLimiter: chamadas à OpenAI (custo por token) — 30 req/min
// - ocrLimiter: OCR de PDF (CPU + memória intensivos) — 10 req/min

/** Limite geral para todas as rotas não-IA: 120 requisições por minuto por IP */
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,  // inclui RateLimit-* headers na resposta (RFC 6585)
  legacyHeaders: false,   // remove X-RateLimit-* headers legados
  message: { error: "Muitas requisições. Tente novamente em um minuto." },
});

/** Limite para endpoints de IA (OpenAI): 30 requisições por minuto por IP */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de análises atingido. Aguarde um minuto e tente novamente." },
});

/** Limite para OCR de PDF (alto custo computacional): 10 requisições por minuto por IP */
export const ocrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de processamento de PDF atingido. Aguarde um minuto." },
});

// ── Middlewares globais (aplicados a todas as rotas) ─────────────────────────

// Logging estruturado: registra method, URL (sem query string) e statusCode
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Remove query string do log para não vazar dados sensíveis em parâmetros de URL
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Helmet: aplica ~15 headers de segurança HTTP por padrão.
// crossOriginResourcePolicy: "cross-origin" permite que o frontend Vite carregue
// assets da API (imagens, arquivos) quando servidos de domínios diferentes.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors(corsOptions));
app.use(defaultLimiter);

// Limite de 10mb para suportar PDFs encodados em base64 no corpo da requisição
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Supabase Auth Middleware: decodifica o JWT Bearer de cada requisição e
// popula req.supabaseUser (payload do JWT) e req.user ({ id: sub, ...payload }).
// Rotas que não exigem auth simplesmente ignoram req.user.
// Rotas protegidas chamam requireAuth() para rejeitar requests sem JWT.
app.use(supabaseAuthMiddleware());

// ── Rate limiters específicos por rota ───────────────────────────────────────
// Aplicados ANTES do router principal para garantir que o limite é checado
// antes de qualquer lógica de negócio ou acesso ao banco de dados.
app.use("/api/edital/ocr-pdf", ocrLimiter);
app.use("/api/edital/analyze", aiLimiter);
app.use("/api/edital/simplify", aiLimiter);
app.use("/api/edital/extract-url", aiLimiter);
app.use("/api/niasci", aiLimiter); // todas as sub-rotas do NIASci usam IA

// ── Router principal ─────────────────────────────────────────────────────────
// Todas as rotas da API são prefixadas com /api
app.use("/api", router);

// ── Global JSON Error Handler ─────────────────────────────────────────────────
// Captura qualquer erro não tratado nas rotas e devolve JSON em vez de HTML.
// Deve ser o ÚLTIMO middleware registrado no Express.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const status = (err as any).status ?? (err as any).statusCode ?? 500;
  res.status(status).json({
    error: err.message ?? "Internal server error",
  });
});

export default app;
