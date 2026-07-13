import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { supabaseAuthMiddleware } from "./lib/supabase";

const app: Express = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
// Origens permitidas: domínio de produção (Vercel) + dev local.
// ALLOWED_ORIGINS pode ser definido como CSV no ambiente de produção.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Permite requisições sem origin (ex: curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    // Em desenvolvimento, permite qualquer origem para facilitar o trabalho local
    if (process.env.NODE_ENV === "development") return callback(null, true);
    // Em produção, verifica lista de origens permitidas
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origem não permitida: ${origin}`));
  },
  credentials: true,
};

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Limite padrão: 120 req/min por IP (rotas informativas, health, etc.)
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em um minuto." },
});

// Limite para endpoints de IA: 30 req/min por IP
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de análises atingido. Aguarde um minuto e tente novamente." },
});

// Limite para OCR (alto custo computacional): 10 req/min por IP
export const ocrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Limite de processamento de PDF atingido. Aguarde um minuto." },
});

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
app.use(cors(corsOptions));
app.use(defaultLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Attach supabase auth payload (if provided) to each request
app.use(supabaseAuthMiddleware());

// Limitadores específicos por rota — aplicados ANTES do roteador principal
app.use("/api/edital/ocr-pdf", ocrLimiter);
app.use("/api/edital/analyze", aiLimiter);
app.use("/api/edital/simplify", aiLimiter);
app.use("/api/edital/extract-url", aiLimiter);
app.use("/api/niasci", aiLimiter);

app.use("/api", router);

export default app;
