/**
 * Rotas das análises longas pela API HTTP real (JWT ES256 verificado por JWKS local, banco em
 * memória de testes, IA SIMULADA): login obrigatório, isolamento entre pessoas, corpo de ~1 milhão
 * de caracteres aceito, leitura completa até o fim e agendador protegido por segredo.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { buildLongEdital, fakeFacts, mainPart } from "../../lib/longdoc/__tests__/fixtures";

let key: KeyLike;
let jwks: http.Server;
let server: http.Server;
let api = "";
const tok = (sub: string) =>
  new SignJWT({ sub, role: "authenticated", app_metadata: {}, user_metadata: {} }).setProtectedHeader({ alg: "ES256", kid: "k" }).setIssuedAt().setExpirationTime("10m").sign(key);
async function call(method: string, path: string, t?: string, body?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(api + path, { method, headers: { "content-type": "application/json", ...extra, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  ({ privateKey: key } = await generateKeyPair("ES256"));
  const jwk = await exportJWK(key);
  delete jwk.d;
  jwks = http.createServer((_q, s) => s.end(JSON.stringify({ keys: [{ ...jwk, kid: "k", alg: "ES256", use: "sig" }] })));
  await new Promise<void>((r) => jwks.listen(0, "127.0.0.1", () => r()));
  process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/jwks.json`;
  process.env.LUPA_STORE = "memory";
  process.env.GROQ_API_KEY = "test-key-jobs";
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";
  process.env.CRON_SECRET = "s".repeat(40);
  const { setLongDocAnalyzerForTests } = await import("../../lib/longdoc/jobs");
  setLongDocAnalyzerForTests(async (_a, prompt) => ({ facts: fakeFacts(prompt), tokens: Math.ceil(mainPart(prompt).length / 4) }));
  const { default: app } = await import("../../app");
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => jwks.close(() => r()));
});

describe("/edital/jobs", () => {
  it("limites públicos; sem login → 401", async () => {
    const l = await call("GET", "/edital/limits");
    expect(l.status).toBe(200);
    expect(l.body.documento_max_caracteres).toBeGreaterThanOrEqual(1_000_000);
    expect(l.body.requer_login).toBe(true);
    expect((await call("POST", "/edital/jobs", undefined, { agentId: "simples", text: "x".repeat(100) })).status).toBe(401);
  });

  it("≈1 milhão de caracteres pela API: aceito, lido até o fim; outra pessoa recebe 404", async () => {
    const a = await tok("pessoa-a");
    const b = await tok("pessoa-b");
    const text = buildLongEdital(1_000_000);
    const created = await call("POST", "/edital/jobs", a, { agentId: "documentacao", text });
    expect(created.status).toBe(201);
    expect(created.body.documento.caracteres).toBeGreaterThanOrEqual(1_000_000);
    expect(created.body).not.toHaveProperty("document_text");
    const id = created.body.id;
    expect((await call("GET", `/edital/jobs/${id}`, b)).status).toBe(404);
    expect((await call("POST", `/edital/jobs/${id}/advance`, b)).status).toBe(404);
    let v = created.body;
    for (let i = 0; i < 50 && !["concluida", "parcial", "falhou"].includes(v.status); i += 1) v = (await call("POST", `/edital/jobs/${id}/advance`, a)).body;
    expect(v.status).toBe("concluida");
    expect(v.cobertura.caracteres_analisados).toBe(v.cobertura.caracteres_totais);
    expect(JSON.stringify(v.resultado.checklist)).toContain("DCE-FIM");
    const list = await call("GET", "/edital/jobs", a);
    expect(list.body.jobs[0]).toMatchObject({ id, status: "concluida" });
    expect((await call("GET", "/edital/jobs", b)).body.jobs).toHaveLength(0);
  }, 120_000);

  it("agendador: sem segredo → 401; com segredo → avança tarefas prontas", async () => {
    expect((await call("POST", "/cron/analysis-jobs")).status).toBe(401);
    const a = await tok("pessoa-c");
    const created = await call("POST", "/edital/jobs", a, { agentId: "simples", text: buildLongEdital(80_000) });
    const r = await call("POST", "/cron/analysis-jobs", undefined, undefined, { authorization: `Bearer ${"s".repeat(40)}` });
    expect(r.status).toBe(200);
    expect(r.body.avancadas.find((x: { id: string }) => x.id === created.body.id)?.status).toBe("concluida");
  }, 60_000);
});
