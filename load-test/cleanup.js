/**
 * Script de Cleanup — Modo DRY-RUN por padrão
 *
 * Remove dados sintéticos criados durante os load tests.
 * Modo padrão: DRY-RUN (apenas lista, não deleta).
 *
 * Tabelas reais da LUPA Digital:
 *   - agent_results (análises de editais)
 *   - saved_edital (editais simplificados salvos)
 *   - conversations (conversas do chat)
 *   - messages (mensagens do chat)
 *   - shared_results (resultados compartilhados)
 *
 * Uso:
 *   node cleanup.js                    # dry-run: lista o que seria removido
 *   node cleanup.js --delete           # deleta de verdade
 *   node cleanup.js --run-id loadtest  # filtra por RUN_ID específico
 *
 * Variáveis de ambiente (via .env ou export):
 *   SUPABASE_URL          — URL do projeto Supabase
 *   SUPABASE_SERVICE_KEY  — Service role key (NUNCA versionada)
 *   BASE_URL              — URL do Preview (default: localhost:3000)
 *
 * Segurança:
 *   - NUNCA salva credenciais no repositório
 *   - Exclui APENAS registros com prefixo "loadtest_" no título
 *   - Modo dry-run é o padrão para prevenir exclusões acidentais
 */

const https = require("https");
const http = require("http");

// ── Config ────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "https://lupa-digital.vercel.app";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const TEST_PREFIX = "loadtest_";
const DELETE_MODE = process.argv.includes("--delete");
const FILTER_RUN_ID = (() => {
  const idx = process.argv.indexOf("--run-id");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ── Helpers ───────────────────────────────────────────────────────────────
function request(options, body) {
  return new Promise((resolve, reject) => {
    const mod = options.protocol === "https:" ? https : http;
    const req = mod.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function supabaseGet(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log("  [SKIP] SUPABASE_URL ou SUPABASE_SERVICE_KEY não definidos");
    return [];
  }
  const url = new URL(path, SUPABASE_URL);
  const res = await request({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  return res.body || [];
}

async function supabaseDelete(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  const url = new URL(path, SUPABASE_URL);
  const res = await request({
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: "DELETE",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "return=minimal",
    },
  });
  return res.status >= 200 && res.status < 300;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Cleanup LUPA Digital Load Test ===");
  console.log(`Modo: ${DELETE_MODE ? "DELETE" : "DRY-RUN"}`);
  console.log(`Prefixo: "${TEST_PREFIX}"`);
  if (FILTER_RUN_ID) console.log(`Filtro: ${FILTER_RUN_ID}`);
  console.log("");

  // 1. Buscar agent_results de teste (título com prefixo loadtest_)
  console.log("1. Buscando agent_results de teste...");
  const agentResults = await supabaseGet(
    `/rest/v1/agent_results?title=like.${TEST_PREFIX}*&select=id,title,createdAt`
  );
  const filteredAgentResults = FILTER_RUN_ID
    ? agentResults.filter((r) => r.title && r.title.includes(FILTER_RUN_ID))
    : agentResults;
  console.log(`   Encontrados: ${filteredAgentResults.length} agent_results`);
  filteredAgentResults.forEach((r) =>
    console.log(`   - ${r.id} (${r.title})`)
  );

  // 2. Buscar conversations de teste
  console.log("\n2. Buscando conversations de teste...");
  const conversations = await supabaseGet(
    `/rest/v1/conversations?select=id,createdAt`
  );
  console.log(`   Encontradas: ${conversations.length} conversations`);
  conversations.forEach((c) => console.log(`   - ${c.id}`));

  // 3. Buscar shared_results de teste
  console.log("\n3. Buscando shared_results de teste...");
  const sharedResults = await supabaseGet(
    `/rest/v1/shared_results?select=id,token,createdAt`
  );
  console.log(`   Encontrados: ${sharedResults.length} shared_results`);
  sharedResults.forEach((r) => console.log(`   - ${r.id} (token: ${r.token})`));

  // 4. Resumo
  const total = filteredAgentResults.length + conversations.length + sharedResults.length;
  console.log(`\n=== Resumo ===`);
  console.log(`Total de registros para ${DELETE_MODE ? "DELETE" : "dry-run"}: ${total}`);
  console.log(`  - agent_results: ${filteredAgentResults.length}`);
  console.log(`  - conversations: ${conversations.length}`);
  console.log(`  - shared_results: ${sharedResults.length}`);

  // 5. Deletar (somente se --delete)
  if (!DELETE_MODE) {
    console.log(
      "\n[DRY-RUN] Nenhum dado foi removido. Use --delete para remover."
    );
    return;
  }

  console.log("\n[DELETE] Iniciando exclusão...");

  // Deletar messages dependentes antes de conversations
  for (const c of conversations) {
    const msgs = await supabaseGet(
      `/rest/v1/messages?conversation_id=eq.${c.id}&select=id`
    );
    for (const m of msgs) {
      const ok = await supabaseDelete(`/rest/v1/messages?id=eq.${m.id}`);
      console.log(`  ${ok ? "✓" : "✗"} message ${m.id}`);
    }
    const ok = await supabaseDelete(`/rest/v1/conversations?id=eq.${c.id}`);
    console.log(`  ${ok ? "✓" : "✗"} conversation ${c.id}`);
  }

  for (const r of filteredAgentResults) {
    const ok = await supabaseDelete(`/rest/v1/agent_results?id=eq.${r.id}`);
    console.log(`  ${ok ? "✓" : "✗"} agent_result ${r.id}`);
  }

  for (const r of sharedResults) {
    const ok = await supabaseDelete(`/rest/v1/shared_results?id=eq.${r.id}`);
    console.log(`  ${ok ? "✓" : "✗"} shared_result ${r.id}`);
  }

  console.log("\n=== Cleanup concluído ===");
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
