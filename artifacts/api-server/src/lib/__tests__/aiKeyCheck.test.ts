/**
 * Regressões do incidente "401 Invalid API Key" em produção:
 *  - /readyz/deep dizia "ai: ok" com uma chave revogada;
 *  - o alerta da análise heurística mostrava a mensagem crua do provedor;
 *  - análise heurística (sem IA) não pode ir para o cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAiKey, resetAiKeyCheckCache } from "../aiKeyCheck";
import { cacheGet, cacheSet, isCompleteResult } from "../aiCache";

const env = { ...process.env };
beforeEach(() => {
  resetAiKeyCheckCache();
  delete process.env.OPENAI_API_KEY;
  process.env.GROQ_API_KEY = "gsk_" + "x".repeat(40);
});
afterEach(() => {
  process.env = { ...env };
  vi.restoreAllMocks();
});

describe("checkAiKey", () => {
  it("chave recusada (401) → não ok, com orientação", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 401 }));
    const r = await checkAiKey(f as any);
    expect(r).toMatchObject({ ok: false, provider: "groq" });
    expect(r.detail).toMatch(/GROQ_API_KEY/);
    expect((f.mock.calls[0] as any)[0]).toBe("https://api.groq.com/openai/v1/models");
  });

  it("chave válida → ok; resultado fica em cache por 5 minutos", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    expect((await checkAiKey(f as any, 1_000)).ok).toBe(true);
    await checkAiKey(f as any, 2_000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("sem chave configurada → não ok, sem chamar a rede", async () => {
    delete process.env.GROQ_API_KEY;
    const f = vi.fn();
    expect(await checkAiKey(f as any)).toMatchObject({ ok: false, provider: "none" });
    expect(f).not.toHaveBeenCalled();
  });

  it("falha de rede → não ok", async () => {
    const f = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect((await checkAiKey(f as any)).ok).toBe(false);
  });
});

describe("análise heurística (fallback)", () => {
  it("não entra no cache", () => {
    const parts = { scope: "analyze:simples", model: "m", promptVersion: "v" };
    expect(isCompleteResult({ processing: { mode: "fallback", complete: true } })).toBe(false);
    expect(cacheSet(parts, "texto", { processing: { mode: "fallback", complete: true } })).toBe(false);
    expect(cacheGet(parts, "texto")).toBeNull();
  });

  it("com chave inválida, o alerta não expõe a mensagem do provedor", async () => {
    const { analyzeAgent } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockRejectedValue(Object.assign(new Error("401 Invalid API Key"), { status: 401 }));
    const r = (await analyzeAgent("simples", "EDITAL Nº 01/2026. Objeto: bolsas de iniciação científica. Inscrições até 20/12/2026.")) as any;
    expect(r.processing.mode).toBe("fallback");
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/Invalid API Key/);
    expect(text).not.toMatch(/401/);
  }, 30_000);
});
