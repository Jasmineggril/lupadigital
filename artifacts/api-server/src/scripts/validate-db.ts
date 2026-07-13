/**
 * validate-db.ts
 * Testa a conexão Drizzle/PostgreSQL com o DATABASE_URL configurado.
 * Apenas leituras — não altera nenhum dado.
 */
import { sql } from "drizzle-orm";

// Verifica formato do DATABASE_URL ANTES de tentar conectar
const raw = process.env.DATABASE_URL ?? "";

console.log("\n── Validação DATABASE_URL ──");

if (!raw) {
  console.log("  ❌  DATABASE_URL está vazia");
  process.exit(1);
}

// Detecta erro comum: usuário colou a linha inteira "DATABASE_URL=postgresql://..."
if (raw.startsWith("DATABASE_URL=") || raw.startsWith("DATABASE_URL =")) {
  console.log("  ❌  FORMATO INCORRETO: DATABASE_URL contém o nome da variável como prefixo do valor.");
  console.log("      O valor deve ser apenas a URL de conexão, sem 'DATABASE_URL='.");
  console.log("      Correto:  postgresql://postgres.[ref]:[senha]@host:5432/postgres");
  console.log("      Incorreto: DATABASE_URL=postgresql://...");
  process.exit(1);
}

// Detecta aspas ao redor da URL
if (raw.startsWith('"') || raw.startsWith("'")) {
  console.log("  ❌  FORMATO INCORRETO: DATABASE_URL começa com aspas.");
  console.log("      Remova as aspas do início e do fim do valor.");
  process.exit(1);
}

// Tenta parsear como URL
try {
  const url = new URL(raw);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    console.log(`  ❌  Protocolo inválido: ${url.protocol} (esperado postgresql: ou postgres:)`);
    process.exit(1);
  }
  console.log(`  ✅  Formato OK — host: ${url.hostname}, porta: ${url.port || "5432"}, db: ${url.pathname.slice(1)}`);
} catch {
  console.log("  ❌  DATABASE_URL não é uma URL válida:", raw.slice(0, 30) + "...");
  process.exit(1);
}

// Tenta conectar via Drizzle
console.log("\n── Teste de conexão Drizzle/PostgreSQL ──");
try {
  const { db } = await import("@workspace/db");
  const result = await db.execute(sql`SELECT current_database() as db, now() as ts`);
  const row = (result as any).rows?.[0] ?? result[0];
  console.log(`  ✅  Conexão OK — banco: ${row?.db}, timestamp: ${row?.ts}`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  ❌  Falha ao conectar: ${msg}`);
  process.exit(1);
}

console.log("\n  ✅  DATABASE_URL válida e Drizzle conectado com sucesso!\n");
