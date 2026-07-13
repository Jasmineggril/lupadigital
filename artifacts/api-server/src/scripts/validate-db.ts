/**
 * validate-db.ts
 * Testa a conexão Drizzle/PostgreSQL com o DATABASE_URL configurado.
 * Apenas leituras — não altera nenhum dado.
 */
import { sql } from "drizzle-orm";

// Normaliza — remove prefixo "KEY=" e aspas (igual ao lib/db/src/index.ts)
function normalizeConnStr(s: string | undefined): string {
  if (!s) return "";
  let v = s.trim();
  const eq = v.indexOf("=");
  if (eq > 0 && /^[A-Z][A-Z0-9_]*$/i.test(v.slice(0, eq).trim())) {
    v = v.slice(eq + 1).trim();
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

const raw = normalizeConnStr(
  process.env.DIRECT_URL_IPV4 || process.env.DIRECT_URL || process.env.DATABASE_URL,
);

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
  const cause = err instanceof Error && (err as any).cause;
  const causeMsg = cause instanceof Error ? ` → ${cause.message}` : "";
  const code = err instanceof Error ? (err as any).code ?? (cause as any)?.code ?? "" : "";
  console.log(`  ❌  Falha ao conectar: ${msg}${causeMsg}`);
  if (code) console.log(`      Código: ${code}`);
  if (err instanceof Error && err.stack) console.log("      Stack:", err.stack.split("\n").slice(1, 4).join("\n      "));
  process.exit(1);
}

console.log("\n  ✅  DATABASE_URL válida e Drizzle conectado com sucesso!\n");
