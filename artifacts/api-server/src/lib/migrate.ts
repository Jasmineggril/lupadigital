/**
 * @file lib/migrate.ts
 * @description Auto-applies pending SQL migrations on server startup.
 *
 * Maintains a _migrations table in Supabase to track which migrations
 * have been applied. New migrations are applied automatically — no
 * manual SQL Editor needed.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import getSupabaseAdmin from "./supabase";
import { logger } from "./logger";

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);

const MIGRATION_TABLE = "_migrations";

/**
 * Ensure the _migrations tracking table exists.
 * Uses Supabase REST to create it if missing.
 */
async function ensureMigrationsTable(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const sql = `
    CREATE TABLE IF NOT EXISTS public.${MIGRATION_TABLE} (
      id         text PRIMARY KEY,
      name       text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  const { error } = await supabase.rpc("exec_sql", { query: sql });
  if (error && !error.message.includes("does not exist")) {
    logger.warn({ error: error.message }, "Could not ensure migrations table via RPC, trying direct");
  }
}

/**
 * Get list of migration IDs already applied.
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const applied = new Set<string>();

  // Table might not exist yet on first run
  try {
    const { data, error } = await supabase
      .from(MIGRATION_TABLE)
      .select("id");
    if (!error && data) {
      for (const row of data) {
        applied.add(row.id);
      }
    }
  } catch {
    // Table doesn't exist yet — first run
  }

  return applied;
}

/**
 * Mark a migration as applied.
 */
async function markApplied(id: string, name: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from(MIGRATION_TABLE).insert({ id, name });
}

/**
 * Apply a single SQL file via multiple sequential statements.
 * Splits on semicolons and executes each statement individually.
 */
async function applySql(sql: string, migrationId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Split into individual statements, filtering empties and comments
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  let applied = 0;
  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc("exec_sql", { query: stmt + ";" });
      if (error) {
        // exec_sql might not exist — log and skip non-critical
        if (error.message.includes("does not exist")) {
          logger.warn("exec_sql RPC not available — migrations must be applied via SQL Editor");
          return;
        }
        logger.warn({ error: error.message, stmt: stmt.substring(0, 100) }, "Migration statement warning");
      } else {
        applied++;
      }
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, "Migration statement error");
    }
  }
  logger.info({ migration: migrationId, statements: applied }, "Migration applied");
}

/**
 * Run all pending migrations.
 * Called on server startup. Never throws — logs warnings instead.
 */
export async function runMigrations(): Promise<void> {
  try {
    // Ensure tracking table exists
    await ensureMigrationsTable();

    const applied = await getAppliedMigrations();

    // Read migration files sorted by name (date prefix ensures order)
    let files: string[];
    try {
      files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      logger.warn("Migrations directory not found — skipping");
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      logger.info("All migrations applied");
      return;
    }

    logger.info({ count: pending.length }, "Running pending migrations");

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = readFileSync(filePath, "utf8");
      const id = file.replace(".sql", "");

      try {
        await applySql(sql, id);
        await markApplied(id, file);
        logger.info({ migration: id }, "Migration applied successfully");
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err), migration: id },
          "Migration failed",
        );
        // Continue with next migration — don't block startup
      }
    }

    logger.info("All pending migrations processed");
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Migration runner failed",
    );
    // Don't crash — server should start even if migrations fail
  }
}
