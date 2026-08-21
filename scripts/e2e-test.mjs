#!/usr/bin/env node

/**
 * @file scripts/e2e-test.mjs
 * @description End-to-end test script for LUPA Digital API.
 *
 * Tests all critical endpoints without requiring a full test framework.
 * Run with: node scripts/e2e-test.mjs
 *
 * Environment:
 *   API_URL — Base URL (default: http://localhost:3001)
 *   AUTH_TOKEN — JWT token for authenticated endpoints (optional)
 */

const API_URL = process.env.API_URL || "http://localhost:3001";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

let passed = 0;
let failed = 0;
let skipped = 0;

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

function assert(condition, msg) {
  if (condition) {
    log("  ✓", msg);
    passed++;
  } else {
    log("  ✗", msg);
    failed++;
  }
}

function skip(msg) {
  log("  ⊘", msg);
  skipped++;
}

async function request(method, path, body, headers = {}) {
  const url = `${API_URL}${path}`;
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

async function testHealthz() {
  console.log("\n── Health Check ──");
  const { status, json } = await request("GET", "/api/healthz");
  assert(status === 200, `GET /api/healthz → 200 (got ${status})`);
  assert(json?.status === "ok", `status is "ok"`);
  // uptime and cache are optional (newer server versions)
  if (typeof json?.uptime === "number") {
    assert(true, `uptime is number`);
  } else {
    skip("uptime field not present (server may need restart)");
  }
  if (typeof json?.cache === "object") {
    assert(true, `cache stats present`);
  } else {
    skip("cache stats not present (server may need restart)");
  }
}

async function testReadyz() {
  const { status, json } = await request("GET", "/api/readyz");
  assert(status === 200 || status === 503, `GET /api/readyz → 200/503 (got ${status})`);
  assert(typeof json?.database === "object", `database check present`);
}

async function testResourcesCRUD() {
  console.log("\n── Resources CRUD ──");

  if (!AUTH_TOKEN) {
    skip("No AUTH_TOKEN — skipping authenticated tests");
    return;
  }

  const authHeaders = { Authorization: `Bearer ${AUTH_TOKEN}` };

  // POST — create
  const createRes = await request("POST", "/api/resources/edital_analyses", {
    titulo: "E2E Test Edital",
    conteudo_original: "Teste automatizado",
    categoria: "teste",
  }, authHeaders);
  assert(createRes.status === 201, `POST /api/resources/edital_analyses → 201 (got ${createRes.status})`);
  const createdId = createRes.json?.id;

  if (createdId) {
    // GET — read
    const getRes = await request("GET", `/api/resources/edital_analyses/${createdId}`, null, authHeaders);
    assert(getRes.status === 200, `GET /api/resources/edital_analyses/${createdId} → 200 (got ${getRes.status})`);
    assert(getRes.json?.titulo === "E2E Test Edital", `titulo matches`);

    // PUT — update
    const updateRes = await request("PUT", `/api/resources/edital_analyses/${createdId}`, {
      titulo: "E2E Test Edital Updated",
    }, authHeaders);
    assert(updateRes.status === 200, `PUT → 200 (got ${updateRes.status})`);

    // DELETE — delete
    const deleteRes = await request("DELETE", `/api/resources/edital_analyses/${createdId}`, null, authHeaders);
    assert(deleteRes.status === 204, `DELETE → 204 (got ${deleteRes.status})`);

    // Verify deleted
    const verifyRes = await request("GET", `/api/resources/edital_analyses/${createdId}`, null, authHeaders);
    assert(verifyRes.status === 404, `GET after DELETE → 404 (got ${verifyRes.status})`);
  }
}

async function testShare() {
  console.log("\n── Share Flow ──");

  // POST — create share
  const createRes = await request("POST", "/api/edital/share", {
    agentId: "simplificar",
    title: "E2E Share Test",
    resultJson: { resumo: "Teste de compartilhamento" },
  });
  assert(createRes.status === 201, `POST /api/edital/share → 201 (got ${createRes.status})`);
  const token = createRes.json?.token;

  if (token) {
    // GET — retrieve share
    const getRes = await request("GET", `/api/edital/share/${token}`);
    assert(getRes.status === 200, `GET /api/edital/share/${token} → 200 (got ${getRes.status})`);
    assert(getRes.json?.title === "E2E Share Test", `shared title matches`);

    // GET — non-existent token
    const missRes = await request("GET", "/api/edital/share/nonexistent-token");
    assert(missRes.status === 404, `GET /api/edital/share/nonexistent → 404 (got ${missRes.status})`);
  }
}

async function testAgentHistory() {
  console.log("\n── Agent History ──");

  if (!AUTH_TOKEN) {
    skip("No AUTH_TOKEN — skipping agent history tests");
    return;
  }

  const authHeaders = { Authorization: `Bearer ${AUTH_TOKEN}` };

  // GET — list
  const listRes = await request("GET", "/api/edital/agent-history", null, authHeaders);
  assert(listRes.status === 200, `GET /api/edital/agent-history → 200 (got ${listRes.status})`);
  assert(Array.isArray(listRes.json), `response is array`);

  // POST — save
  const saveRes = await request("POST", "/api/edital/agent-history", {
    agentId: "simplificar",
    title: "E2E Agent History",
    originalText: "Texto original de teste para histórico de agente.",
    resultJson: { resumo: "Teste", tipo: "edital" },
  }, authHeaders);
  assert(saveRes.status === 201, `POST /api/edital/agent-history → 201 (got ${saveRes.status})`);
  const savedId = saveRes.json?.id;

  if (savedId) {
    // DELETE
    const delRes = await request("DELETE", `/api/edital/agent-history/${savedId}`, null, authHeaders);
    assert(delRes.status === 204, `DELETE /api/edital/agent-history/${savedId} → 204 (got ${delRes.status})`);
  }
}

async function testValidation() {
  console.log("\n── Input Validation ──");

  // Invalid agent analyze
  const res1 = await request("POST", "/api/edital/analyze", {});
  assert(res1.status === 400, `POST /api/edital/analyze with empty body → 400 (got ${res1.status})`);

  // Invalid Lattes (too short)
  const res2 = await request("POST", "/api/niasci/elattes/analyze", { text: "short" });
  assert(res2.status === 400, `POST /api/niasci/elattes/analyze with short text → 400 (got ${res2.status})`);

  // Invalid planetário
  const res3 = await request("POST", "/api/niasci/planetario/generate", {});
  assert(res3.status === 400, `POST /api/niasci/planetario/generate with empty body → 400 (got ${res3.status})`);

  // Invalid chat
  const res4 = await request("POST", "/api/niasci/chat", {});
  assert(res4.status === 400, `POST /api/niasci/chat with empty body → 400 (got ${res4.status})`);
}

async function testCORS() {
  console.log("\n── CORS ──");

  const res = await fetch(`${API_URL}/api/healthz`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert(
    res.headers.get("access-control-allow-origin") !== null,
    "CORS headers present"
  );
}

async function testRateLimitHeaders() {
  console.log("\n── Rate Limiting ──");

  const res = await fetch(`${API_URL}/api/healthz`);
  const hasRateLimit = res.headers.get("ratelimit-limit") !== null ||
                       res.headers.get("x-ratelimit-limit") !== null;
  assert(hasRateLimit, "Rate limit headers present");
}

async function testStats() {
  console.log("\n── Stats ──");

  if (!AUTH_TOKEN) {
    skip("No AUTH_TOKEN — skipping stats test");
    return;
  }

  const authHeaders = { Authorization: `Bearer ${AUTH_TOKEN}` };
  const res = await request("GET", "/api/edital/stats", null, authHeaders);
  assert(res.status === 200, `GET /api/edital/stats → 200 (got ${res.status})`);
  assert(typeof res.json?.total === "number", `total is number`);
  assert(Array.isArray(res.json?.byAgent), `byAgent is array`);
}

async function main() {
  console.log(`\n🧪 LUPA Digital E2E Tests`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Auth: ${AUTH_TOKEN ? "provided" : "not provided"}`);

  await testHealthz();
  await testReadyz();
  await testValidation();
  await testCORS();
  await testRateLimitHeaders();
  await testShare();
  await testResourcesCRUD();
  await testAgentHistory();
  await testStats();

  console.log(`\n─── Results ───`);
  console.log(`   ✓ ${passed} passed`);
  console.log(`   ✗ ${failed} failed`);
  console.log(`   ⊘ ${skipped} skipped`);
  console.log(`   Total: ${passed + failed + skipped}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
