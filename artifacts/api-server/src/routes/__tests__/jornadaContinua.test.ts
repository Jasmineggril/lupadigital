/**
 * Jornada contínua: participação com tarefas e envio informado pela pessoa; Assistente usando
 * participação/projeto como contexto só da própria conta. Mesmos dois modos do continuidade.test
 * (memória no CI; banco real com LUPA_TEST_REST_URL/KEY). Contas e conteúdos fictícios.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";

const REAL = Boolean(process.env.LUPA_TEST_REST_URL && process.env.LUPA_TEST_REST_KEY);
const MODE = REAL ? "banco real (PostgREST)" : "memória";

let key: KeyLike;
let jwks: http.Server;
let server: http.Server;
let api = "";
const tok = (sub: string) =>
  new SignJWT({ sub, role: "authenticated", app_metadata: {}, user_metadata: {} }).setProtectedHeader({ alg: "ES256", kid: "k" }).setIssuedAt().setExpirationTime("10m").sign(key);
async function call(method: string, path: string, t?: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(api + path, { method, headers: { "content-type": "application/json", ...headers, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
async function startApp() {
  vi.resetModules();
  const { default: app } = await import("../../app");
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

// Usuários fictícios novos a cada execução (o banco real guarda execuções anteriores)
const A = randomUUID();
const B = randomUUID();
let ta = "";
let tb = "";

beforeAll(async () => {
  ({ privateKey: key } = await generateKeyPair("ES256"));
  const jwk = await exportJWK(key);
  delete jwk.d;
  jwks = http.createServer((_q, s) => s.end(JSON.stringify({ keys: [{ ...jwk, kid: "k", alg: "ES256", use: "sig" }] })));
  await new Promise<void>((r) => jwks.listen(0, "127.0.0.1", () => r()));
  process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/jwks.json`;
  process.env.RATE_LIMIT_DEFAULT_MAX = "100000";
  if (REAL) {
    delete process.env.LUPA_STORE;
    process.env.SUPABASE_URL = process.env.LUPA_TEST_REST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LUPA_TEST_REST_KEY;
  } else process.env.LUPA_STORE = "memory";
  await startApp();
  ta = await tok(A);
  tb = await tok(B);
}, 60_000);
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => jwks.close(() => r()));
});

describe(`jornada contínua — ${MODE}`, () => {
  it("participação: tarefas e envio informado pela pessoa; 'enviada' sem data é recusado (422); outra conta não vê", async () => {
    const created = await call("POST", "/participations", ta, { titulo: "Hackathon fictício de inovação", tipo: "hackathon" });
    expect([200, 201]).toContain(created.status);
    const p = created.body.participation;
    const v = p.version;
    const semData = await call("PATCH", `/participations/${p.id}`, ta, { expected_version: v, situacao: "enviada" });
    expect(semData.status).toBe(422);
    expect(semData.body.code).toBe("REGRA_PARTICIPACAO");
    const t = await call("PATCH", `/participations/${p.id}`, ta, { expected_version: v, tarefas: [{ titulo: "Gravar pitch", responsavel: "Ana", prazo: "2026-12-01", feito: false }] });
    expect(t.status).toBe(200);
    expect(t.body.participation.tarefas[0]).toMatchObject({ titulo: "Gravar pitch", responsavel: "Ana" });
    const env = await call("PATCH", `/participations/${p.id}`, ta, { expected_version: t.body.participation.version, submissao: { enviada_em: "2026-12-05", protocolo: "HACK-77" } });
    expect(env.status).toBe(200);
    expect(env.body.participation.situacao).toBe("enviada");
    expect(env.body.participation.submissao).toMatchObject({ enviada_em: "2026-12-05", protocolo: "HACK-77" });
    // reabrir traz tudo
    const again = await call("GET", `/participations/${p.id}`, ta);
    expect(again.body.participation.tarefas).toHaveLength(1);
    expect((await call("GET", `/participations/${p.id}`, tb)).status).toBe(404);
  });

  it("Assistente: participação/projeto como contexto só da própria conta (outra conta recebe 404 sem chamar a IA)", async () => {
    const p = (await call("POST", "/participations", ta, { titulo: "Participação fictícia para o Assistente" })).body.participation;
    const msg = { messages: [{ role: "user", content: "Quais documentos faltam?" }] };
    expect((await call("POST", "/niasci/chat", tb, { ...msg, participationId: p.id })).status).toBe(404);
    expect((await call("POST", "/niasci/chat", tb, { ...msg, projectId: randomUUID() })).status).toBe(404);
    // dona: passa da checagem de dono (a resposta depende da IA configurada no ambiente, não é 404)
    expect((await call("POST", "/niasci/chat", ta, { ...msg, participationId: p.id })).status).not.toBe(404);
  });
});
