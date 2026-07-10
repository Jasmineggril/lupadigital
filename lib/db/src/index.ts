import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import dns from "dns";
import net from "net";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
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
  const raw = process.env.DATABASE_URL as string;
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
