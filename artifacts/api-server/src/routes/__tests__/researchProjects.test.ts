/**
 * Projetos (NIASci): gerar → salvar → reabrir com o PAYLOAD REAL da tela (não {title}).
 * JWT real (ES256) + recursos em memória de testes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { planFromRecord, recordFromPlan, type ProjectPlan } from "@workspace/project-contract";

const PLAN = JSON.parse(fs.readFileSync(new URL("./fixture-plano-projeto.json", import.meta.url), "utf8")) as ProjectPlan;
let key: KeyLike;
let jwks: http.Server;
let srv: http.Server;
let api = "";
let A = "";
let B = "";
const tok = (sub: string) =>
  new SignJWT({ sub, role: "authenticated", app_metadata: {}, user_metadata: {} })
    .setProtectedHeader({ alg: "ES256", kid: "k" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
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
  process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/`;
  process.env.LUPA_STORE = "memory";
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";
  const { default: app } = await import("../../app");
  srv = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => srv.once("listening", () => r()));
  api = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api`;
  A = await tok("pesq-a");
  B = await tok("pesq-b");
});
afterAll(async () => {
  await new Promise<void>((r) => srv.close(() => r()));
  await new Promise<void>((r) => jwks.close(() => r()));
});
beforeEach(async () => (await import("../resources")).resetResourceMemory());

describe("Projetos: salvar e reabrir o plano completo", () => {
  it("aceita o payload legado da tela (equipe/cronograma como LISTAS)", async () => {
    const legacy = { title: PLAN.titulo, description: PLAN.resumo, team: PLAN.equipe, timeline: PLAN.cronograma };
    const r = await call("POST", "/resources/research_projects", A, legacy);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  });

  it("gerar → salvar → recarregar → reabrir devolve TODAS as seções, iguais", async () => {
    const saved = await call("POST", "/resources/research_projects", A, recordFromPlan(PLAN));
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const list = await call("GET", "/resources/research_projects", A);
    expect(list.body).toHaveLength(1);
    const reopened = planFromRecord(list.body[0]);
    expect(reopened.parcial).toBe(false);
    expect(reopened.plan).toEqual(PLAN);
    for (const k of ["objetivos", "equipe", "cronograma", "etapas", "indicadores", "riscos", "pendencias", "proximasAcoes"] as const) {
      expect(reopened.plan[k]?.length, k).toBeGreaterThan(0);
    }
    // outro usuário não vê
    expect((await call("GET", "/resources/research_projects", B)).body).toHaveLength(0);
  });

  it("registro antigo (sem plano) reabre o que existe e é marcado como parcial", () => {
    const old = planFromRecord({ title: "Antigo", description: "d", team: { a: 1 } as never, timeline: null });
    expect(old.parcial).toBe(true);
    expect(old.plan.titulo).toBe("Antigo");
    expect(old.plan.equipe).toEqual([]);
  });

  it("projeto manual: grava na conta, altera, isola entre contas e valida a estrutura", async () => {
    const manual = { title: "Projeto manual", objective: "o", description: "d", status: "planejamento", startDate: "", endDate: "", stages: [{ id: "s1", name: "Etapa 1", description: "", deadline: "2027-01-10", status: "pendente" }] };
    const c = await call("POST", "/resources/research_projects", A, { title: manual.title, description: "d", source: "manual", manual });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const up = await call("PUT", `/resources/research_projects/${c.body.id}`, A, { title: manual.title, source: "manual", manual: { ...manual, status: "em andamento" } });
    expect(up.status).toBe(200);
    expect(up.body.manual.status).toBe("em andamento");
    expect((await call("GET", "/resources/research_projects", B)).body).toHaveLength(0);
    expect((await call("PUT", `/resources/research_projects/${c.body.id}`, B, { title: "x", source: "manual", manual })).status).toBe(404);
    expect((await call("POST", "/resources/research_projects", A, { title: "x", source: "manual", manual: { ...manual, status: "inventado" } })).status).toBe(400);
  });

  it("plano com estrutura inválida é recusado (não grava lixo)", async () => {
    const r = await call("POST", "/resources/research_projects", A, { title: "x", plan: { objetivos: "não é lista" } });
    expect(r.status).toBe(400);
  });
});
