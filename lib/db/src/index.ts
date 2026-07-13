import dns from "dns";
import { drizzle } from "drizzle-orm/node-postgres";
import net from "net";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function isIpv6Address(host: string) {
  return net.isIP(host) === 6 || /^\[[0-9a-fA-F:]+\]$/.test(host);
}

function getIpv6HostError(host: string) {
  return [
    `Detected an IPv6-only Postgres host in the connection URL: ${host}`,
    "Supabase Preview environments may not be able to reach IPv6 Postgres addresses.",
    "Set DIRECT_URL_IPV4 or DATABASE_URL to an IPv4-accessible Supabase pooler endpoint instead:",
    "postgresql://postgres:<password>@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  ].join(" ");
}

/**
 * Normaliza uma connection string que pode ter sido colada no formato de arquivo .env
 * (ex: DATABASE_URL="postgresql://...") removendo o prefixo KEY= e as aspas envolventes.
 * Isso protege contra o erro comum de copiar a linha inteira do arquivo .env.
 */
function normalizeConnectionString(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let s = raw.trim();
  // Remove prefixo "KEY=" ou "KEY =" (case insensitive, qualquer nome de variável)
  const eqIdx = s.indexOf("=");
  if (eqIdx > 0) {
    const key = s.slice(0, eqIdx).trim();
    // Só strip se o "key" não contém caracteres de URL (protocolo, @, etc.)
    if (/^[A-Z][A-Z0-9_]*$/i.test(key)) {
      s = s.slice(eqIdx + 1).trim();
    }
  }
  // Remove aspas duplas ou simples envolventes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

/**
 * Se DB_PASSWORD estiver definido, substitui a senha na connection string.
 * Isso permite que o usuário corrija apenas a senha sem reformatar a URL inteira.
 * Também remove colchetes [ ] ao redor da senha (formato visual do Supabase).
 */
function injectPassword(urlStr: string, password: string): string {
  try {
    const u = new URL(urlStr);
    // Remove colchetes ao redor da senha (ex: [minhaSenha] → minhaSenha)
    const clean = password.replace(/^\[|\]$/g, "").trim();
    u.password = encodeURIComponent(clean);
    return u.toString();
  } catch {
    return urlStr;
  }
}

function resolveConnectionString(): string | undefined {
  const raw = normalizeConnectionString(
    process.env.DIRECT_URL_IPV4 || process.env.DIRECT_URL || process.env.DATABASE_URL,
  );
  if (!raw) return undefined;

  // Se DB_PASSWORD estiver definido, injeta a senha correta na URL
  const dbPassword = normalizeConnectionString(process.env.DB_PASSWORD);
  if (dbPassword) {
    return injectPassword(raw, dbPassword);
  }

  return raw;
}

const databaseUrl = resolveConnectionString();

if (!databaseUrl) {
  throw new Error(
    "DIRECT_URL_IPV4, DIRECT_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function parseDsnConnectionString(dsn: string) {
  const params = new Map<string, string>();
  const regex = /([a-zA-Z0-9_]+)=('(?:[^']|\\')*'|"(?:[^\"]|\\")*"|[^'"\s]+)/g;
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

  // Try parsing as a normal URL first.
  try {
    const url = new URL(urlStr);
    const host = url.hostname;

    if (isIpv6Address(host)) {
      throw new Error(getIpv6HostError(host));
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

  // If the connection string uses libpq key/value syntax, convert host to IPv4 when possible.
  if (/\bhost=[^\s]+/i.test(urlStr)) {
    const params = parseDsnConnectionString(urlStr);
    const host = params.get("host");

    if (host) {
      if (isIpv6Address(host)) {
        throw new Error(getIpv6HostError(host));
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

async function createPool() {
  const raw = databaseUrl as string;
  const connString = await prepareConnectionString(raw);

  // Configure reasonable timeouts to fail fast on network issues
  const pool = new Pool({
    connectionString: connString,
    connectionTimeoutMillis: process.env.PG_CONNECTION_TIMEOUT
      ? Number(process.env.PG_CONNECTION_TIMEOUT)
      : 10000,
    idleTimeoutMillis: 30000,
  });

  return pool;
}

const pool = await createPool();
export const db = drizzle(pool, { schema });

export { pool };

    export * from "./schema";

