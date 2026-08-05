import { drizzle } from "drizzle-orm/node-postgres";
import net from "net";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// ── Pool config (lazily read from env at pool creation time) ─────────────────
function getPoolConfig() {
  return {
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? 10000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT ?? 10000),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isIpv6Address(host: string) {
  return net.isIP(host) === 6 || /^\[[0-9a-fA-F:]+\]$/.test(host);
}

/**
 * Normaliza uma connection string que pode ter sido colada no formato de arquivo .env
 * (ex: DATABASE_URL="postgresql://...") removendo o prefixo KEY= e as aspas envolventes.
 */
function normalizeConnectionString(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let s = raw.trim();
  const eqIdx = s.indexOf("=");
  if (eqIdx > 0) {
    const key = s.slice(0, eqIdx).trim();
    if (/^[A-Z][A-Z0-9_]*$/i.test(key)) {
      s = s.slice(eqIdx + 1).trim();
    }
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

/**
 * Se DB_PASSWORD estiver definido, substitui a senha na connection string.
 * Remove colchetes [ ] ao redor da senha (formato visual do Supabase).
 */
function injectPassword(urlStr: string, password: string): string {
  try {
    const u = new URL(urlStr);
    const clean = password.replace(/^\[|\]$/g, "").trim();
    u.password = encodeURIComponent(clean);
    return u.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Garante sslmode=require para conexões com o Supabase.
 */
function ensureSslMode(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (!u.searchParams.has("sslmode")) {
      u.searchParams.set("sslmode", "require");
    }
    return u.toString();
  } catch {
    if (!/\bsslmode=/i.test(urlStr)) {
      return `${urlStr} sslmode=require`;
    }
    return urlStr;
  }
}

/**
 * Valida se a connection string aponta para o Supabase Connection Pooler (Supavisor)
 * e não para a conexão direta.
 *
 * Em serverless (Vercel), a conexão direta ao Supabase usa IPv6 que não é
 * roteável, causando timeout. O Shared Pooler (Supavisor) em
 * aws-0-[region].pooler.supabase.com:6543 aceita IPv4.
 *
 * Hostnames do Supabase:
 *   Direct:       db.xxx.supabase.co:5432          (IPv6, NÃO funciona em Vercel)
 *   Session mode: aws-0-[region].pooler.supabase.com:5432 (IPv4)
 *   Transaction:  aws-0-[region].pooler.supabase.com:6543 (IPv4, recomendado serverless)
 *   Dedicated:    db.xxx.supabase.co:6543           (pago, co-located, pode ser IPv6)
 *
 * Trocar apenas a porta de 5432 para 6543 no hostname "db.xxx.supabase.co" NÃO
 * funciona — o Dedicated Pooler (6543) continua em IPv6. O hostname precisa ser
 * "pooler.supabase.com" para alcançar o Supavisor IPv4.
 *
 * @throws {Error} se o hostname não for um endpoint de pooler Supabase
 */
function validatePoolerUrl(urlStr: string): void {
  try {
    const u = new URL(urlStr);
    const host = u.hostname;

    if (!host.includes("supabase")) return;

    const isPoolerHost =
      host.includes("pooler.supabase.com") ||
      host.includes("pooler.supabase.co");

    if (!isPoolerHost) {
      throw new Error(
        `DATABASE_URL aponta para a conexão direta do Supabase (${host}), ` +
        `que usa IPv6 e NÃO funciona em ambientes serverless (Vercel).\n\n` +
        `Use a Connection Pooler URL (Supavisor) com hostname "pooler.supabase.com":\n` +
        `  Settings → Database → Connection string → Transaction mode (port 6543)\n` +
        `  Formato: postgres://postgres.PROJETO_REF:SENHA@aws-0-REGION.pooler.supabase.com:6543/postgres\n\n` +
        `No Vercel: Settings → Environment Variables → DATABASE_URL → cole a URL acima.`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("DATABASE_URL aponta")) throw e;
    // URL malformada — deixa o driver tratar
  }
}

// ── Resolução da connection string (executada no import, sem await) ──────────

function resolveDatabaseUrl(): string | undefined {
  const raw = normalizeConnectionString(
    process.env.DIRECT_URL_IPV4 || process.env.DIRECT_URL || process.env.DATABASE_URL,
  );
  if (!raw) return undefined;

  let url = raw;

  const dbPassword = normalizeConnectionString(process.env.DB_PASSWORD);
  if (dbPassword) {
    url = injectPassword(url, dbPassword);
  }

  validatePoolerUrl(url);
  url = ensureSslMode(url);

  return url;
}

// ── Conexão inicial (executada no import, sem await) ─────────────────────────
// O Pool do node-postgres é preguiçoso: `new Pool()` NÃO abre conexões — elas
// são abertas só na primeira query. Por isso é seguro criar o pool (e o cliente
// Drizzle) no import: o encadeamento do Drizzle (db.select().from(...).where(...))
// funciona de forma síncrona e correta, sem Proxy lazy que quebraria os builders.
//
// Se nenhuma URL for definida, `db` vira um proxy que lança erro claro apenas
// quando usado — rotas que não dependem de banco continuam funcionando.

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

function assertIpv4Reachable(urlStr: string): void {
  try {
    const u = new URL(urlStr);
    if (isIpv6Address(u.hostname)) {
      throw new Error(
        `Host IPv6 detectado (${u.hostname}). Use a Connection Pooler URL do Supabase: ` +
        `Settings → Database → Connection string → Transaction mode (porta 6543)`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("Host IPv6 detectado")) throw e;
  }
}

let _pool: pg.Pool | null = null;
let _db: DrizzleDB | null = null;

(function initializeDb() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) return;
  assertIpv4Reachable(databaseUrl);
  _pool = new Pool({ connectionString: databaseUrl, ...getPoolConfig() });
  _db = drizzle(_pool, { schema });
})();

/**
 * Cliente Drizzle. Se o banco não estiver configurado, qualquer acesso lança um
 * erro claro apontando qual variável definir.
 */
export const db: DrizzleDB =
  _db ??
  (new Proxy({} as DrizzleDB, {
    get() {
      throw new Error(
        "Banco de dados não configurado: defina DIRECT_URL_IPV4, DIRECT_URL ou DATABASE_URL " +
        "(Connection Pooler URL do Supabase — Settings → Database → Connection string → " +
        "Transaction mode, porta 6543).",
      );
    },
  }) as DrizzleDB);

export const pool: pg.Pool | null = _pool;

export * from "./schema";
