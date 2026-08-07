import './src/load-env.ts';
import { db } from '@workspace/db';

const result = await db.execute({ sql: 'select current_database() as db, now()::text as ts', params: [] });
console.log(JSON.stringify(result.rows));
