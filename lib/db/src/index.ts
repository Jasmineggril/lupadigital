import dns from "dns";
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

function parseDsnConnectionString(dsn: string) {
  const params = new Map<string, string>();
  const regex = /([a-zA-Z0-9_]+)=('(?:[^']|\\')*'|"(?:[^"]|\\")*"|[^'"\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(dsn)) !== null) {
    let value = match[2];
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\"/g, '"');
    }
    params.set(match[1], value);
  }
  return params;
}

function buildDsnConnectionString(params: Map<string, string>) {
  return Array.from(params.entries())
    .map(([key, value]) => {
      const needsQuotes = /\s/.test(value);
      return `${key}=${needsQuotes ? `'${value.replace(/'/g, "\\'")}'` : value}`;
    })
    .join(" ");
}

/**
 * Prepara a connection string: resolve DNS para IPv4 e garante compatibilidade.
 */
async function prepareConnectionString(urlStr: string) {
  async function resolveHost(host: string) {
    if (!net.isIP(host)) {
      try {
        const lookup = await dns.promises.lookup(host, { family: 4 });
        if (lookup && lookup.address) {
          return lookup.address;
        }
      } catch {
        // ignore lookup errors and fall back to original host
      }
    }
    return host;
  }

  try {
    const url = new URL(urlStr);
    const host = url.hostname;

    if (isIpv6Address(host)) {
      throw new Error(
        `Host IPv6 detectado (${host}). ` +
        `Use a Connection Pooler URL do Supabase com hostname "pooler.supabase.com": ` +
        `Settings → Database → Connection string → Transaction mode (port 6543)`
      );
    }

    const resolvedHost = await resolveHost(host);
    if (resolvedHost !== host) {
      url.hostname = resolvedHost;
      return url.toString();
    }
    return urlStr;
  } catch {
    // not a URL, continue to DSN parsing
  }

  if (/\bhost=[^\s]+/i.test(urlStr)) {
    const params = parseDsnConnectionString(urlStr);
    const host = params.get("host");
    if (host) {
      if (isIpv6Address(host)) {
        throw new Error(
          `Host IPv6 detectado (${host}) no formato DSN. ` +
          `Use a Connection Pooler URL do Supabase com hostname "pooler.supabase.com": ` +
          `Settings → Database → Connection string → Transaction mode (port 6543)`
        );
      }
      const resolvedHost = await resolveHost(host);
      if (resolvedHost !== host) {
        params.set("host", resolvedHost);
        return buildDsnConnectionString(params);
      }
    }
  }

  return urlStr;
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

// ── Lazy singleton ───────────────────────────────────────────────────────────
// O pool e o cliente Drizzle são criados APENAS na primeira query ao banco.
// Isso evita conexões desnecessárias durante importação do módulo ou build.

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _pool: pg.Pool | null = null;
let _db: DrizzleDB | null = null;
let _initPromise: Promise<DrizzleDB> | null = null;

/**
 * Inicializa a conexão com o banco de forma lazy (só na primeira query).
 * Thread-safe: múltiplas chamadas concorrentes aguardam a mesma inicialização.
 */
async function ensureDb(): Promise<DrizzleDB> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const databaseUrl = resolveDatabaseUrl();
    if (!databaseUrl) {
      throw new Error(
        "DIRECT_URL_IPV4, DIRECT_URL ou DATABASE_URL deve estar definido. " +
        "Use a Connection Pooler URL do Supabase (porta 6543, modo Transaction): " +
        "Settings → Database → Connection string → Transaction mode (port 6543)",
      );
    }

    const connString = await prepareConnectionString(databaseUrl);
    _pool = new Pool({
      connectionString: connString,
      ...getPoolConfig(),
    });

    _db = drizzle(_pool, { schema });
    return _db;
  })();

  return _initPromise;
}

/**
 * Proxy de `db` que inicializa a conexão de forma lazy (só na primeira query).
 *
 * O proxy intercepta TODAS as chamadas de método e propriedade:
 * - Para métodos que retornam builders (select, insert, update, delete):
 *   aguarda a inicialização e delega ao Drizzle real
 * - Para propriedades conhecidas ($schema): retorna síncrono
 * - Para tudo mais: aguarda init e delega
 *
 * Isso permite `import { db } from "@workspace/db"` sem top-level await.
 */
export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop, _receiver) {
    // Propriedades síncronas que não precisam de conexão
    if (prop === "$schema") return schema;
    if (prop === Symbol.toStringTag) return "LazyDrizzleDB";

    // Para métodos: retorna uma função que aguarda inicialização
    return (...args: unknown[]) => {
      // Fast path: já inicializado
      if (_db) {
        const method = (_db as any)[prop];
        return typeof method === "function" ? method.apply(_db, args) : method;
      }

      // Slow path: aguarda inicialização
      return ensureDb().then((realDb) => {
        const method = (realDb as any)[prop];
        return typeof method === "function" ? method.apply(realDb, args) : method;
      });
    };
  },
});

// Expõe ensureDb para uso avançado (health checks, scripts, etc.)
export { ensureDb as getDb };
export { ensureDb as getPool };

export * from "./schema";
