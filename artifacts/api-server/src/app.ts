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
import * as Sentry from "@sentry/node";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { costGuard, memoryBackend, setDefaultLimitBackend, sqlBackend } from "./lib/limits/shared";
import { getSupabaseAdmin } from "./lib/supabase";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { supabaseAuthMiddleware } from "./lib/supabase";
import { getRateLimitConfig } from "./lib/runtimeConfig";
import {
  aiRateKey,
  createAnonHourlyLimiter,
  getAnonAiLimits,
  getRequestHost,
  isOriginAllowed,
  parseAllowedOrigins,
} from "./lib/accessPolicy";

const app: Express = express();

// Confia no proxy reverso (Vercel, Replit, etc.) para X-Forwarded-For.
// Necessário para que express-rate-limit identifique IPs corretamente em produção.
app.set("trust proxy", 1);

// ── CORS ─────────────────────────────────────────────────────────────────────
// Regras em lib/accessPolicy.ts: sem Origin, desenvolvimento, mesma origem do
// deploy (domínio principal e previews do Vercel) ou allowlist ALLOWED_ORIGINS.
// Antes, ALLOWED_ORIGINS vazio liberava qualquer origem com credentials.
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const corsDelegate: cors.CorsOptionsDelegate<express.Request> = (req, callback) => {
  const allowed = isOriginAllowed({
    origin: req.headers.origin,
    requestHost: getRequestHost(req),
    allowlist: ALLOWED_ORIGINS,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!allowed) {
    callback(new Error(`CORS: origem não permitida: ${req.headers.origin}`));
    return;
  }
  callback(null, { origin: true, credentials: true });
};

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Três níveis de limite para proteger recursos com custos diferentes:
// - defaultLimiter: rotas leves (HTML, JSON simples) — valor configurável por ambiente
// - aiLimiter: chamadas à OpenAI (custo por token) — valor configurável por ambiente
// - ocrLimiter: OCR de PDF (CPU + memória intensivos) — valor configurável por ambiente

const { defaultMax, aiMax, ocrMax } = getRateLimitConfig();

/** Limite geral para todas as rotas não-IA */
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: defaultMax,
  standardHeaders: true,  // inclui RateLimit-* headers na resposta (RFC 6585)
  legacyHeaders: false,   // remove X-RateLimit-* headers legados
  message: { error: "Muitas requisições. Tente novamente em um minuto." },
});

/** Limite para endpoints de IA — por usuário logado ou, sem login, por IP */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: aiMax,
  keyGenerator: aiRateKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de análises atingido. Aguarde um minuto e tente novamente." },
});

/** Limite para OCR de PDF (alto custo computacional) */
export const ocrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: ocrMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de processamento de PDF atingido. Aguarde um minuto." },
});

// Visitantes sem login: limite por hora e por IP (usuários logados passam direto).
const anonLimits = getAnonAiLimits();
const anonAiLimiter = createAnonHourlyLimiter(
  anonLimits.perHour,
  "Você atingiu o limite de análises sem login. Entre ou crie uma conta gratuita para continuar.",
);
const anonOcrLimiter = createAnonHourlyLimiter(
  anonLimits.ocrPerHour,
  "Você atingiu o limite de leitura de PDFs sem login. Entre ou crie uma conta gratuita para continuar.",
);
/** Links de compartilhamento: grava no banco, então também tem limite por hora */
const shareLimiter = createAnonHourlyLimiter(
  30,
  "Limite de links compartilhados atingido. Entre na sua conta para continuar.",
);

/** Limite rigoroso para rota de diagnóstico de IA (5 req/min por IP) */
const diagLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de diagnóstico atingido." },
});

// ── Middlewares globais (aplicados a todas as rotas) ─────────────────────────

/** URL para log: sem query string e sem tokens de compartilhamento no caminho. Exportado para testes. */
export function maskLogUrl(url: string | undefined): string | undefined {
  return url?.split("?")[0].replace(/(\/(?:api\/)?edital\/share\/)[^/]+/, "$1[token]");
}

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
          // e mascara o token de links públicos (funciona como chave de acesso)
          url: maskLogUrl(req.url),
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
// Durante o encerramento controlado (servidor persistente), novas requisições recebem 503
app.use((req, res, next) => {
  const lc = app.get("lifecycle") as { drainGuard: express.RequestHandler } | undefined;
  return lc ? lc.drainGuard(req, res, next) : next();
});
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Armazenamento dos limites compartilhados: Postgres (Supabase) quando configurado
if (process.env.LUPA_STORE !== "memory" && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
  setDefaultLimitBackend(
    sqlBackend("supabase", async (fn, args) => {
      const { data, error } = await getSupabaseAdmin().rpc(fn, args);
      if (error) throw new Error(`limite: ${error.code ?? "erro"}`);
      return data;
    }),
  );
} else {
  setDefaultLimitBackend(memoryBackend());
  if (process.env.NODE_ENV === "production") logger.warn("Limites de custo em memória: NÃO compartilhados entre instâncias (Supabase não configurado)");
}

app.use(cors(corsDelegate));
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
// 1ª camada: limitadores locais por minuto (rajadas, por instância).
// 2ª camada: costGuard — cotas COMPARTILHADAS entre instâncias (Postgres), orçamento global e
// limite de execuções simultâneas; falha do armazenamento → 503 (fechado). Ver lib/limits/shared.ts.
const aiCost = costGuard("ai");
const ocrCost = costGuard("ocr");
const onlyPost = (h: express.RequestHandler): express.RequestHandler => (req, res, next) => (req.method === "POST" ? h(req, res, next) : next());
app.use("/api/edital/ocr-pdf", anonOcrLimiter, ocrLimiter, onlyPost(ocrCost));
app.use("/api/edital/analyze", anonAiLimiter, aiLimiter, onlyPost(aiCost));
app.use("/api/edital/simplify", anonAiLimiter, aiLimiter, onlyPost(aiCost));
app.use("/api/edital/extract-url", anonOcrLimiter, aiLimiter, onlyPost(ocrCost));
app.use("/api/niasci", anonAiLimiter, aiLimiter, onlyPost(aiCost)); // todas as sub-rotas do NIASci usam IA
app.post("/api/edital/share", shareLimiter);
app.use("/api/diag", diagLimiter); // diagnóstico de provedores (5 req/min)

// ── Router principal ─────────────────────────────────────────────────────────
// Todas as rotas da API são prefixadas com /api
app.use("/api", router);

// ── Sentry error handler (after all routes, before other error handlers) ────
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// ── Global JSON Error Handler ─────────────────────────────────────────────────
// Captura qualquer erro não tratado nas rotas e devolve JSON em vez de HTML.
// Deve ser o ÚLTIMO middleware registrado no Express.
//
// Segurança: erros internos (banco de dados, provedores, stack traces) NUNCA
// são expostos ao cliente. O detalhe completo é registrado no log do servidor
// e a resposta devolve apenas uma mensagem segura e específica o suficiente
// para o usuário agir (sem mascarar a natureza do problema nem vazar SQL).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");

  const anyErr = err as { status?: unknown; statusCode?: unknown; code?: string; userSafe?: boolean };

  // Erros marcados como seguros para exibição ao usuário.
  if (anyErr.userSafe === true) {
    const status = Number(anyErr.status) || Number(anyErr.statusCode) || 500;
    res.status(status).json({ error: err.message });
    return;
  }

  // Erros do multer (upload de arquivos), se um dia forem utilizados.
  if (anyErr.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Arquivo muito grande. O limite é de 20MB." });
    return;
  }
  if (anyErr.code && anyErr.code.startsWith("LIMIT_")) {
    res.status(400).json({ error: "Arquivo inválido." });
    return;
  }

  // Erros de CORS (origem não permitida).
  if (typeof err.message === "string" && err.message.startsWith("CORS:")) {
    res.status(403).json({ error: "Origem não permitida." });
    return;
  }

  // Erros de banco de dados: mensagem genérica mas específica, sem vazar SQL.
  const message = (err.message ?? "").toLowerCase();
  const looksLikeDbError =
    typeof err.message === "string" &&
    (message.includes("failed query") ||
      message.includes("select ") ||
      message.includes("insert into") ||
      message.includes("connection") ||
      message.includes("pool") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("timeout") ||
      message.includes("database") ||
      message.includes("postgres") ||
      anyErr.code?.match(/^[0-5][0-9A-Z]{4}$/));

  if (looksLikeDbError) {
    res.status(503).json({ error: "Falha ao acessar o banco de dados. Tente novamente." });
    return;
  }

  res.status(500).json({ error: "Erro interno do servidor. Tente novamente." });
});

export default app;
