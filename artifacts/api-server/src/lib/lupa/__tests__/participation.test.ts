/**
 * "Quero participar", perfil progressivo, importação Lattes com prévia, meus dados
 * (exportar/excluir) e compartilhamento — com JWT REAL (ES256) e DOIS usuários.
 * Banco: MemoryStore + memória do db-http (modo de TESTES, recusado em produção).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { MemoryStore, setStoreForTests, type OpportunityUpsert } from "../store";
import { deterministicCheck, compareFields, fromOpportunity } from "../participations";
import { sanitizeSharedResult, shareState } from "../../../routes/edital";

let key: KeyLike;
let jwksServer: http.Server;
let apiServer: http.Server;
let api = "";
let store: MemoryStore;
let A = "";
let B = "";

async function token(sub: string) {
  return new SignJWT({ sub, email: `${sub}@exemplo.test`, role: "authenticated", app_metadata: {}, user_metadata: {} })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(key);
}

async function call(method: string, path: string, tok?: string, body?: unknown) {
  const res = await fetch(api + path, {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function edital(overrides: Partial<OpportunityUpsert> = {}): OpportunityUpsert {
  return {
    source_id: "fapdf",
    canonical_url: "https://www.fap.df.gov.br/edital-ficticio-07-2026",
    edital_number: "07/2026",
    title: "Edital fictício nº 07/2026 — Pesquisa em saúde digital",
    status: "aberta",
    fields: {
      objeto: { value: "Apoio a projetos de pesquisa em saúde digital", evidence: "1. DO OBJETO. Apoio a projetos de pesquisa em saúde digital.", source_url: "x" },
      documentos: [
        { value: "Plano de trabalho", evidence: "5.2 Plano de trabalho com cronograma físico-financeiro.", source_url: "x" },
        { value: "Declaração de anuência", evidence: "5.3 Declaração de anuência da instituição.", source_url: "x" },
      ],
      datas: [{ label: "inscrições", iso: "2099-02-28", value: "28/02/2099", evidence: "Inscrições até 28/02/2099.", source_url: "x" }],
    },
    missing_fields: [],
    content_hash: "h1",
    documents: [],
    events: [],
    ...overrides,
  } as OpportunityUpsert;
}

beforeAll(async () => {
  ({ privateKey: key } = await generateKeyPair("ES256"));
  const jwk = await exportJWK(key);
  delete jwk.d;
  jwksServer = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", alg: "ES256", use: "sig" }] }));
  });
  await new Promise<void>((r) => jwksServer.listen(0, "127.0.0.1", () => r()));
  process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks.json`;
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";
  process.env.LUPA_STORE = "memory";
  const { default: app } = await import("../../../app");
  apiServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => apiServer.once("listening", () => r()));
  api = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api`;
  A = await token("usuaria-a");
  B = await token("usuario-b");
});

afterAll(async () => {
  setStoreForTests(null);
  await new Promise<void>((r) => apiServer.close(() => r()));
  await new Promise<void>((r) => jwksServer.close(() => r()));
});

beforeEach(async () => {
  store = new MemoryStore();
  setStoreForTests(store);
  (await import("../../db-http")).resetMemoryTables();
});

describe("Quero participar", () => {
  it("cria a partir do edital com documentos e prazos do texto; repetir não duplica; outro usuário não acessa", async () => {
    const { opportunity } = await store.upsertOpportunity(edital());
    const r1 = await call("POST", "/participations", A, { opportunity_id: opportunity.id });
    expect(r1.status).toBe(201);
    const p = r1.body.participation;
    expect(p.checklist.map((c: any) => c.item)).toEqual(["Plano de trabalho", "Declaração de anuência"]);
    expect(p.checklist[0]).toMatchObject({ origem: "edital", feito: false });
    expect(p.checklist[0].evidencia).toContain("5.2");
    expect(p.prazos[0]).toMatchObject({ rotulo: "inscrições", data: "2099-02-28", origem: "edital" });
    expect(p.exige_projeto).toBe(true);

    const r2 = await call("POST", "/participations", A, { opportunity_id: opportunity.id });
    expect(r2.status).toBe(200);
    expect(r2.body.existente).toBe(true);
    expect(r2.body.participation.id).toBe(p.id);
    expect((await call("GET", "/participations", A)).body.participations).toHaveLength(1);

    expect((await call("GET", `/participations/${p.id}`, B)).status).toBe(404);
    expect((await call("PATCH", `/participations/${p.id}`, B, { expected_version: 1, titulo: "invadido" })).status).toBe(404);
    expect((await call("DELETE", `/participations/${p.id}`, B)).status).toBe(404);
    expect((await call("GET", "/participations", B)).body.participations).toHaveLength(0);
    expect((await call("GET", "/participations")).status).toBe(401);
  });

  it("não aceita alterar dono, id ou origem; conflito de versão vira 409; itens do edital mantêm o texto", async () => {
    const { opportunity } = await store.upsertOpportunity(edital());
    const p = (await call("POST", "/participations", A, { opportunity_id: opportunity.id })).body.participation;
    expect((await call("PATCH", `/participations/${p.id}`, A, { expected_version: 1, user_id: "usuario-b" })).status).toBe(400);
    expect((await call("PATCH", `/participations/${p.id}`, A, { expected_version: 1, opportunity_id: "outro" })).status).toBe(400);

    const checklist = [
      { id: p.checklist[0].id, item: "TEXTO TROCADO", feito: true },
      { id: p.checklist[1].id, item: p.checklist[1].item, feito: false },
      { item: "Carta de apresentação (minha)", feito: false },
    ];
    const r = await call("PATCH", `/participations/${p.id}`, A, {
      expected_version: 1,
      checklist,
      situacao: "preparando",
      proposta: { problema: "Filas de regulação no DF" },
      salvar_versao: { nota: "primeiro rascunho" },
    });
    expect(r.status).toBe(200);
    const s = r.body.participation;
    expect(s.checklist[0]).toMatchObject({ item: "Plano de trabalho", origem: "edital", feito: true });
    expect(s.checklist[2]).toMatchObject({ item: "Carta de apresentação (minha)", origem: "usuario" });
    expect(s.versoes).toHaveLength(1);
    expect(s.versoes[0].proposta.problema).toBe("Filas de regulação no DF");
    expect(s.user_id).toBe("usuaria-a");

    const stale = await call("PATCH", `/participations/${p.id}`, A, { expected_version: 1, titulo: "aba antiga" });
    expect(stale.status).toBe(409);
    expect(stale.body.atual.version).toBe(2);
  });

  it("retificação: mostra o que mudou e quais partes são afetadas; aceitar mantém os itens da pessoa", async () => {
    const { opportunity } = await store.upsertOpportunity(edital());
    const p = (await call("POST", "/participations", A, { opportunity_id: opportunity.id })).body.participation;
    await call("PATCH", `/participations/${p.id}`, A, { expected_version: 1, checklist: [...p.checklist.map((c: any) => ({ id: c.id, item: c.item, feito: false })), { item: "Item meu", feito: true }] });

    const changed = edital({
      content_hash: "h2",
      fields: {
        ...edital().fields,
        datas: [{ label: "inscrições", iso: "2099-03-15", value: "15/03/2099", evidence: "Retificação: inscrições até 15/03/2099.", source_url: "x" }],
      },
    });
    await store.upsertOpportunity(changed);

    const g = await call("GET", `/participations/${p.id}`, A);
    expect(g.body.edital.version).toBe(2);
    const datas = g.body.mudancas.find((m: any) => m.campo === "datas");
    expect(datas.antes).toEqual(["inscrições: 2099-02-28"]);
    expect(datas.depois).toEqual(["inscrições: 2099-03-15"]);
    expect(datas.afeta).toContain("prazos");
    expect(g.body.conferencia.find((c: any) => c.id === "versao")?.nivel).toBe("atencao");
    // Nada foi alterado sozinho
    expect(g.body.participation.prazos[0].data).toBe("2099-02-28");

    const acc = await call("POST", `/participations/${p.id}/aceitar-versao`, A);
    expect(acc.status).toBe(200);
    expect(acc.body.participation.opportunity_version).toBe(2);
    expect(acc.body.participation.prazos[0].data).toBe("2099-03-15");
    expect(acc.body.participation.checklist.some((c: any) => c.item === "Item meu" && c.feito)).toBe(true);
    expect((await call("GET", `/participations/${p.id}`, A)).body.mudancas).toEqual([]);
  });

  it("a partir de uma análise salva: só do próprio usuário", async () => {
    const { httpInsert } = await import("../../db-http");
    const row = await httpInsert<Record<string, unknown>>("agent_results", {
      user_id: "usuaria-a",
      agent_id: "documentacao",
      title: "Hackathon fictício de dados abertos",
      original_text: "…",
      result_json: { base: { documentos: [{ texto: "Ficha de inscrição", trecho: "Anexo I — ficha de inscrição" }], datas: [{ rotulo: "inscrições", iso: "2099-01-10", trecho: "até 10/01/2099" }] } },
    });
    const id = Number(row.id);
    expect((await call("POST", "/participations", B, { agent_result_id: id })).status).toBe(404);
    const r = await call("POST", "/participations", A, { agent_result_id: id });
    expect(r.status).toBe(201);
    expect(r.body.participation.tipo).toBe("hackathon");
    expect(r.body.participation.checklist[0]).toMatchObject({ item: "Ficha de inscrição", origem: "analise" });
    expect(r.body.participation.prazos[0].data).toBe("2099-01-10");
  });

  it("conferência determinística: prazo vencido é impeditivo; sem documentos é 'desconhecido'", async () => {
    const { opportunity } = await store.upsertOpportunity(edital());
    const p = fromOpportunity("u", opportunity);
    const late = deterministicCheck(p, opportunity.version, "2100-01-01");
    expect(late.find((c) => c.id === "prazo")?.nivel).toBe("impeditivo");
    const none = deterministicCheck({ ...p, checklist: [] }, null, "2026-01-01");
    expect(none.find((c) => c.id === "documentos")?.nivel).toBe("desconhecido");
    expect(compareFields(null, opportunity.fields)).toEqual([]);
  });
});

describe("perfil progressivo e permissões", () => {
  it("vínculos múltiplos e objetivo atual; declarar 'docente' não dá acesso administrativo; campo desconhecido é recusado", async () => {
    const r = await call("PUT", "/profile", A, { vinculos: ["docente", "pesquisador"], objetivos: ["pesquisa", "concursos"], objetivo_atual: "encontrar", modalidade: "hibrido" });
    expect(r.status).toBe(200);
    expect(r.body.profile.vinculos).toEqual(["docente", "pesquisador"]);
    expect((await call("GET", "/me", A)).body.is_admin).toBe(false);
    expect((await call("GET", "/admin/status", A)).status).toBe(403);
    expect((await call("PUT", "/profile", A, { role: "admin" })).status).toBe(400);
    expect((await call("PUT", "/profile", A, { vinculos: ["administrador"] })).status).toBe(400);
  });

  it("importação Lattes: prévia não grava; dados confirmados não são sobrescritos sem escolha explícita", async () => {
    await call("PUT", "/profile", A, { institution: "UnDF" });
    const summary = { lattes_id: "1234567890123456", nome: "Pessoa Fictícia", instituicao: "Outra Instituição", areas: ["Saúde coletiva"], atualizado_em: "2026-10-01" };
    const prev = await call("POST", "/profile/lattes-import?previa=1", A, summary);
    expect(prev.status).toBe(200);
    expect(prev.body.previa).toBe(true);
    const inst = prev.body.mudancas.find((m: any) => m.campo === "institution");
    expect(inst).toMatchObject({ atual: "UnDF", novo: "Outra Instituição", conflito: true });
    expect((await call("GET", "/profile", A)).body.profile.areas).toEqual([]);

    const saved = await call("POST", "/profile/lattes-import", A, summary);
    expect(saved.body.mantidos).toContain("institution");
    expect(saved.body.profile.institution).toBe("UnDF");
    expect(saved.body.profile.areas).toEqual(["Saúde coletiva"]);

    const replaced = await call("POST", "/profile/lattes-import", A, { ...summary, substituir: ["institution"] });
    expect(replaced.body.profile.institution).toBe("Outra Instituição");
  });
});

describe("meus dados", () => {
  it("exporta só os dados da pessoa; exclusão exige confirmação e não afeta outro usuário", async () => {
    const { opportunity } = await store.upsertOpportunity(edital());
    await call("PUT", "/profile", A, { display_name: "A" });
    await call("PUT", "/profile", B, { display_name: "B" });
    await call("POST", "/participations", A, { opportunity_id: opportunity.id });
    await call("POST", "/participations", B, { opportunity_id: opportunity.id });

    const ex = await call("GET", "/me/export", A);
    expect(ex.status).toBe(200);
    expect(ex.body.dados.teacher_profiles).toHaveLength(1);
    expect(ex.body.dados.teacher_profiles[0].display_name).toBe("A");
    expect(ex.body.dados.participations).toHaveLength(1);
    expect(JSON.stringify(ex.body)).not.toContain("usuario-b");

    expect((await call("DELETE", "/me/data", A, {})).status).toBe(400);
    const del = await call("DELETE", "/me/data", A, { confirmacao: "EXCLUIR MEUS DADOS" });
    expect(del.status).toBe(200);
    expect(del.body.concluido).toBe(true);
    expect((await call("GET", "/participations", A)).body.participations).toHaveLength(0);
    expect((await call("GET", "/participations", B)).body.participations).toHaveLength(1);
    expect((await call("GET", "/profile", B)).body.profile.display_name).toBe("B");
  });
});

describe("ferramentas NIASci (recursos)", () => {
  it("cada pessoa vê, altera e apaga só os próprios projetos", async () => {
    (await import("../../../routes/resources")).resetResourceMemory();
    const c = await call("POST", "/resources/research_projects", A, { title: "Projeto da A" });
    expect(c.status).toBe(201);
    const id = c.body.id;
    expect((await call("GET", "/resources/research_projects", A)).body).toHaveLength(1);
    expect((await call("GET", "/resources/research_projects", B)).body).toHaveLength(0);
    expect((await call("GET", `/resources/research_projects/${id}`, B)).status).toBe(404);
    expect((await call("PUT", `/resources/research_projects/${id}`, B, { title: "invadido" })).status).toBe(404);
    await call("DELETE", `/resources/research_projects/${id}`, B);
    expect((await call("GET", `/resources/research_projects/${id}`, A)).body.title).toBe("Projeto da A");
    expect((await call("POST", "/resources/research_projects", A, { title: "x", user_id: "usuario-b" })).status).toBe(400);
  });
});

describe("compartilhamento", () => {
  it("sem login não cria link (para que possa ser revogado)", async () => {
    expect((await call("POST", "/edital/share", undefined, { agentId: "simples", title: "x", resultJson: {} })).status).toBe(401);
  });
  it("fluxo completo: cria, abre sem dono nem perfil, outro usuário não revoga, dono revoga e o link para de abrir", async () => {
    const c = await call("POST", "/edital/share", A, {
      agentId: "elegibilidade",
      title: "Edital fictício",
      resultJson: { base: { datas: [{ rotulo: "inscrições" }], elegibilidade_perfil: [{ estado: "atendido", criterio: "doutorado" }] } },
    });
    expect(c.status).toBe(201);
    expect(Date.parse(c.body.expiresAt)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const pub = await call("GET", `/edital/share/${c.body.token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.resultJson.base.elegibilidade_perfil).toBeUndefined();
    expect(JSON.stringify(pub.body)).not.toContain("usuaria-a");
    const mine = await call("GET", "/edital/shares", A);
    expect(mine.body.links).toHaveLength(1);
    expect(mine.body.links[0].estado).toBe("ativo");
    expect((await call("GET", "/edital/shares", B)).body.links).toHaveLength(0);
    expect((await call("DELETE", `/edital/share/${c.body.token}`, B)).status).toBe(404);
    expect((await call("GET", `/edital/share/${c.body.token}`)).status).toBe(200);
    expect((await call("DELETE", `/edital/share/${c.body.token}`, A)).status).toBe(204);
    expect((await call("GET", `/edital/share/${c.body.token}`)).status).toBe(404);
    expect((await call("GET", "/edital/shares", A)).body.links[0].estado).toBe("revogado");
  });
  it("remove a comparação com o perfil e o dono do conteúdo público", () => {
    const out = sanitizeSharedResult({ user_id: "u", base: { datas: [1], elegibilidade_perfil: [{ x: 1 }] }, agentResult: { base: { elegibilidade_perfil: [1] } } });
    expect(out).toEqual({ base: { datas: [1] }, agentResult: { base: {} } });
  });
  it("estado: revogado e expirado deixam de abrir", () => {
    expect(shareState({ revoked_at: "2026-01-01" })).toBe("revogado");
    expect(shareState({ expires_at: "2000-01-01T00:00:00Z" })).toBe("expirado");
    expect(shareState({ expires_at: "2999-01-01T00:00:00Z" })).toBe("ativo");
    expect(shareState({})).toBe("ativo");
  });
});
