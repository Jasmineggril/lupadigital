import '../load-env';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('DATABASE_URL', process.env.DATABASE_URL);
  console.log('DIRECT_URL', process.env.DIRECT_URL);
  console.log('DIRECT_URL_IPV4', process.env.DIRECT_URL_IPV4);
  try {
    const result = await db.execute(sql`SELECT current_database() AS db, now()::text AS ts`);
    console.log('OK', result);
  } catch (err) {
    console.error('ERR', err);
    if (err instanceof Error) {
      console.error('message', err.message);
      console.error('code', (err as any).code);
      console.error('cause', (err as any).cause);
    }
    process.exit(1);
  }
}

main().catch((err) => { console.error('MAIN ERR', err); process.exit(1); });
