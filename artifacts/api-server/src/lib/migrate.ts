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
 * Divide um arquivo SQL em comandos individuais.
 *
 * Diferente de um simples split(";"), respeita:
 *   - blocos com dollar-quoting ($$ ... $$ e $tag$ ... $tag$), usados em DO e
 *     CREATE FUNCTION, que contêm ";" internos;
 *   - strings entre aspas simples e identificadores entre aspas duplas;
 *   - comentários de linha (--) e de bloco, que são removidos.
 *
 * Antes, um trecho que começasse com comentário era descartado inteiro — o que
 * fazia o primeiro comando de cada arquivo (logo após o cabeçalho) ser ignorado.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Comentário de linha
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? n : end + 1;
      current += "\n";
      continue;
    }
    // Comentário de bloco
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      current += " ";
      continue;
    }
    // String ou identificador entre aspas ('' e "" escapam a própria aspa)
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // Dollar-quoting: $$ ou $tag$
    if (ch === "$") {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

/** Erro lançado quando o RPC exec_sql não existe no banco. */
class ExecSqlUnavailableError extends Error {}

/**
 * Aplica um arquivo SQL comando a comando via RPC exec_sql.
 * Lança erro se algum comando falhar, para que a migration NÃO seja marcada
 * como aplicada e seja tentada de novo na próxima inicialização.
 */
async function applySql(sql: string, migrationId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const statements = splitSqlStatements(sql);

  let applied = 0;
  const failures: string[] = [];
  for (const stmt of statements) {
    const { error } = await supabase.rpc("exec_sql", { query: stmt + ";" });
    if (error) {
      if (error.message.includes("does not exist") && error.message.includes("exec_sql")) {
        throw new ExecSqlUnavailableError("exec_sql RPC not available");
      }
      failures.push(error.message);
      logger.warn({ error: error.message, stmt: stmt.substring(0, 100) }, "Migration statement failed");
    } else {
      applied++;
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} de ${statements.length} comandos falharam em ${migrationId}`);
  }
  logger.info({ migration: migrationId, statements: applied }, "Migration applied");
}

/** Identificador de uma migration: nome do arquivo sem a extensão .sql. */
export function migrationIdFromFile(file: string): string {
  return file.replace(/\.sql$/, "");
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

    // Compara pelo id (sem .sql), o mesmo valor gravado por markApplied.
    // Antes comparava o nome do arquivo com .sql, então toda migration era
    // considerada pendente e reaplicada em toda inicialização.
    const pending = files.filter((f) => !applied.has(migrationIdFromFile(f)));
    if (pending.length === 0) {
      logger.info("All migrations applied");
      return;
    }

    logger.info({ count: pending.length }, "Running pending migrations");

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = readFileSync(filePath, "utf8");
      const id = migrationIdFromFile(file);

      try {
        await applySql(sql, id);
        await markApplied(id, file);
        logger.info({ migration: id }, "Migration applied successfully");
      } catch (err) {
        if (err instanceof ExecSqlUnavailableError) {
          logger.warn("exec_sql RPC not available — migrations must be applied via SQL Editor");
          return; // nada foi marcado como aplicado
        }
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
