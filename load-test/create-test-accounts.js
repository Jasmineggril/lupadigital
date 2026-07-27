/**
 * Script de criação de contas de teste — NÃO versionado
 *
 * Cria 5 contas de teste com prefixo "test_" no email.
 * Executado manualmente antes dos load tests.
 *
 * Uso:
 *   node create-test-accounts.js
 *
 * Variáveis de ambiente (via .env ou export):
 *   SUPABASE_URL          — URL do projeto Supabase
 *   SUPABASE_SERVICE_KEY  — Service role key
 *
 * Saída:
 *   - Imprime emails e IDs
 *   - Salva tokens em .tokens.json (gitignored)
 *
 * Segurança:
 *   - NUNCA salva credenciais no repositório
 *   - Tokens expiram em 1 hora
 *   - Contas podem ser removidas via cleanup.js --delete
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const TEST_ACCOUNTS = [
  { email: "test_admin@loadtest.local", password: "TestPassword123!" },
  { email: "test_user1@loadtest.local", password: "TestPassword123!" },
  { email: "test_user2@loadtest.local", password: "TestPassword123!" },
  { email: "test_user3@loadtest.local", password: "TestPassword123!" },
  { email: "test_user4@loadtest.local", password: "TestPassword123!" },
];

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
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

async function createAccount(email, password) {
  const url = new URL("/auth/v1/signup", SUPABASE_URL);
  const res = await request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    },
    { email, password }
  );
  return res;
}

async function signIn(email, password) {
  const url = new URL("/auth/v1/token?grant_type=password", SUPABASE_URL);
  const res = await request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY,
      },
    },
    { email, password }
  );
  return res;
}

async function main() {
  console.log("=== Criação de Contas de Teste ===\n");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "Erro: SUPABASE_URL e SUPABASE_SERVICE_KEY devem ser definidos."
    );
    console.error("Uso:");
    console.error("  export SUPABASE_URL=https://xxxxx.supabase.co");
    console.error("  export SUPABASE_SERVICE_KEY=eyJ...");
    console.error("  node create-test-accounts.js");
    process.exit(1);
  }

  const tokens = [];

  for (const acct of TEST_ACCOUNTS) {
    console.log(`Criando: ${acct.email}`);
    const createRes = await createAccount(acct.email, acct.password);
    if (createRes.status === 200 || createRes.status === 201) {
      console.log(`  ✓ Conta criada: ${createRes.body.id}`);
    } else if (
      createRes.status === 400 &&
      createRes.body.msg?.includes("already")
    ) {
      console.log(`  → Conta já existe, fazendo login...`);
    } else {
      console.error(`  ✗ Erro ${createRes.status}: ${JSON.stringify(createRes.body)}`);
      continue;
    }

    const loginRes = await signIn(acct.email, acct.password);
    if (loginRes.status === 200 && loginRes.body.access_token) {
      console.log(`  ✓ Token obtido (${loginRes.body.access_token.length} chars)`);
      tokens.push({
        email: acct.email,
        token: loginRes.body.access_token,
        expires_in: loginRes.body.expires_in,
      });
    } else {
      console.error(
        `  ✗ Login falhou: ${loginRes.status} ${JSON.stringify(loginRes.body)}`
      );
    }
  }

  // Salvar tokens (gitignored)
  const tokensPath = path.join(__dirname, ".tokens.json");
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
  console.log(`\n✓ Tokens salvos em: ${tokensPath}`);
  console.log("  ⚠ ADICIONE .tokens.json AO .gitignore!");

  // Imprimir resumo
  console.log("\n=== Resumo ===");
  tokens.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.email} → ${t.token.substring(0, 20)}...`);
  });
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
