/**
 * /api/edital/analyze devolve a MESMA base documental para qualquer agente — inclusive
 * quando a IA falha (modo heurístico, identificado como tal) — e aplica limites de entrada.
 */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEXT = readFileSync(new URL("../../lib/__tests__/fixture-edital-ficticio.txt", import.meta.url), "utf8");
let server: Server;
let base = "";

beforeAll(async () => {
  process.env.LUPA_STORE = "memory";
  process.env.GROQ_API_KEY = "gsk_" + "x".repeat(40); // falso: o provedor é simulado abaixo
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";
  process.env.RATE_LIMIT_AI_ANON_PER_HOUR = "10000";
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  // Provedor de IA indisponível: força o caminho de contingência
  vi.spyOn(openai.chat.completions as any, "create").mockRejectedValue(Object.assign(new Error("503 Service Unavailable"), { status: 503 }));
  const { default: app } = await import("../../app");
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const analyze = (body: unknown) =>
  fetch(`${base}/edital/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("/edital/analyze — base documental comum", () => {
  it("IA indisponível: resultado identificado como contingência e com a base do documento", async () => {
    const res = await analyze({ agentId: "acompanhamento", text: TEXT });
    expect(res.status).toBe(200);
    const r = (await res.json()) as any;
    expect(r.processing.mode).toBe("fallback");
    expect(r.base.datas.map((d: any) => d.iso)).toEqual(["2027-01-05", "2027-02-28", "2027-04-15", "2027-04-30"]);
    expect(Array.isArray(r.verificacao)).toBe(true);
  }, 60_000);

  it("a base é idêntica entre agentes diferentes para o mesmo documento", async () => {
    const [a, b] = await Promise.all([
      analyze({ agentId: "simples", text: TEXT }).then((r) => r.json() as Promise<any>),
      analyze({ agentId: "documentacao", text: TEXT }).then((r) => r.json() as Promise<any>),
    ]);
    expect(a.base).toEqual(b.base);
    expect(a.base.documento_hash).toMatch(/^[a-f0-9]{64}$/);
  }, 60_000);

  it("texto acima do limite → 413 com orientação; texto ilegível → 422", async () => {
    const big = await analyze({ agentId: "simples", text: "a".repeat(460_000) });
    expect(big.status).toBe(413);
    expect(((await big.json()) as any).error).toMatch(/limite/);
    const junk = await analyze({ agentId: "simples", text: "\u0000\u0001\u0002 ... ,,, ;;; \u0003\u0004" });
    expect([400, 422]).toContain(junk.status);
  }, 60_000);
});
