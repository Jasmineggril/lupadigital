/**
 * Integração da API do fluxo docente com JWT REAL (ES256) verificado via JWKS local.
 * Banco: MemoryStore (modo temporário de desenvolvimento). Coleta: fixtures fictícias.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { MemoryStore, setStoreForTests } from "../store";
import { FIXTURE_PAGES, fixtureFetcher } from "./fixtures";
import { fixtureDocumentFetcher } from "./pdfFixtures";

let key: KeyLike;
let otherKey: KeyLike;
let jwksServer: http.Server;
let apiServer: http.Server;
let api = "";
let store: MemoryStore;
let setFetcher: (f: any) => void;

async function token(sub: string, opts: { appRole?: string; userRole?: string; exp?: number; signWith?: KeyLike } = {}) {
  const jwt = new SignJWT({
    sub,
    email: `${sub}@undf.edu.br`,
    role: "authenticated",
    app_metadata: opts.appRole ? { role: opts.appRole } : {},
    user_metadata: opts.userRole ? { role: opts.userRole } : {},
  })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 600);
  return jwt.sign(opts.signWith ?? key);
}

async function call(method: string, path: string, tok?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(api + path, {
    method,
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers },
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

beforeAll(async () => {
  ({ privateKey: key } = await generateKeyPair("ES256"));
  ({ privateKey: otherKey } = await generateKeyPair("ES256"));
  const { publicKey } = await (async () => {
    // reconstrói a pública da chave de assinatura
    const jwk = await exportJWK(key);
    delete jwk.d;
    return { publicKey: { ...jwk, kid: "test-key", alg: "ES256", use: "sig" } };
  })();
  jwksServer = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [publicKey] }));
  });
  await new Promise<void>((r) => jwksServer.listen(0, "127.0.0.1", () => r()));
  process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks.json`;
  process.env.LUPA_ADMIN_USER_IDS = "admin-por-env";
  process.env.HERMES_TRIGGER_SECRET = "h".repeat(40);
  process.env.CRON_SECRET = "c".repeat(40);
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";

  const { default: app } = await import("../../../app");
  const lupaRoutes = await import("../../../routes/lupa");
  setFetcher = lupaRoutes.setFetcherFactoryForTests;
  // Sem rede: documentos oficiais respondem 404 (a leitura de PDF tem testes próprios)
  lupaRoutes.setDocumentFetcherFactoryForTests(() => fixtureDocumentFetcher({}).fetcher);
  apiServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => apiServer.once("listening", () => r()));
  api = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  setStoreForTests(null);
  await new Promise<void>((r) => apiServer.close(() => r()));
  await new Promise<void>((r) => jwksServer.close(() => r()));
});

beforeEach(async () => {
  store = new MemoryStore();
  // Sem espera entre requisições nos testes (em produção o mínimo é 500 ms)
  await store.updateSource("fapdf", { request_delay_ms: 0 });
  setStoreForTests(store);
  setFetcher(() => fixtureFetcher().fetcher);
});

describe("sessão e autenticação", () => {
  it("sem token, token forjado ou expirado → 401", async () => {
    expect((await call("GET", "/profile")).status).toBe(401);
    expect((await call("GET", "/profile", await token("u1", { signWith: otherKey }))).status).toBe(401);
    expect((await call("GET", "/profile", await token("u1", { exp: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await call("GET", "/profile", await token("u1"))).status).toBe(200);
  });

  it("/me informa papel calculado pelo servidor", async () => {
    expect((await call("GET", "/me", await token("u1"))).body.is_admin).toBe(false);
    expect((await call("GET", "/me", await token("u1", { appRole: "admin" }))).body.is_admin).toBe(true);
    expect((await call("GET", "/me", await token("admin-por-env"))).body.is_admin).toBe(true);
    // user_metadata é editável pelo próprio usuário → não concede papel
    expect((await call("GET", "/me", await token("u1", { userRole: "admin" }))).body.is_admin).toBe(false);
  });
});

describe("perfil: isolamento e campos permitidos", () => {
  it("cada usuário só lê e altera o próprio perfil", async () => {
    const a = await token("prof-a");
    const b = await token("prof-b");
    const put = await call("PUT", "/profile", a, { display_name: "Profa. A", areas: ["Inteligência Artificial"], declared_degree: "doutorado" });
    expect(put.status).toBe(200);
    expect(put.body.profile.version).toBe(1);
    expect(put.body.profile.field_sources.areas.source).toBe("autodeclarado");
    const fromB = await call("GET", "/profile", b);
    expect(fromB.body.profile.user_id).toBe("prof-b");
    expect(fromB.body.profile.areas).toEqual([]);
    expect(store.profiles.get("prof-a")?.display_name).toBe("Profa. A");
  });

  it("recusa user_id, papel e campos desconhecidos no perfil", async () => {
    const a = await token("prof-a");
    for (const body of [{ user_id: "prof-b" }, { role: "admin" }, { is_admin: true }, { version: 99 }, { field_sources: {} }]) {
      const r = await call("PUT", "/profile", a, body);
      expect(r.status).toBe(400);
    }
    expect(store.profiles.has("prof-b")).toBe(false);
    expect((await call("GET", "/me", a)).body.is_admin).toBe(false);
  });

  it("valida o identificador Lattes", async () => {
    const a = await token("prof-a");
    expect((await call("PUT", "/profile", a, { lattes_id: "123" })).status).toBe(400);
    expect((await call("PUT", "/profile", a, { lattes_url: "https://site-qualquer.com/x" })).status).toBe(400);
    expect((await call("PUT", "/profile", a, { lattes_id: "1234567890123456" })).status).toBe(200);
  });

  it("importação JSON provisória marca a origem e a data", async () => {
    const a = await token("prof-a");
    const r = await call("POST", "/profile/lattes-import", a, {
      lattes_id: "1234567890123456",
      nome: "Profa. A",
      titulacao: "doutorado",
      areas: ["Ciência da Computação"],
      temas: ["aprendizado de máquina"],
      atualizado_em: "2026-10-01",
    });
    expect(r.status).toBe(200);
    expect(r.body.provisional).toBe(true);
    expect(r.body.profile.field_sources.research_topics.source).toBe("importacao_json_provisoria");
    expect((await call("POST", "/profile/lattes-import", a, { nome: "x" })).status).toBe(400);
  });
});

describe("administração", () => {
  it("usuário comum não executa operações administrativas", async () => {
    const u = await token("prof-a");
    expect((await call("GET", "/admin/status", u)).status).toBe(403);
    expect((await call("POST", "/admin/sources/fapdf/collect", u)).status).toBe(403);
    expect((await call("PATCH", "/admin/sources/fapdf", u, { max_pages: 5 })).status).toBe(403);
    expect((await call("POST", "/admin/profiles/import", u, [])).status).toBe(403);
    expect((await call("POST", "/admin/sources/fapdf/collect")).status).toBe(401);
    expect(store.runs.length).toBe(0);
  });

  it("admin coleta, revisa e consulta execuções; coleta concorrente → 409", async () => {
    const admin = await token("adm", { appRole: "admin" });
    const run = await call("POST", "/admin/sources/fapdf/collect", admin);
    expect(run.status).toBe(200);
    expect(run.body.run.status).toBe("succeeded");
    expect(run.body.run.trigger).toBe("manual");
    const list = await call("GET", "/opportunities");
    expect(list.body.opportunities.map((o: any) => o.edital_number).sort()).toEqual(["01/2026", "02/2026", "03/2026"]);
    const target = list.body.opportunities[0].id;
    expect((await call("PATCH", `/admin/opportunities/${target}`, admin, { review_status: "rejeitado" })).status).toBe(200);
    expect((await call("GET", "/opportunities")).body.opportunities.length).toBe(2);
    expect((await call("GET", `/opportunities/${target}`)).status).toBe(404);
    expect((await call("GET", "/admin/runs", admin)).body.runs.length).toBe(1);

    await store.startRun("fapdf", "manual", "outro-admin");
    expect((await call("POST", "/admin/sources/fapdf/collect", admin)).status).toBe(409);
  });

  it("URLs iniciais fora do domínio oficial são recusadas", async () => {
    const admin = await token("adm", { appRole: "admin" });
    expect((await call("PATCH", "/admin/sources/fapdf", admin, { start_urls: ["https://evil.example/"] })).status).toBe(400);
    expect((await call("PATCH", "/admin/sources/fapdf", admin, { frequency_minutes: 720 })).body.source.frequency_minutes).toBe(720);
  });

  it("importação institucional só pela administração", async () => {
    const admin = await token("adm", { appRole: "admin" });
    const r = await call("POST", "/admin/profiles/import", admin, [
      { user_id: "doc-1", lattes_id: "1111222233334444", nome: "Prof. 1", atualizado_em: "2026-09-01", areas: ["Física"] },
    ]);
    expect(r.status).toBe(200);
    expect(store.profiles.get("doc-1")?.field_sources.areas.source).toBe("importacao_institucional");
  });
});

describe("recomendações explicadas", () => {
  async function seed() {
    const admin = await token("adm", { appRole: "admin" });
    await call("POST", "/admin/sources/fapdf/collect", admin);
  }

  it("alta aderência não esconde requisito eliminatório não atendido", async () => {
    await seed();
    const u = await token("prof-a");
    await call("PUT", "/profile", u, {
      areas: ["Inteligência Artificial", "Educação"],
      research_topics: ["aprendizado de máquina"],
      keywords: ["saúde pública"],
      declared_degree: "mestrado",
      declared_bond: "efetivo",
      institution: "UnDF",
    });
    const r = await call("GET", "/recommendations", u);
    const e1 = r.body.recommendations.find((x: any) => x.opportunity.edital_number === "01/2026");
    expect(e1.result.thematic.level).toBe("alta");
    expect(e1.result.eligibility.overall).toBe("impedimento");
    const doctor = e1.result.eligibility.checks.find((c: any) => /doutor/.test(c.requirement));
    expect(doctor.state).toBe("nao_atendida");
    expect(e1.result.warnings.join(" ")).toMatch(/eliminatório/);
    // impedimento vai para o fim da lista mesmo com nota alta
    expect(r.body.recommendations.at(-1).opportunity.edital_number).toBe("01/2026");
  });

  it("dados autodeclarados contam como atendidos mas pedem comprovação", async () => {
    await seed();
    const u = await token("prof-b");
    await call("PUT", "/profile", u, { areas: ["Inteligência Artificial"], declared_degree: "doutorado", declared_bond: "efetivo", institution: "UnDF", lattes_id: "1234567890123456" });
    const e1 = (await call("GET", "/recommendations", u)).body.recommendations.find((x: any) => x.opportunity.edital_number === "01/2026");
    const doctor = e1.result.eligibility.checks.find((c: any) => /doutor/.test(c.requirement));
    expect(doctor.state).toBe("atendida");
    expect(doctor.reason).toMatch(/comprovado/);
    expect(doctor.profile_basis).toMatch(/autodeclarado/);
    expect(doctor.source_url).toMatch(/edital-01-2026/);
  });

  it("informação insuficiente vira pendência explícita", async () => {
    await seed();
    const u = await token("prof-c");
    const r = await call("GET", "/recommendations", u);
    const e2 = r.body.recommendations.find((x: any) => x.opportunity.edital_number === "02/2026");
    expect(e2.result.thematic.level).toBe("indeterminada");
    expect(e2.result.eligibility.overall).toBe("pendente");
    expect(e2.result.missing.join(" ")).toMatch(/elegibilidade/);
    expect(e2.result.missing.join(" ")).toMatch(/Perfil: informe áreas/);
  });

  it("registra versões e recalcula quando o perfil muda; guarda feedback e salvos", async () => {
    await seed();
    const u = await token("prof-d");
    await call("PUT", "/profile", u, { areas: ["Física"] });
    const first = (await call("GET", "/recommendations", u)).body.recommendations[0];
    expect(first.profile_version).toBe(1);
    expect(first.opportunity_version).toBe(1);
    const again = (await call("GET", "/recommendations", u)).body.recommendations[0];
    expect(again.recomputed).toBe(false);
    await call("PUT", "/profile", u, { areas: ["Física", "Inteligência Artificial"] });
    const after = (await call("GET", "/recommendations", u)).body.recommendations;
    expect(after.every((x: any) => x.profile_version === 2 && x.recomputed)).toBe(true);

    const id = after[0].opportunity_id;
    expect((await call("POST", `/recommendations/${id}/feedback`, u, { relevant: false, comment: "fora da minha área" })).status).toBe(204);
    expect((await call("PUT", `/saved-opportunities/${id}`, u)).status).toBe(204);
    const later = (await call("GET", "/recommendations", u)).body.recommendations.find((x: any) => x.opportunity_id === id);
    expect(later.feedback).toEqual({ relevant: false });
    expect(later.saved).toBe(true);
    // Outro usuário não vê os salvos de prof-d
    expect((await call("GET", "/saved-opportunities", await token("prof-e"))).body.opportunities).toEqual([]);
  });
});

describe("catálogo: busca, filtros, ordenação e paginação", () => {
  it("filtra por texto, situação e prazo; pagina; sem resultado → lista vazia", async () => {
    await call("POST", "/admin/sources/fapdf/collect", await token("adm", { appRole: "admin" }));
    const all = (await call("GET", "/opportunities")).body;
    expect(all.total).toBe(3);
    expect(all.facets.sources).toEqual(["fapdf"]);
    expect(all.facets.areas).toContain("aprendizado de máquina");
    expect((await call("GET", "/opportunities?q=inteligencia")).body.opportunities.map((o: any) => o.edital_number)).toEqual(["01/2026"]);
    expect((await call("GET", "/opportunities?status=encerrada")).body.opportunities.map((o: any) => o.edital_number)).toEqual(["03/2026"]);
    expect((await call("GET", "/opportunities?area=aprendizado")).body.total).toBe(1);
    // Prazo confirmado até 30 dias: nenhum (o 01/2026 vence em 2099)
    expect((await call("GET", "/opportunities?prazo_dias=30")).body.total).toBe(0);
    const page = (await call("GET", "/opportunities?page_size=2&page=2&sort=titulo")).body;
    expect(page.opportunities).toHaveLength(1);
    expect(page.total).toBe(3);
    expect((await call("GET", "/opportunities?q=nada-parecido")).body).toMatchObject({ total: 0, opportunities: [] });
    expect((await call("GET", "/opportunities?status=inventada")).status).toBe(400);
    const one = (await call("GET", "/opportunities?q=inteligencia")).body.opportunities[0];
    expect(one.deadline).toBe("2099-06-30");
    expect(one.types).toContain("auxilio_pesquisa");
  });
});

describe("interesse e avisos internos", () => {
  it("demonstrar interesse salva e marca; avisos não duplicam e respeitam isolamento", async () => {
    const admin = await token("adm", { appRole: "admin" });
    await call("POST", "/admin/sources/fapdf/collect", admin);
    const u = await token("prof-n");
    await call("PUT", "/profile", u, {
      areas: ["Inteligência Artificial", "Educação"],
      research_topics: ["aprendizado de máquina"],
      declared_degree: "doutorado",
      declared_bond: "efetivo",
      institution: "UnDF",
      opportunity_types: ["auxilio_pesquisa"],
    });
    const n1 = (await call("GET", "/notifications", u)).body;
    expect(n1.notifications.filter((n: any) => n.kind === "recomendacao")).toHaveLength(1);
    expect(n1.unread).toBe(1);
    // Repetir não duplica
    expect((await call("GET", "/notifications", u)).body.notifications).toHaveLength(1);
    // Outro usuário não vê
    expect((await call("GET", "/notifications", await token("prof-x"))).body.notifications).toEqual([]);

    const id = n1.notifications[0].opportunity_id;
    const rec = (await call("GET", "/recommendations", u)).body.recommendations.find((r: any) => r.opportunity_id === id);
    expect(rec.result.interest.opportunity_type).toBe("corresponde");

    expect((await call("PUT", `/saved-opportunities/${id}/interest`, u, { interested: true })).body).toEqual({ saved: true, interested: true });
    const saved = (await call("GET", "/saved-opportunities", u)).body.opportunities;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id, interested: true, changed_since_saved: false });

    // Página oficial muda → nova versão → aviso de mudança no salvo (uma vez)
    const pageUrl = store.opportunities.get(id)!.canonical_url;
    const pages = { ...FIXTURE_PAGES, [pageUrl]: FIXTURE_PAGES[pageUrl].replace("até R$ 150.000,00", "até R$ 180.000,00") };
    setFetcher(() => fixtureFetcher(pages).fetcher);
    await call("POST", "/admin/sources/fapdf/collect", admin);
    const n2 = (await call("GET", "/notifications", u)).body.notifications;
    expect(n2.filter((n: any) => n.kind === "mudanca_salvo")).toHaveLength(1);
    expect((await call("GET", "/saved-opportunities", u)).body.opportunities[0].changed_since_saved).toBe(true);
    expect((await call("GET", "/notifications", u)).body.notifications.filter((n: any) => n.kind === "mudanca_salvo")).toHaveLength(1);

    // Marcar como lida
    expect((await call("POST", "/notifications/read", u, { all: true })).body.marked).toBeGreaterThan(0);
    expect((await call("GET", "/notifications", u)).body.unread).toBe(0);
    expect((await call("POST", "/notifications/read", u, { ids: ["x"] })).status).toBe(400);
  });

  it("preferência 'nunca' desliga avisos de recomendação", async () => {
    await call("POST", "/admin/sources/fapdf/collect", await token("adm", { appRole: "admin" }));
    const u = await token("prof-q");
    await call("PUT", "/profile", u, { areas: ["Inteligência Artificial"], notification_prefs: { email: false, frequency: "nunca" } });
    expect((await call("GET", "/notifications", u)).body.notifications).toEqual([]);
  });
});

describe("importação institucional: relatório por registro", () => {
  it("separa importados, atualizados, ignorados e rejeitados", async () => {
    const admin = await token("adm", { appRole: "admin" });
    const base = { nome: "Prof.", atualizado_em: "2026-09-01", areas: ["Física"] };
    const r1 = await call("POST", "/admin/profiles/import", admin, [
      { ...base, user_id: "d1", lattes_id: "1111222233334444" },
      { ...base, user_id: "d2", lattes_id: "5555666677778888" },
      { ...base, user_id: "d1", lattes_id: "1111222233334444" }, // repetido
      { ...base, user_id: "d3", lattes_id: "123" }, // inválido
      { ...base, user_id: "d4", lattes_id: "9999000011112222", papel: "admin" }, // campo indevido
    ]);
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ importados: 2, atualizados: 0, ignorados: 1, rejeitados: 2 });
    expect(r1.body.registros[3]).toMatchObject({ indice: 3, situacao: "rejeitado" });
    expect(r1.body.registros[3].detalhe).toMatch(/lattes_id/);

    const r2 = await call("POST", "/admin/profiles/import", admin, [
      { ...base, user_id: "d1", lattes_id: "1111222233334444" }, // sem mudança
      { ...base, user_id: "d2", lattes_id: "5555666677778888", areas: ["Física", "Química"] }, // muda
      { ...base, user_id: "d9", lattes_id: "1111222233334444" }, // lattes de outra conta
    ]);
    expect(r2.body).toMatchObject({ importados: 0, atualizados: 1, ignorados: 1, rejeitados: 1 });
    expect(r2.body.registros[2].detalhe).toMatch(/outra conta/);
    expect(store.profiles.has("d9")).toBe(false);
    expect((await call("POST", "/admin/profiles/import", admin, { nao: "lista" })).status).toBe(400);
    // Validação sem gravar: mesmo relatório, nada muda no banco
    const dry = await call("POST", "/admin/profiles/import?validar=1", admin, [{ ...base, user_id: "d7", lattes_id: "7777888899990000" }]);
    expect(dry.body).toMatchObject({ importados: 1, simulacao: true });
    expect(store.profiles.has("d7")).toBe(false);
  });
});

describe("inspeção de comparações (administração)", () => {
  it("admin compara docente × edital sem gravar; usuário comum recebe 403", async () => {
    const admin = await token("adm", { appRole: "admin" });
    await call("POST", "/admin/sources/fapdf/collect", admin);
    const u = await token("prof-z");
    await call("PUT", "/profile", u, { areas: ["Inteligência Artificial"], declared_degree: "mestrado" });
    const list = (await call("GET", "/admin/profiles", admin)).body.profiles;
    expect(list.find((p: any) => p.user_id === "prof-z").terms).toBe(1);
    const r = await call("POST", "/admin/compare", admin, { user_id: "prof-z" });
    expect(r.status).toBe(200);
    const e1 = r.body.results.find((x: any) => /Inteligência/.test(x.title));
    expect(e1.result.eligibility.overall).toBe("impedimento");
    expect(store.recs.size).toBe(0); // não grava
    expect((await call("POST", "/admin/compare", u, { user_id: "prof-z" })).status).toBe(403);
    expect((await call("GET", "/admin/profiles", u)).status).toBe(403);
    expect((await call("POST", "/admin/compare", admin, { user_id: "ninguem" })).status).toBe(404);
  });
});

describe("Hermes (contrato)", () => {
  it("exige segredo; dispara coleta com trigger hermes", async () => {
    expect((await call("POST", "/integrations/hermes/collect", undefined, { source_id: "fapdf" })).status).toBe(401);
    expect((await call("POST", "/integrations/hermes/collect", "x".repeat(40), { source_id: "fapdf" })).status).toBe(401);
    const ok = await call("POST", "/integrations/hermes/collect", "h".repeat(40), { source_id: "fapdf", request_id: "job-1" });
    expect(ok.status).toBe(202);
    expect(ok.body.run.trigger).toBe("hermes");
    expect(ok.body.run.triggered_by).toBe("hermes:job-1");
  });
});

describe("Coleta automática diária (Vercel Cron)", () => {
  it("sem segredo configurado não coleta (503); segredo errado 401", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await call("GET", "/cron/collect", "c".repeat(40))).status).toBe(503);
    process.env.CRON_SECRET = "curto";
    expect((await call("GET", "/cron/collect", "curto")).status).toBe(503);
    process.env.CRON_SECRET = saved;
    expect((await call("GET", "/cron/collect")).status).toBe(401);
    expect((await call("GET", "/cron/collect", "x".repeat(40))).status).toBe(401);
    expect((await call("GET", "/cron/collect", "h".repeat(40))).status).toBe(401); // segredo do Hermes não serve
  });
  it("coleta com origem 'agendada' e não repete antes da frequência", async () => {
    // Usa a loja do beforeEach (fonte com intervalo zerado entre requisições)
    const first = await call("GET", "/cron/collect", "c".repeat(40));
    expect(first.status).toBe(200);
    const r = first.body.resultados.find((x: any) => x.source_id === "fapdf");
    expect(r.action).toBe("coletar");
    expect(r.status).toBe("succeeded");
    const runs = await store.listRuns(10);
    expect(runs[0].trigger).toBe("agendada");
    expect(runs[0].triggered_by).toBe("vercel-cron");
    expect((await store.listOpportunities({})).length).toBeGreaterThan(0);
    // Segunda chamada no mesmo dia: pula
    const again = await call("GET", "/cron/collect", "c".repeat(40));
    expect(again.body.resultados.find((x: any) => x.source_id === "fapdf").action).toBe("pular");
    expect((await store.listRuns(10)).length).toBe(1);
  });
});
