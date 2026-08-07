import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const envPath = resolve(process.cwd(), '.env');
const env = readFileSync(envPath, 'utf8');
const vars = new Map<string, string>();
for (const rawLine of env.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eqIndex = line.indexOf('=');
  if (eqIndex <= 0) continue;
  const key = line.slice(0, eqIndex).trim();
  let value = line.slice(eqIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  vars.set(key, value);
}
const conn = vars.get('DIRECT_URL_IPV4') || vars.get('DIRECT_URL') || vars.get('DATABASE_URL');
console.log('conn', conn?.slice(0, 80));
const pool = new pg.Pool({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
try {
  const client = await pool.connect();
  const res = await client.query('select current_database() as db, now()::text as ts');
  console.log(res.rows[0]);
  client.release();
} catch (err) {
  console.error(err);
} finally {
  await pool.end();
}
