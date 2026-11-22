/**
 * Histórico de análises (agent_results) — fonte única do /testar para usuários logados.
 * JWT real (ES256) verificado por JWKS local; banco: modo memória de testes (db-http).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";

let key: KeyLike;
let jwks: http.Server;
let server: http.Server;
let api = "";

const tok = (sub: string) =>
  new SignJWT({ sub, role: "authenticated", app_metadata: {}, user_metadata: {} })
    .setProtectedHeader({ alg: "ES256", kid: "k" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);

async function call(method: string, path: string, t?: string, body?: unknown) {
  const r = await fetch(api + path, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  process.env.GROQ_API_KEY = "gsk_" + "x".repeat(40);
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";
  const { default: app } = await import("../../app");
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => jwks.close(() => r()));
});
beforeEach(async () => (await import("../../lib/db-http")).resetMemoryTables());

const sample = (title: string) => ({
  agentId: "acompanhamento",
  title,
  originalText: "EDITAL Nº 07/2026. Inscrições até 28/02/2027.",
  resultJson: {
    type: "acompanhamento",
    processing: { mode: "single", complete: true },
    base: { versao: 1, documento_hash: "abc", datas: [{ rotulo: "inscrições", iso: "2027-02-28", texto: "x", evidencia: "Inscrições até 28/02/2027." }] },
    verificacao: [],
    timeline: [{ fase: "Inscrições", periodo: "até 28/02/2027" }],
  },
});

describe("histórico de análises", () => {
  it("sem login → 401; com login lista só os próprios registros", async () => {
    expect((await call("GET", "/edital/agent-history")).status).toBe(401);
    const a = await tok("user-a");
    const b = await tok("user-b");
    expect((await call("POST", "/edital/agent-history", a, sample("A1"))).status).toBe(201);
    expect((await call("POST", "/edital/agent-history", b, sample("B1"))).status).toBe(201);
    const listA = (await call("GET", "/edital/agent-history", a)).body;
    expect(listA.map((r: any) => r.title)).toEqual(["A1"]);
  });

  it("reabrir devolve o mesmo resultado exibido (base, verificação, processamento)", async () => {
    const a = await tok("user-a");
    const saved = (await call("POST", "/edital/agent-history", a, sample("A1"))).body;
    const [row] = (await call("GET", "/edital/agent-history", a)).body;
    expect(row.id).toBe(saved.id);
    expect(row.resultJson.base.datas[0].iso).toBe("2027-02-28");
    expect(row.resultJson.processing).toEqual({ mode: "single", complete: true });
  });

  it("análise pronta do servidor (com fatos e documento longo) é salva e reaberta SEM reconstrução", async () => {
    const a = await tok("user-canon");
    const resultJson = {
      schemaVersion: "1.0.1",
      analysisId: "analysis-x",
      type: "documentacao",
      interpretation: { deadlines: "Inscrições até 30/04/2027" },
      base: { versao: 1, documento_hash: "h", datas: [] },
      fatos: { versao: 1, prazo_inscricao: { iso: "2027-04-30", texto: "30/04/2027" }, conflitos: [], exigencias: [], campos: [], qualificadores_sem_respaldo: [] },
      documento_longo: { versao: 1, cobertura: { total_partes: 90, partes_analisadas: 90, completa: true } },
      processing: { mode: "durable", complete: true, totalChunks: 90 },
    };
    await call("POST", "/edital/agent-history", a, { agentId: "documentacao", title: "Longo", originalText: "EDITAL longo fictício. Inscrições até 30/04/2027.", resultJson });
    const [row] = (await call("GET", "/edital/agent-history", a)).body;
    expect(row.resultJson).toEqual(resultJson);
  });

  it("favorito e exclusão só no próprio registro", async () => {
    const a = await tok("user-a");
    const b = await tok("user-b");
    const saved = (await call("POST", "/edital/agent-history", a, sample("A1"))).body;
    expect((await call("PATCH", `/edital/agent-history/${saved.id}`, b, { favorito: true })).status).toBe(404);
    expect((await call("DELETE", `/edital/agent-history/${saved.id}`, b)).status).toBe(404);
    expect((await call("PATCH", `/edital/agent-history/${saved.id}`, a, { favorito: true })).body.favorito).toBe(true);
    expect((await call("PATCH", `/edital/agent-history/${saved.id}`, a, { favorito: "sim" })).status).toBe(400);
    expect((await call("DELETE", `/edital/agent-history/${saved.id}`, a)).status).toBe(204);
    expect((await call("GET", "/edital/agent-history", a)).body).toEqual([]);
  });

  it("banco indisponível → 503 com mensagem clara ao salvar, listar, favoritar e excluir (nunca 'salvo')", async () => {
    const t = await tok("user-a");
    const prev = { store: process.env.LUPA_STORE, url: process.env.SUPABASE_URL };
    // Sem modo memória e sem Supabase configurado: toda chamada ao banco falha
    delete process.env.LUPA_STORE;
    delete process.env.SUPABASE_URL;
    try {
      const save = await call("POST", "/edital/agent-history", t, sample("A1"));
      expect(save.status).toBe(503);
      expect(save.body.error).toMatch(/Nada foi gravado/);
      const list = await call("GET", "/edital/agent-history", t);
      expect(list.status).toBe(503);
      expect(list.body.error).toMatch(/histórico/);
      expect((await call("PATCH", "/edital/agent-history/1", t, { favorito: true })).status).toBe(503);
      const del = await call("DELETE", "/edital/agent-history/1", t);
      expect(del.status).toBe(503);
      expect(del.body.error).toMatch(/Nada foi apagado/);
    } finally {
      process.env.LUPA_STORE = prev.store;
      if (prev.url) process.env.SUPABASE_URL = prev.url;
    }
  });
});
