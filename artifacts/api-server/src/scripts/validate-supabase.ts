/**
 * validate-supabase.ts
 * Script de validação da integração com Supabase.
 * Executa fora do servidor Express — sem alterar dados de produção.
 * Roda com: npx tsx src/scripts/validate-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────
// 1. Leitura de variáveis (sem exibir valores)
// ──────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DIRECT_URL_IPV4 ?? "";
const VITE_URL = process.env.VITE_SUPABASE_URL ?? "";
const VITE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? "";

type Status = "✅" | "❌" | "⚠️";

interface Check {
  name: string;
  status: Status;
  detail: string;
}

const checks: Check[] = [];

function ok(name: string, detail: string) {
  checks.push({ name, status: "✅", detail });
}
function fail(name: string, detail: string) {
  checks.push({ name, status: "❌", detail });
}
function warn(name: string, detail: string) {
  checks.push({ name, status: "⚠️", detail });
}

// ──────────────────────────────────────────────
// 2. Auditoria de variáveis
// ──────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════");
console.log("  LUPA Digital — Validação Supabase");
console.log("═══════════════════════════════════════════\n");

// Variáveis obrigatórias por spec
const required: Array<[string, string]> = [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY", ANON_KEY],
  ["SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY", SERVICE_ROLE_KEY],
  ["DATABASE_URL", DATABASE_URL],
  ["VITE_SUPABASE_URL", VITE_URL],
  ["VITE_SUPABASE_ANON_KEY", VITE_ANON],
];

console.log("── Variáveis de ambiente ──");
for (const [name, value] of required) {
  if (value) {
    const masked = value.slice(0, 12) + "..." + value.slice(-4);
    console.log(`  ✅  ${name.padEnd(44)} ${masked}`);
  } else {
    console.log(`  ❌  ${name.padEnd(44)} [AUSENTE]`);
  }
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("\n❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios. Abortando.\n");
  process.exit(1);
}

// Verificação de segurança: as chaves devem ser distintas
if (SERVICE_ROLE_KEY === ANON_KEY) {
  warn("Chaves distintas", "service_role == anon_key — verifique se as chaves estão corretas");
} else if (SERVICE_ROLE_KEY && ANON_KEY) {
  ok("Chaves distintas", "service_role ≠ anon_key");
}

// ──────────────────────────────────────────────
// 3. Clientes Supabase
// ──────────────────────────────────────────────
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ──────────────────────────────────────────────
// 4. Testes de conectividade e CRUD
// ──────────────────────────────────────────────
console.log("\n── Testes de conexão e CRUD ──");

// 4a. Ping — leitura simples (tabela que deve existir)
async function testRead(table: string): Promise<boolean> {
  const { error } = await adminClient
    .from(table)
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (error) {
    fail(`Leitura: ${table}`, error.message);
    return false;
  }
  ok(`Leitura: ${table}`, "SELECT ok");
  return true;
}

// 4b. Inserção + atualização + exclusão em ai_usage_logs (tabela de logs sem RLS crítica)
async function testCrudAiLogs(): Promise<void> {
  // Colunas reais da tabela (sem agent_id — esse campo só vai pro logContext local)
  const testPayload = {
    module: "__validate_script__",
    model: "gpt-5.4-mini",
    user_id: null,
    document_id: null,
    latency_ms: 0,
    success: true,
    error_message: null,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
  };

  // INSERT
  const { data: inserted, error: insertErr } = await adminClient
    .from("ai_usage_logs")
    .insert([testPayload])
    .select("id")
    .single();

  if (insertErr || !inserted) {
    fail("Inserção: ai_usage_logs", insertErr?.message ?? "sem retorno");
    return;
  }
  ok("Inserção: ai_usage_logs", `id=${inserted.id}`);

  const id = inserted.id;

  // UPDATE
  const { error: updateErr } = await adminClient
    .from("ai_usage_logs")
    .update({ latency_ms: 1 })
    .eq("id", id);

  if (updateErr) {
    fail("Atualização: ai_usage_logs", updateErr.message);
  } else {
    ok("Atualização: ai_usage_logs", "UPDATE ok");
  }

  // DELETE (limpeza do registro de teste)
  const { error: deleteErr } = await adminClient
    .from("ai_usage_logs")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    fail("Exclusão: ai_usage_logs", deleteErr.message);
  } else {
    ok("Exclusão: ai_usage_logs", "DELETE ok — registro de teste removido");
  }
}

// 4c. Teste de autenticação — verifica se o admin pode listar usuários
async function testAuth(): Promise<void> {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    fail("Autenticação (admin.listUsers)", error.message);
  } else {
    ok("Autenticação (admin.listUsers)", `${data.users.length} user(s) visíveis`);
  }
}

// 4d. Leitura de histórico — tabelas usadas pelo frontend
async function testHistoryTables(): Promise<void> {
  const tables = ["edital_analyses", "agent_results", "saved_editals", "ai_usage_logs"];
  for (const t of tables) {
    await testRead(t);
  }
}

// 4e. Teste de RLS — operação com anon_key (deve respeitar Row Level Security)
async function testAnonAccess(): Promise<void> {
  if (!ANON_KEY) {
    warn("RLS (anon_key)", "SUPABASE_ANON_KEY ausente — teste ignorado");
    return;
  }
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anonClient
    .from("ai_usage_logs")
    .select("id")
    .limit(1);

  if (error && (error.message.includes("JWT") || error.message.includes("row-level") || error.message.includes("permission"))) {
    ok("RLS (anon sem JWT)", "Acesso bloqueado corretamente pela RLS");
  } else if (error) {
    warn("RLS (anon sem JWT)", `Erro inesperado: ${error.message}`);
  } else {
    warn(
      "RLS (anon sem JWT)",
      `Retornou ${(data ?? []).length} linhas sem autenticação — verifique as políticas RLS da tabela`,
    );
  }
}

// ──────────────────────────────────────────────
// 5. Execução
// ──────────────────────────────────────────────
await testAuth();
await testHistoryTables();
await testCrudAiLogs();
await testAnonAccess();

// ──────────────────────────────────────────────
// 6. Relatório final
// ──────────────────────────────────────────────
console.log("\n── Resultado dos testes ──");
let errors = 0;
let warnings = 0;
for (const c of checks) {
  console.log(`  ${c.status}  ${c.name.padEnd(40)} ${c.detail}`);
  if (c.status === "❌") errors++;
  if (c.status === "⚠️") warnings++;
}

console.log("\n── Variáveis encontradas / ausentes ──");
const varStatus: Array<[string, string, boolean]> = [
  ["SUPABASE_URL", "Backend", !!SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY (ou _SECRET_KEY)", "Backend", !!SERVICE_ROLE_KEY],
  ["SUPABASE_ANON_KEY (ou _PUBLISHABLE_KEY)", "Backend", !!ANON_KEY],
  ["DATABASE_URL", "Drizzle/edital", !!DATABASE_URL],
  ["VITE_SUPABASE_URL", "Frontend", !!VITE_URL],
  ["VITE_SUPABASE_ANON_KEY", "Frontend", !!VITE_ANON],
];
for (const [name, usage, present] of varStatus) {
  const icon = present ? "✅" : "❌";
  console.log(`  ${icon}  ${name.padEnd(44)} (${usage})`);
}

console.log(`\n  Total: ${checks.length} verificações | ${errors} erro(s) | ${warnings} aviso(s)`);

if (errors > 0) {
  console.log("\n❌ Integração com problemas — veja os itens acima.\n");
  process.exit(1);
} else if (warnings > 0) {
  console.log("\n⚠️  Integração funcional com avisos.\n");
} else {
  console.log("\n✅ Integração validada com sucesso!\n");
}
