/**
 * validate-db.ts
 * Testa conexão Drizzle/PostgreSQL via @workspace/db.
 * Executa com: pnpm --filter @workspace/api-server exec tsx src/scripts/validate-db.ts
 */
import { sql } from "drizzle-orm";

function normalizeConnStr(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let v = s.trim();
  const eq = v.indexOf("=");
  if (eq > 0 && /^[A-Z][A-Z0-9_]*$/i.test(v.slice(0, eq).trim())) {
    v = v.slice(eq + 1).trim();
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v || undefined;
}

console.log("\n── Variáveis de conexão ──\n");

const vars = {
  DATABASE_URL:    process.env.DATABASE_URL,
  DIRECT_URL:      process.env.DIRECT_URL,
  DIRECT_URL_IPV4: process.env.DIRECT_URL_IPV4,
};

for (const [key, val] of Object.entries(vars)) {
  const norm = normalizeConnStr(val);
  if (!norm) {
    console.log(`  ⚠️   ${key.padEnd(18)} não definida`);
    continue;
  }
  if (norm.startsWith(key) || norm.startsWith("DATABASE_URL") || norm.startsWith("DIRECT_URL")) {
    console.log(`  ❌  ${key.padEnd(18)} FORMATO INCORRETO (ainda contém o nome da variável)`);
    continue;
  }
  try {
    const u = new URL(norm);
    const pass = u.password ? "***" : "(vazia)";
    console.log(`  ✅  ${key.padEnd(18)} host=${u.hostname}:${u.port || "5432"} user=${u.username} senha=${pass}`);
  } catch {
    console.log(`  ❌  ${key.padEnd(18)} URL inválida: ${norm.slice(0, 30)}...`);
  }
}

console.log("\n── Teste de query via @workspace/db ──\n");

try {
  const { db } = await import("@workspace/db");
  const result = await db.execute(sql`SELECT current_database() as db, now()::text as ts`);
  const rows = (result as any).rows ?? result;
  const row = Array.isArray(rows) ? rows[0] : rows;
  console.log(`  ✅  Conexão OK — banco: ${row?.db}, timestamp: ${row?.ts}`);
  console.log("\n  ✅  Drizzle conectado com sucesso!\n");
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err as any).cause : undefined;
  const causeMsg = cause instanceof Error ? `\n      Causa: ${cause.message}` : "";
  const code = (err as any)?.code ?? cause?.code ?? "";
  console.log(`  ❌  Falha: ${msg}${causeMsg}`);
  if (code) console.log(`      Código: ${code}`);
  if (code === "28P01") {
    console.log("\n  ℹ️   Código 28P01 = senha incorreta.");
    console.log("      Verifique a senha em: Supabase → Settings → Database → Database password → Reveal");
    console.log("      Monte a URL manualmente SEM os colchetes [ ] ao redor da senha.\n");
  }
  process.exit(1);
}
