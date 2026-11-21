/**
 * Limites de custo compartilhados (lib/limits/shared.ts).
 *  - Lógica do middleware com armazenamento em memória (duas "instâncias" = dois apps).
 *  - Atomicidade REAL no Postgres (migração 20261127) com dois pools de conexão, quando
 *    LUPA_TEST_PG_URL estiver definido (CI: serviço postgres; local: PG16 de teste).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import express from "express";
import { randomUUID } from "node:crypto";
import { costGuard, memoryBackend, setLimitBackendForTests, sqlBackend, type LimitBackend } from "../shared";

function appWith(user?: string) {
  const app = express();
  app.set("trust proxy", 1);
  app.use((req, _res, next) => {
    if (user) (req as unknown as { user: { id: string } }).user = { id: user };
    next();
  });
  app.post("/ia", costGuard("ai"), async (req, res) => {
    const wait = Number(req.query.wait ?? 0);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    res.json({ ok: true });
  });
  return app;
}
async function serve(app: express.Express) {
  const s = http.createServer(app);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, close: () => new Promise<void>((r) => s.close(() => r())) };
}
const post = (url: string, headers: Record<string, string> = {}) => fetch(`${url}/ia`, { method: "POST", headers });

const ENV = ["AI_ANON_PER_HOUR", "AI_USER_PER_HOUR", "AI_CONCURRENT_PER_KEY", "AI_GLOBAL_PER_DAY", "AI_TOKENS_GLOBAL_PER_DAY", "LIMITS_FAIL_OPEN"];
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
});
afterAll(() => setLimitBackendForTests(null));

describe("costGuard (lógica)", () => {
  it("duas instâncias compartilham a mesma cota (visitante)", async () => {
    process.env.AI_ANON_PER_HOUR = "3";
    setLimitBackendForTests(memoryBackend());
    const a = await serve(appWith());
    const b = await serve(appWith());
    const codes = [];
    for (const u of [a.url, b.url, a.url, b.url]) codes.push((await post(u)).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    await a.close();
    await b.close();
  });

  it("429 explica o limite e traz Retry-After; visitante recebe dica de login", async () => {
    process.env.AI_ANON_PER_HOUR = "1";
    setLimitBackendForTests(memoryBackend());
    const a = await serve(appWith());
    await post(a.url);
    const r = await post(a.url);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ code: "LIMIT", scope: "hora", loginHint: true });
    expect(body.error).toMatch(/Tente de novo em/);
    await a.close();
  });

  it("usuário logado tem cota própria (não divide com o IP)", async () => {
    process.env.AI_ANON_PER_HOUR = "1";
    process.env.AI_USER_PER_HOUR = "5";
    setLimitBackendForTests(memoryBackend());
    const anon = await serve(appWith());
    const user = await serve(appWith("usuario-ficticio-1"));
    expect((await post(anon.url)).status).toBe(200);
    expect((await post(anon.url)).status).toBe(429);
    expect((await post(user.url)).status).toBe(200);
    expect((await post(user.url)).status).toBe(200);
    await anon.close();
    await user.close();
  });

  it("limite de simultâneas: a terceira análise ao mesmo tempo é recusada e a vaga volta ao terminar", async () => {
    process.env.AI_CONCURRENT_PER_KEY = "2";
    process.env.AI_USER_PER_HOUR = "100";
    setLimitBackendForTests(memoryBackend());
    const a = await serve(appWith("usuario-ficticio-2"));
    const slow = [fetch(`${a.url}/ia?wait=300`, { method: "POST" }), fetch(`${a.url}/ia?wait=300`, { method: "POST" })];
    await new Promise((r) => setTimeout(r, 80));
    const third = await post(a.url);
    expect(third.status).toBe(429);
    expect(((await third.json()) as { scope: string }).scope).toBe("simultaneo");
    expect((await Promise.all(slow)).map((r) => r.status)).toEqual([200, 200]);
    expect((await post(a.url)).status).toBe(200);
    await a.close();
  });

  it("orçamento global de tokens atingido → 429 'orcamento'", async () => {
    process.env.AI_TOKENS_GLOBAL_PER_DAY = "100";
    const mem = memoryBackend();
    setLimitBackendForTests(mem);
    await mem.hit("ai:tokens:global:day", 86_400, Number.MAX_SAFE_INTEGER, 150);
    const a = await serve(appWith("usuario-ficticio-3"));
    const r = await post(a.url);
    expect(r.status).toBe(429);
    expect(((await r.json()) as { scope: string }).scope).toBe("orcamento");
    await a.close();
  });

  it("falha do armazenamento → 503 fechado (não roda a IA); LIMITS_FAIL_OPEN=true deixa passar", async () => {
    const broken: LimitBackend = {
      kind: "quebrado",
      hit: async () => Promise.reject(new Error("banco fora")),
      peek: async () => Promise.reject(new Error("banco fora")),
      acquire: async () => Promise.reject(new Error("banco fora")),
      release: async () => {},
    };
    setLimitBackendForTests(broken);
    const a = await serve(appWith());
    const r = await post(a.url);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { code: string }).code).toBe("LIMIT_STORE_UNAVAILABLE");
    process.env.LIMITS_FAIL_OPEN = "true";
    expect((await post(a.url)).status).toBe(200);
    await a.close();
  });

  it("expiração: janela nova zera a contagem", async () => {
    let now = Date.UTC(2026, 10, 21, 10, 0, 0);
    const mem = memoryBackend(() => now);
    expect((await mem.hit("k", 60, 1)).allowed).toBe(true);
    expect((await mem.hit("k", 60, 1)).allowed).toBe(false);
    now += 61_000;
    expect((await mem.hit("k", 60, 1)).allowed).toBe(true);
  });

  it("IP real: com trust proxy 1, um X-Forwarded-For forjado à esquerda não troca a identidade", async () => {
    process.env.AI_ANON_PER_HOUR = "1";
    setLimitBackendForTests(memoryBackend());
    const a = await serve(appWith());
    // O proxy (Vercel) acrescenta o IP real por último; o cliente só controla o que vem antes
    expect((await post(a.url, { "x-forwarded-for": "1.1.1.1, 203.0.113.9" })).status).toBe(200);
    expect((await post(a.url, { "x-forwarded-for": "8.8.8.8, 203.0.113.9" })).status).toBe(429);
    await a.close();
  });
});

// ── Postgres real (atomicidade entre "instâncias") ────────────────────────────
const PG = process.env.LUPA_TEST_PG_URL;
describe.skipIf(!PG)("rate_hit / limit_acquire no Postgres (duas instâncias, concorrência, reinício)", () => {
  let pools: Array<{ query: (q: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> }> = [];
  const backendFor = (i: number) =>
    sqlBackend("pg", async (fn, args) => {
      const keys = Object.keys(args);
      const r = await pools[i].query(`select * from public.${fn}(${keys.map((k, j) => `${k} => $${j + 1}`).join(", ")})`, keys.map((k) => args[k]));
      return r.rows;
    });
  beforeAll(async () => {
    const { default: pg } = await import("pg");
    pools = [new pg.Pool({ connectionString: PG, max: 10 }), new pg.Pool({ connectionString: PG, max: 10 })];
    // Papéis do Supabase (existem em produção; no Postgres de teste são criados se faltarem)
    await pools[0].query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;`);
    const sql = fs.readFileSync(new URL("../../../../../../supabase/migrations/20261127_limites_compartilhados.sql", import.meta.url), "utf8");
    await pools[0].query(sql);
  });
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it("100 requisições concorrentes por duas instâncias: exatamente o limite passa", async () => {
    const key = `teste:${randomUUID()}`;
    const [a, b] = [backendFor(0), backendFor(1)];
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => (i % 2 ? a : b).hit(key, 3600, 25)));
    expect(results.filter((r) => r.allowed).length).toBe(25);
    expect(Math.max(...results.map((r) => r.current))).toBe(100);
  });

  it("reinício: uma instância nova (novo pool) vê a contagem anterior", async () => {
    const key = `teste:${randomUUID()}`;
    await backendFor(0).hit(key, 3600, 2);
    await backendFor(0).hit(key, 3600, 2);
    const { default: pg } = await import("pg");
    const fresh = new pg.Pool({ connectionString: PG });
    const r = await fresh.query("select * from public.rate_hit($1, 3600, 2)", [key]);
    await fresh.end();
    expect(r.rows[0].allowed).toBe(false);
  });

  it("expiração da janela (1 s)", async () => {
    const key = `teste:${randomUUID()}`;
    const b = backendFor(0);
    // espera o começo de uma janela de 1 s para não cruzar a borda no meio do teste
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 20));
    expect((await b.hit(key, 1, 1)).allowed).toBe(true);
    expect((await b.hit(key, 1, 1)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await b.hit(key, 1, 1)).allowed).toBe(true);
  });

  it("simultâneas: 30 tentativas concorrentes em duas instâncias, no máximo 3 vagas; vaga expira sozinha", async () => {
    const key = `teste:${randomUUID()}`;
    const [a, b] = [backendFor(0), backendFor(1)];
    const got = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).acquire(key, 3, 1, randomUUID())));
    expect(got.filter(Boolean).length).toBe(3);
    await new Promise((r) => setTimeout(r, 1200));
    expect(await a.acquire(key, 3, 1, randomUUID())).toBe(true);
  });

  it("anon e authenticated não podem chamar as funções (só o servidor)", async () => {
    const c = await (pools[0] as unknown as { connect: () => Promise<{ query: (q: string) => Promise<unknown>; release: () => void }> }).connect();
    try {
      await c.query("SET ROLE anon");
      await expect(c.query("select * from public.rate_hit('x', 60, 1)")).rejects.toThrow(/permission denied/);
      await c.query("RESET ROLE");
      await c.query("SET ROLE authenticated");
      await expect(c.query("select * from public.limit_acquire('x', 1, 1, gen_random_uuid())")).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("RESET ROLE").catch(() => {});
      c.release();
    }
  });
});
