#!/usr/bin/env node
// Validação simples da connection string para detectar uso da conexão direta
// do Supabase que normalmente resolve para IPv6 (porta 5432) e falha em
// ambientes serverless/preview. Recomenda usar o pooler (porta 6543) ou
// definir DIRECT_URL_IPV4.
const u = process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.DIRECT_URL_IPV4 || "";
if (!u) {
  console.warn("⚠️  Nenhuma variável DATABASE_URL / DIRECT_URL / DIRECT_URL_IPV4 encontrada — ignorando checagem.");
  process.exit(0);
}
try {
  const parsed = new URL(u);
  const hostname = parsed.hostname || "";
  const port = parsed.port || (parsed.protocol === "postgresql:" ? "5432" : parsed.port);

  const looksLikeDirectSupabase = hostname.endsWith(".supabase.co") && String(port) === "5432";
  const looksLikeDbPrefix = hostname.startsWith("db.") && String(port) === "5432";

  if (looksLikeDirectSupabase || looksLikeDbPrefix) {
    console.error(`\n❌ DATABASE_URL parece apontar para a conexão direta do Supabase (host=${hostname}, port=${port}).`);
    console.error("Isso normalmente resolve para IPv6 e falha em ambientes Preview/serverless.\n");
    console.error("Soluções recomendadas:");
    console.error(" - Use a Connection Pooler (Transaction mode) do Supabase (porta 6543) e defina como DATABASE_URL.");
    console.error(" - Ou defina DIRECT_URL_IPV4 com o endpoint pooler IPv4 fornecido pelo Supabase.");
    console.error(" - Verifique os Secrets do ambiente (Vercel / Supabase Preview / GitHub Actions) e atualize DOCUMENTATION/README se necessário.\n");
    console.error("Exemplo (pooler): postgres://postgres:PASS@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require\n");
    process.exit(1);
  }

  console.log(`✅ DATABASE_URL verificada (host=${hostname}, port=${port}).`);
  process.exit(0);
} catch (e) {
  console.error("❌ Erro ao parsear DATABASE_URL:", e && e.message ? e.message : String(e));
  process.exit(1);
}
