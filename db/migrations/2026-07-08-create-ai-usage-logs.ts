import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function up(db: NodePgDatabase<Record<string, never>>) {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text,
      document_id text,
      module text NOT NULL,
      model text NOT NULL,
      latency_ms integer,
      input_tokens integer,
      output_tokens integer,
      total_tokens integer,
      success boolean DEFAULT false,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id
      ON public.ai_usage_logs (user_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_module
      ON public.ai_usage_logs (module);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at
      ON public.ai_usage_logs (created_at DESC);
  `);
}

export async function down(db: NodePgDatabase<Record<string, never>>) {
  await db.execute(sql`DROP INDEX IF EXISTS public.idx_ai_usage_logs_created_at;`);
  await db.execute(sql`DROP INDEX IF EXISTS public.idx_ai_usage_logs_module;`);
  await db.execute(sql`DROP INDEX IF EXISTS public.idx_ai_usage_logs_user_id;`);
  await db.execute(sql`DROP TABLE IF EXISTS public.ai_usage_logs;`);
}
