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

const databaseUrl =
  process.env.DIRECT_URL_IPV4 || process.env.DIRECT_URL || process.env.DATABASE_URL;

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

