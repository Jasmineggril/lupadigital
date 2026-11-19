/**
 * Integração da API do fluxo docente com JWT REAL (ES256) verificado via JWKS local.
 * Banco: MemoryStore (modo temporário de desenvolvimento). Coleta: fixtures fictícias.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { MemoryStore, setStoreForTests } from "../store";
import { fixtureFetcher } from "./fixtures";

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
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";

  const { default: app } = await import("../../../app");
  ({ setFetcherFactoryForTests: setFetcher } = await import("../../../routes/lupa"));
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
