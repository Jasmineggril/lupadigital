/**
 * @file lib/accessPolicy.ts
 * @description Regras de acesso da API: CORS e limites de uso da IA.
 *
 * CORS — antes, com ALLOWED_ORIGINS vazio em produção, QUALQUER origem era aceita
 * (com credentials: true). Agora a origem é aceita quando:
 *   - não há header Origin (curl, server-to-server);
 *   - NODE_ENV=development;
 *   - é a mesma origem do próprio deploy (host da requisição), o que cobre o
 *     domínio principal e os previews do Vercel sem configuração;
 *   - está na allowlist ALLOWED_ORIGINS.
 *
 * Limites de IA — visitantes sem login continuam podendo testar, mas com um
 * limite por hora e por IP; usuários logados têm o limite normal, contado por
 * usuário (e não por IP).
 */

import type { Request, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export interface OriginContext {
  origin: string | undefined;
  /** Host público da requisição (x-forwarded-host ou host). */
  requestHost: string | undefined;
  allowlist: string[];
  nodeEnv: string | undefined;
}

export function isOriginAllowed({ origin, requestHost, allowlist, nodeEnv }: OriginContext): boolean {
  if (!origin) return true;
  if (nodeEnv === "development") return true;
  if (allowlist.includes(origin.replace(/\/+$/, ""))) return true;
  if (requestHost) {
    try {
      const o = new URL(origin);
      const host = requestHost.split(",")[0].trim().toLowerCase();
      if (o.host.toLowerCase() === host && (o.protocol === "https:" || o.protocol === "http:")) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function getRequestHost(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value || req.headers.host;
}

function userIdOf(req: Request): string | null {
  const id = (req as { user?: { id?: unknown } }).user?.id;
  return typeof id === "string" && id ? id : null;
}

/** Chave de limite: usuário logado → id; visitante → IP (com sub-rede IPv6). */
export function aiRateKey(req: Request): string {
  const uid = userIdOf(req);
  return uid ? `user:${uid}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

export function getAnonAiLimits() {
  return {
    perHour: Number(process.env.RATE_LIMIT_AI_ANON_PER_HOUR ?? 10),
    ocrPerHour: Number(process.env.RATE_LIMIT_OCR_ANON_PER_HOUR ?? 30),
  };
}

/**
 * Limite por hora aplicado só a visitantes sem login.
 * Usuários autenticados passam direto (skip) e caem no limite normal por minuto.
 */
export function createAnonHourlyLimiter(max: number, message: string): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => userIdOf(req) !== null,
    keyGenerator: (req) => `anon:${ipKeyGenerator(req.ip ?? "")}`,
    message: { error: message, code: "ANON_LIMIT", loginHint: true },
  });
}
