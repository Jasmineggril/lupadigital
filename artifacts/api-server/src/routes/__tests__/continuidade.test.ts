/**
 * Continuidade: salvar → recuperar → continuar, idempotência, conflito entre abas, conversas
 * separadas, itens do Aprender/glossário, "Meu histórico" com paginação, isolamento A/B e
 * exportação/exclusão.
 *
 * Dois modos:
 *   - BANCO REAL (prova de persistência durável): LUPA_TEST_REST_URL + LUPA_TEST_REST_KEY apontando
 *     para a pilha de desenvolvimento (scripts/dev-db/stack.sh: Postgres + PostgREST, mesmo caminho
 *     do Supabase). Inclui "reiniciar a API": um app NOVO lê o que o anterior gravou.
 *   - MEMÓRIA (CI comum): mesma lógica de rotas; NÃO prova durabilidade.
 * Contas e conteúdos fictícios.
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

describe(`continuidade — ${MODE}`, () => {
  it("Editais: salvar (idempotente) → reabrir o MESMO resultado sem IA → continuar o trabalho (estado com versão) → conflito entre abas", async () => {
    const idem = randomUUID();
    const body = { agentId: "documentacao", title: "Edital fictício 01", originalText: "EDITAL fictício com texto suficiente para teste.", resultJson: { schemaVersion: "1.0.1", interpretation: { summary: "Resumo fictício" }, base: { versao: 1 }, processing: { mode: "durable", complete: false } } };
    const first = await call("POST", "/edital/agent-history", ta, body, { "idempotency-key": idem });
    const again = await call("POST", "/edital/agent-history", ta, body, { "idempotency-key": idem }); // clique repetido
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(first.body.status).toBe("parcial"); // análise parcial também é guardada, identificada
    const id = first.body.id;
    const reopened = await call("GET", `/edital/agent-history/${id}`, ta);
    expect(reopened.body.resultJson).toEqual(body.resultJson);
    // continuar: checklist marcado + anotação + pergunta do chat
    const v = reopened.body.version;
    const estado = { checklist: [true, false], anotacoes: "Pedir carta ao coordenador", chat: [{ question: "Prazo?", answer: "30/04/2027" }] };
    const saved = await call("PATCH", `/edital/agent-history/${id}`, ta, { estado }, { "if-match": String(v) });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(v + 1);
    // outra aba ainda com a versão antiga: 409, nada sobrescrito
    const stale = await call("PATCH", `/edital/agent-history/${id}`, ta, { estado: { anotacoes: "versão velha" } }, { "if-match": String(v) });
    expect(stale.status).toBe(409);
    expect(stale.body.atual.estado).toEqual(estado);
    // outra pessoa
    expect((await call("GET", `/edital/agent-history/${id}`, tb)).status).toBe(404);
    expect((await call("PATCH", `/edital/agent-history/${id}`, tb, { favorito: true })).status).toBe(404);
  });

  it("Assistente: conversas separadas, mensagens na ordem, renomear, favoritar; excluir apaga as mensagens dela", async () => {
    const c1 = (await call("POST", "/resources/conversations", ta, { title: "Metodologia" }, { "idempotency-key": randomUUID() })).body;
    const c2 = (await call("POST", "/resources/conversations", ta, { title: "ABNT" }, { "idempotency-key": randomUUID() })).body;
    for (const [c, txt] of [[c1, "pergunta 1 da conversa 1"], [c2, "pergunta da conversa 2"], [c1, "pergunta 2 da conversa 1"]] as const) {
      const r = await call("POST", "/resources/chat_messages", ta, { conversation_id: String(c.id), role: "user", content: txt }, { "idempotency-key": randomUUID() });
      expect(r.status).toBe(201);
    }
    const m1 = (await call("GET", `/resources/chat_messages?conversation_id=${c1.id}`, ta)).body;
    expect(m1.map((m: { content: string }) => m.content)).toEqual(["pergunta 1 da conversa 1", "pergunta 2 da conversa 1"]); // só a conversa 1, em ordem
    // mensagem repetida (nova tentativa) não duplica
    const k = randomUUID();
    await call("POST", "/resources/chat_messages", ta, { conversation_id: String(c2.id), role: "user", content: "reenvio" }, { "idempotency-key": k });
    await call("POST", "/resources/chat_messages", ta, { conversation_id: String(c2.id), role: "user", content: "reenvio" }, { "idempotency-key": k });
    expect((await call("GET", `/resources/chat_messages?conversation_id=${c2.id}`, ta)).body).toHaveLength(2);
    const ren = await call("PATCH", `/resources/conversations/${c1.id}/meta`, ta, { titulo: "Metodologia mista", favorito: true });
    expect(ren.body).toMatchObject({ title: "Metodologia mista", favorito: true });
    expect((await call("GET", `/resources/chat_messages?conversation_id=${c1.id}`, tb)).body).toEqual([]); // B não vê
    expect((await call("DELETE", `/resources/conversations/${c2.id}`, ta)).status).toBe(204);
    expect((await call("GET", `/resources/chat_messages?conversation_id=${c2.id}`, ta)).body).toEqual([]);
  });

  it("e-Lattes / Artigos / Planetário: salvar, renomear, favoritar, conflito de versão", async () => {
    const l = (await call("POST", "/resources/lattes_profiles", ta, { name: "Leitura fictícia", lattes_xml: "Currículo fictício", summary: "s", metadata: { result: { resumo: "r" } } }, { "idempotency-key": randomUUID() })).body;
    const art = (await call("POST", "/resources/article_analyses", ta, { title: "Artigo fictício", authors: [], summary: "s", metadata: { result: {}, leitura: { integral: false, caracteres_lidos: 20000, caracteres_totais: 35000 } } })).body;
    await call("POST", "/resources/planetarium_contents", ta, { title: "Sistema Solar", content: "c", audience: "escolar", metadata: { result: {} } });
    const up = await call("PUT", `/resources/article_analyses/${art.id}`, ta, { metadata: { result: {}, leitura: { integral: false }, anotacoes: "ler seção 3" } }, { "if-match": "1" });
    expect(up.status).toBe(200);
    expect(up.body.version).toBe(2);
    const conflict = await call("PUT", `/resources/article_analyses/${art.id}`, ta, { metadata: { anotacoes: "velha" } }, { "if-match": "1" });
    expect(conflict.status).toBe(409);
    expect((await call("PATCH", `/resources/lattes_profiles/${l.id}/meta`, ta, { favorito: true })).body.favorito).toBe(true);
  });

  it("Aprender e glossário: progresso salvo; favoritos; consultas recentes só com a opção ativa e limitadas", async () => {
    const prog = { etapa: 3, maxima: 4, quiz: [1, null, 2], concluido: false };
    expect((await call("PUT", "/me/items/aprendizagem/ler-edital", ta, { data: prog })).status).toBe(200);
    expect((await call("GET", "/me/items?kind=aprendizagem", ta)).body.items[0].data).toEqual(prog);
    expect((await call("GET", "/me/items?kind=aprendizagem", tb)).body.items).toEqual([]);
    await call("PUT", "/me/items/glossario_favorito/contrapartida", ta, { data: {} });
    expect((await call("PUT", "/me/items/glossario_recente/edital", ta, { data: {} })).body.code).toBe("RECENTES_DESATIVADAS");
    await call("PUT", "/me/items/preferencia/glossario_recentes", ta, { data: { ativo: true } });
    for (let i = 0; i < 25; i += 1) await call("PUT", `/me/items/glossario_recente/termo-${i}`, ta, { data: {} });
    expect((await call("GET", "/me/items?kind=glossario_recente", ta)).body.items.length).toBe(20);
    await call("PUT", "/me/items/preferencia/glossario_recentes", ta, { data: { ativo: false } }); // desativar apaga
    expect((await call("GET", "/me/items?kind=glossario_recente", ta)).body.items).toEqual([]);
  });

  it("Meu histórico: todas as ferramentas, filtros, busca, favoritos primeiro, paginação; só os do próprio usuário", async () => {
    for (let i = 0; i < 23; i += 1) await call("POST", "/resources/planetarium_contents", ta, { title: `Roteiro ${i}`, content: "c", audience: "geral", metadata: {} });
    const h1 = await call("GET", "/me/history?por_pagina=20&pagina=1", ta);
    expect(h1.status).toBe(200);
    expect(h1.body.total).toBeGreaterThanOrEqual(23 + 5);
    expect(h1.body.itens).toHaveLength(20);
    const ferramentas = new Set((await call("GET", "/me/history?por_pagina=50", ta)).body.itens.map((i: { ferramenta: string }) => i.ferramenta));
    for (const f of ["editais", "assistente", "elattes", "artigos", "planetario"]) expect(ferramentas, f).toContain(f);
    const p2 = await call("GET", "/me/history?por_pagina=20&pagina=2", ta);
    expect(p2.body.itens.length).toBe(h1.body.total - 20 > 20 ? 20 : h1.body.total - 20);
    expect(h1.body.itens[0].favorito).toBe(true); // fixados primeiro
    const busca = await call("GET", `/me/history?q=${encodeURIComponent("metodologia")}`, ta);
    expect(busca.body.itens.map((i: { titulo: string }) => i.titulo)).toEqual(["Metodologia mista"]);
    const so = await call("GET", "/me/history?ferramenta=editais", ta);
    expect(so.body.itens.every((i: { ferramenta: string }) => i.ferramenta === "editais")).toBe(true);
    expect(so.body.itens[0]).toMatchObject({ situacao: "parcial", link: expect.stringMatching(/^\/testar\?analise=/) });
    expect(h1.body.resumos.aprendizagem).toMatchObject({ etapa: 3 });
    expect(h1.body.resumos.glossario).toMatchObject({ favoritos: 1 });
    expect((await call("GET", "/me/history", tb)).body.total).toBe(0);
    expect((await call("GET", "/me/history")).status).toBe(401);
  });

  it.runIf(REAL)("reiniciar a API: um servidor NOVO recupera tudo o que foi confirmado como salvo", async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await startApp();
    const h = await call("GET", "/me/history?por_pagina=50", ta);
    expect(h.body.total).toBeGreaterThanOrEqual(28);
    const ed = h.body.itens.find((i: { ferramenta: string }) => i.ferramenta === "editais");
    expect((await call("GET", `/edital/agent-history/${ed.id}`, ta)).body.estado.anotacoes).toBe("Pedir carta ao coordenador");
  });

  it("exportação inclui os novos registros; exclusão apaga e não toca nos de outra pessoa", async () => {
    await call("PUT", "/me/items/aprendizagem/ler-edital", tb, { data: { etapa: 1 } });
    const exp = await call("GET", "/me/export", ta);
    expect(exp.status).toBe(200);
    const secoes = JSON.stringify(exp.body.secoes ?? exp.body);
    for (const t of ["user_items", "conversations", "chat_messages", "agent_results"]) expect(secoes, t).toContain(t);
    const del = await call("DELETE", "/me/data", ta, { confirmacao: "EXCLUIR MEUS DADOS" });
    expect([200, 207]).toContain(del.status);
    expect((await call("GET", "/me/history", ta)).body.total).toBe(0);
    expect((await call("GET", "/me/items?kind=aprendizagem", tb)).body.items).toHaveLength(1);
  });
});
