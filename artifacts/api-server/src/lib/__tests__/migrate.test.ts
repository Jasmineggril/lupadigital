/**
 * Testes do executor de migrations (lib/migrate.ts).
 *
 * Bugs corrigidos:
 *  1. split(";") quebrava blocos DO $$ ... $$ e CREATE FUNCTION, que têm ";" internos.
 *  2. Trechos que começavam com comentário eram descartados inteiros, então o
 *     primeiro comando de cada arquivo (após o cabeçalho) nunca rodava.
 *  3. As migrations aplicadas eram gravadas sem ".sql", mas comparadas com o nome
 *     do arquivo com ".sql": tudo era reaplicado a cada inicialização.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrationIdFromFile, splitSqlStatements } from "../migrate";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../../../../supabase/migrations");

describe("splitSqlStatements", () => {
  it("não descarta o primeiro comando quando o arquivo começa com comentário", () => {
    const sql = "-- Migration X\n-- Data: hoje\nCREATE TABLE a (id int);\nCREATE TABLE b (id int);";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (id int)", "CREATE TABLE b (id int)"]);
  });

  it("mantém um bloco DO $$ ... $$ inteiro, mesmo com ';' internos", () => {
    const sql = `DO $$
BEGIN
  IF true THEN
    CREATE POLICY p ON t FOR SELECT USING (true);
  END IF;
END;
$$;
SELECT 1;`;
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(2);
    expect(out[0].startsWith("DO $$")).toBe(true);
    expect(out[0].endsWith("$$")).toBe(true);
    expect(out[0]).toContain("CREATE POLICY p ON t FOR SELECT USING (true);");
    expect(out[1]).toBe("SELECT 1");
  });

  it("respeita dollar-quoting com tag ($fn$)", () => {
    const sql = "CREATE FUNCTION f() RETURNS int AS $fn$ SELECT 1; $fn$ LANGUAGE sql; SELECT 2;";
    const out = splitSqlStatements(sql);
    expect(out).toEqual(["CREATE FUNCTION f() RETURNS int AS $fn$ SELECT 1; $fn$ LANGUAGE sql", "SELECT 2"]);
  });

  it("não divide em ';' dentro de strings e identificadores", () => {
    const sql = "INSERT INTO t VALUES ('a;b', 'it''s; ok'); SELECT \"col;x\" FROM t;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t VALUES ('a;b', 'it''s; ok')",
      "SELECT \"col;x\" FROM t",
    ]);
  });

  it("remove comentários de bloco e ignora comandos vazios", () => {
    expect(splitSqlStatements("/* x; y */ SELECT 1;;  ;")).toEqual(["SELECT 1"]);
  });

  it("divide as migrations reais sem quebrar nenhum bloco $$", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const statements = splitSqlStatements(sql);
      expect(statements.length, file).toBeGreaterThan(0);
      for (const stmt of statements) {
        // Cada comando tem um número par de marcadores $$ (blocos fechados)
        const dollars = (stmt.match(/\$\$/g) ?? []).length;
        expect(dollars % 2, `${file}: ${stmt.slice(0, 60)}`).toBe(0);
        // Nenhum comando é só comentário
        expect(stmt.startsWith("--"), file).toBe(false);
      }
    }
  });

  it("a primeira migration cria a tabela conversations (antes era ignorada)", () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, "20260710_create_lupa_tables.sql"), "utf8");
    const statements = splitSqlStatements(sql);
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS conversations/);
  });
});

describe("migrationIdFromFile", () => {
  it("remove apenas a extensão final .sql", () => {
    expect(migrationIdFromFile("20260710_create_lupa_tables.sql")).toBe("20260710_create_lupa_tables");
    expect(migrationIdFromFile("x.sql.sql")).toBe("x.sql");
  });
});
