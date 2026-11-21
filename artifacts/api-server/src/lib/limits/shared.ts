/**
 * @file lib/limits/shared.ts
 * @description Limites de custo COMPARTILHADOS entre instâncias (IA e OCR).
 *
 * Problema: os limitadores do express-rate-limit guardam contadores na memória do processo.
 * Na Vercel cada instância tem a sua cota e um reinício zera tudo — não existe limite global.
 *
 * Solução (sem serviço novo): contadores atômicos no Postgres do Supabase (migração 20261127):
 *  - cotas por usuário (logado) ou por IP (visitante, sub-rede IPv6 /56) por hora e por dia;
 *  - teto GLOBAL diário de chamadas e de tokens (orçamento);
 *  - limite de execuções SIMULTÂNEAS por pessoa e no total (vaga com prazo: não fica presa);
 *  - 429 com Retry-After e explicação; falha do armazenamento → 503 (fechado) para operações
 *    caras, a menos que LIMITS_FAIL_OPEN=true (risco documentado);
 *  - os limitadores locais por minuto continuam como primeira camada.
 * As chaves guardam um hash (SHA-256 truncado) do usuário/IP, não o valor.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { ipKeyGenerator } from "express-rate-limit";

export interface HitResult {
  allowed: boolean;
  current: number;
  resetAt: Date;
}
export interface LimitBackend {
  kind: string;
  hit(key: string, windowSeconds: number, limit: number, cost?: number): Promise<HitResult>;
  peek(key: string, windowSeconds: number): Promise<number>;
  acquire(key: string, max: number, ttlSeconds: number, id: string): Promise<boolean>;
  release(id: string): Promise<void>;
}

/** SQL via função remota (Supabase RPC / pg). `call(fn, args)` devolve as linhas. */
export function sqlBackend(kind: string, call: (fn: string, args: Record<string, unknown>) => Promise<unknown>): LimitBackend {
  const row = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Record<string, unknown>;
  return {
    kind,
    async hit(key, windowSeconds, limit, cost = 1) {
      const r = row(await call("rate_hit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit, p_cost: cost }));
      if (!r || typeof r.allowed !== "boolean") throw new Error("rate_hit: resposta inesperada");
      return { allowed: r.allowed, current: Number(r.current), resetAt: new Date(String(r.reset_at)) };
    },
    async peek(key, windowSeconds) {
      const v = await call("rate_peek", { p_key: key, p_window_seconds: windowSeconds });
      const n = Number(Array.isArray(v) ? Object.values(row(v) ?? {})[0] : v);
      if (!Number.isFinite(n)) throw new Error("rate_peek: resposta inesperada");
      return n;
    },
    async acquire(key, max, ttlSeconds, id) {
      const v = await call("limit_acquire", { p_key: key, p_max: max, p_ttl_seconds: ttlSeconds, p_id: id });
      const b = Array.isArray(v) ? Object.values(row(v) ?? {})[0] : v;
      if (typeof b !== "boolean") throw new Error("limit_acquire: resposta inesperada");
      return b;
    },
    async release(id) {
      await call("limit_release", { p_id: id });
    },
  };
}

/** Memória do processo: SÓ para desenvolvimento/testes (não é compartilhado). */
export function memoryBackend(now: () => number = Date.now): LimitBackend & { reset(): void } {
  const counters = new Map<string, { start: number; count: number }>();
  const inflight = new Map<string, { key: string; exp: number }>();
  const winStart = (w: number) => Math.floor(now() / 1000 / w) * w * 1000;
  return {
    kind: "memoria",
    reset() {
      counters.clear();
      inflight.clear();
    },
    async hit(key, w, limit, cost = 1) {
      const start = winStart(w);
      const k = `${key}|${start}`;
      const c = (counters.get(k)?.count ?? 0) + cost;
      counters.set(k, { start, count: c });
      return { allowed: c <= limit, current: c, resetAt: new Date(start + w * 1000) };
    },
    async peek(key, w) {
      return counters.get(`${key}|${winStart(w)}`)?.count ?? 0;
    },
    async acquire(key, max, ttl, id) {
      for (const [i, v] of inflight) if (v.key === key && v.exp < now()) inflight.delete(i);
      const n = [...inflight.values()].filter((v) => v.key === key).length;
      if (n >= max) return false;
      inflight.set(id, { key, exp: now() + ttl * 1000 });
      return true;
    },
    async release(id) {
      inflight.delete(id);
    },
  };
}

let backendOverride: LimitBackend | null = null;
let defaultBackend: LimitBackend | null = null;
export function setLimitBackendForTests(b: LimitBackend | null) {
  backendOverride = b;
}
export function setDefaultLimitBackend(b: LimitBackend) {
  defaultBackend = b;
}
function backend(): LimitBackend {
  return backendOverride ?? defaultBackend ?? (defaultBackend = memoryBackend());
}

const n = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : def;
};

export type CostKind = "ai" | "ocr";
export function costPolicy(kind: CostKind) {
  const P = kind === "ai" ? "AI" : "OCR";
  return {
    userPerHour: n(`${P}_USER_PER_HOUR`, kind === "ai" ? 60 : 60),
    userPerDay: n(`${P}_USER_PER_DAY`, kind === "ai" ? 300 : 200),
    anonPerHour: n(`${P}_ANON_PER_HOUR`, kind === "ai" ? n("RATE_LIMIT_AI_ANON_PER_HOUR", 10) : n("RATE_LIMIT_OCR_ANON_PER_HOUR", 30)),
    anonPerDay: n(`${P}_ANON_PER_DAY`, kind === "ai" ? 30 : 60),
    globalPerDay: n(`${P}_GLOBAL_PER_DAY`, kind === "ai" ? 3000 : 2000),
    tokensGlobalPerDay: kind === "ai" ? n("AI_TOKENS_GLOBAL_PER_DAY", 5_000_000) : Infinity,
    concurrentPerKey: n(`${P}_CONCURRENT_PER_KEY`, 2),
    concurrentGlobal: n(`${P}_CONCURRENT_GLOBAL`, kind === "ai" ? 20 : 10),
    concurrentTtlSeconds: n(`${P}_CONCURRENT_TTL_SECONDS`, 180),
  };
}

const hashId = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
export function identityOf(req: Request): { key: string; logged: boolean } {
  const uid = (req as { user?: { id?: unknown } }).user?.id;
  if (typeof uid === "string" && uid) return { key: `u:${hashId(uid)}`, logged: true };
  return { key: `ip:${hashId(ipKeyGenerator(req.ip ?? ""))}`, logged: false };
}

const TOKENS_KEY = "ai:tokens:global:day";
/** Soma os tokens gastos ao orçamento global do dia (chamado ao registrar o consumo). */
export async function recordAiTokens(tokens: number | null | undefined) {
  if (!tokens || tokens <= 0) return;
  try {
    await backend().hit(TOKENS_KEY, 86_400, Number.MAX_SAFE_INTEGER, Math.round(tokens));
  } catch {
    /* orçamento é verificado antes da próxima chamada; falha aqui não derruba a resposta */
  }
}

const MESSAGES: Record<string, string> = {
  hora: "Você atingiu o limite de uso por hora.",
  dia: "Você atingiu o limite de uso de hoje.",
  global: "O limite diário de uso do LUPA foi atingido.",
  orcamento: "O orçamento diário de IA do LUPA foi atingido.",
  simultaneo: "Já há análises suas em andamento. Aguarde terminarem.",
  simultaneo_global: "Muitas análises em andamento agora.",
};

/** Middleware de custo: cotas compartilhadas + simultaneidade + orçamento. */
export function costGuard(kind: CostKind): RequestHandler {
  return async (req, res, next) => {
    const p = costPolicy(kind);
    const id = identityOf(req);
    const deny = (scope: string, resetAt: Date | null, status = 429) => {
      const retry = resetAt ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : 30;
      res.setHeader("Retry-After", String(retry));
      res.status(status).json({
        error: `${MESSAGES[scope] ?? "Limite atingido."} Tente de novo em ${retry >= 3600 ? `${Math.ceil(retry / 3600)} h` : retry >= 60 ? `${Math.ceil(retry / 60)} min` : `${retry} s`}.`,
        code: "LIMIT",
        scope,
        retry_after_s: retry,
        ...(id.logged ? {} : { loginHint: scope === "hora" || scope === "dia" }),
      });
    };
    const leases: string[] = [];
    try {
      const b = backend();
      if (kind === "ai" && Number.isFinite(p.tokensGlobalPerDay) && (await b.peek(TOKENS_KEY, 86_400)) >= p.tokensGlobalPerDay) {
        return deny("orcamento", nextWindow(86_400));
      }
      const checks: Array<[string, string, number, number]> = [
        ["hora", `${kind}:${id.key}:h`, 3_600, id.logged ? p.userPerHour : p.anonPerHour],
        ["dia", `${kind}:${id.key}:d`, 86_400, id.logged ? p.userPerDay : p.anonPerDay],
        ["global", `${kind}:global:d`, 86_400, p.globalPerDay],
      ];
      for (const [scope, key, w, limit] of checks) {
        const r = await b.hit(key, w, limit);
        if (!r.allowed) return deny(scope, r.resetAt);
      }
      for (const [scope, key, max] of [
        ["simultaneo", `${kind}:${id.key}:run`, p.concurrentPerKey],
        ["simultaneo_global", `${kind}:global:run`, p.concurrentGlobal],
      ] as const) {
        const lease = randomUUID();
        if (!(await b.acquire(key, max, p.concurrentTtlSeconds, lease))) {
          await Promise.all(leases.map((l) => b.release(l).catch(() => {})));
          return deny(scope, null);
        }
        leases.push(lease);
      }
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        for (const l of leases) void b.release(l).catch(() => {});
      };
      res.on("finish", release);
      res.on("close", release);
      next();
    } catch {
      await Promise.all(leases.map((l) => backend().release(l).catch(() => {})));
      if (process.env.LIMITS_FAIL_OPEN === "true") return next();
      res.setHeader("Retry-After", "30");
      res.status(503).json({
        error: "O controle de uso está indisponível agora; por segurança a análise não foi iniciada. Tente de novo em instantes.",
        code: "LIMIT_STORE_UNAVAILABLE",
        retry_after_s: 30,
      });
    }
  };
}

function nextWindow(w: number) {
  return new Date((Math.floor(Date.now() / 1000 / w) + 1) * w * 1000);
}
