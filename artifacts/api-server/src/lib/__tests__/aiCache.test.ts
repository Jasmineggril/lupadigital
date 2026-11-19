/**
 * Testes de regressão do cache de IA (lib/aiCache.ts).
 *
 * Bug corrigido: a chave usava só os primeiros 2.000 caracteres do texto, então
 * dois editais com o mesmo cabeçalho/preâmbulo recebiam a mesma análise. Além
 * disso, resultados parciais (processing.complete === false) eram armazenados.
 *
 * O cache permanece ATIVO nestes testes; o isolamento entre testes é feito pelo
 * setup global (src/test/setup.ts), que chama cacheClear() antes/depois de cada um.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCacheKey,
  cacheGet,
  cacheSet,
  cacheStats,
  isCompleteResult,
  type CacheKeyParts,
} from "../aiCache";

const BASE_PARTS: CacheKeyParts = {
  scope: "analyze:simples",
  model: "openai/gpt-oss-120b",
  promptVersion: "analyze-v1",
  options: { profile: null },
};

/** Gera um preâmbulo idêntico com exatamente `len` caracteres. */
function sharedPrefix(len = 2000): string {
  const unit =
    "EDITAL Nº 01/2026 — A Fundação de Amparo à Pesquisa torna público o presente edital de chamada pública. ";
  return unit.repeat(Math.ceil(len / unit.length)).slice(0, len);
}

const PREFIX = sharedPrefix(2000);
const DOC_A = `${PREFIX}\n\nPrazo de inscrição: até 10/03/2026. Valor da bolsa: R$ 2.100,00. Público: mestrandos.`;
const DOC_B = `${PREFIX}\n\nPrazo de inscrição: até 25/09/2026. Valor da bolsa: R$ 4.800,00. Público: doutorandos.`;

describe("aiCache — chave", () => {
  it("documentos com os mesmos 2.000 primeiros caracteres e final diferente geram chaves diferentes", () => {
    expect(DOC_A.slice(0, 2000)).toBe(DOC_B.slice(0, 2000));
    expect(buildCacheKey(BASE_PARTS, DOC_A)).not.toBe(buildCacheKey(BASE_PARTS, DOC_B));
  });

  it("diferença apenas no último caractere de um documento longo muda a chave", () => {
    const long = sharedPrefix(60_000);
    expect(buildCacheKey(BASE_PARTS, `${long}A`)).not.toBe(buildCacheKey(BASE_PARTS, `${long}B`));
  });

  it("mesmo texto e mesmos parâmetros geram a mesma chave", () => {
    expect(buildCacheKey(BASE_PARTS, DOC_A)).toBe(buildCacheKey({ ...BASE_PARTS }, DOC_A));
  });

  it.each([
    ["scope (agente)", { scope: "analyze:analista" }],
    ["model", { model: "gemini-2.5-flash" }],
    ["promptVersion", { promptVersion: "analyze-v2" }],
    ["options", { options: { profile: { escolaridade: "medio" } } }],
  ])("mudar %s muda a chave", (_label, override) => {
    const changed = { ...BASE_PARTS, ...override } as CacheKeyParts;
    expect(buildCacheKey(changed, DOC_A)).not.toBe(buildCacheKey(BASE_PARTS, DOC_A));
  });

  it("ordem das chaves em options não altera a chave", () => {
    const a = { ...BASE_PARTS, options: { profile: { escolaridade: "superior", municipio: "Recife" }, chunking: { x: 1, y: 2 } } };
    const b = { ...BASE_PARTS, options: { chunking: { y: 2, x: 1 }, profile: { municipio: "Recife", escolaridade: "superior" } } };
    expect(buildCacheKey(a, DOC_A)).toBe(buildCacheKey(b, DOC_A));
  });

  it("não há colisão entre o separador de parâmetros e o texto", () => {
    const p1 = { ...BASE_PARTS, scope: "a" };
    const p2 = { ...BASE_PARTS, scope: "a\"" };
    expect(buildCacheKey(p1, `"${DOC_A}`)).not.toBe(buildCacheKey(p2, DOC_A));
  });
});

describe("aiCache — armazenamento", () => {
  it("cacheGet devolve o resultado do documento correto quando os prefixos coincidem", () => {
    cacheSet(BASE_PARTS, DOC_A, { resumo: "A" });
    expect(cacheGet(BASE_PARTS, DOC_B)).toBeNull();
    cacheSet(BASE_PARTS, DOC_B, { resumo: "B" });
    expect(cacheGet<{ resumo: string }>(BASE_PARTS, DOC_A)?.resumo).toBe("A");
    expect(cacheGet<{ resumo: string }>(BASE_PARTS, DOC_B)?.resumo).toBe("B");
  });

  it("não armazena resultado com processing.complete === false", () => {
    const stored = cacheSet(BASE_PARTS, DOC_A, { processing: { complete: false, failedChunks: 1 } });
    expect(stored).toBe(false);
    expect(cacheGet(BASE_PARTS, DOC_A)).toBeNull();
    expect(cacheStats().size).toBe(0);
  });

  it("não armazena resultado com complete === false no topo", () => {
    expect(cacheSet(BASE_PARTS, DOC_A, { complete: false })).toBe(false);
    expect(cacheGet(BASE_PARTS, DOC_A)).toBeNull();
  });

  it("não armazena null/undefined", () => {
    expect(cacheSet(BASE_PARTS, DOC_A, null)).toBe(false);
    expect(cacheSet(BASE_PARTS, DOC_A, undefined)).toBe(false);
  });

  it("armazena resultado completo", () => {
    expect(cacheSet(BASE_PARTS, DOC_A, { processing: { complete: true } })).toBe(true);
    expect(cacheGet(BASE_PARTS, DOC_A)).toEqual({ processing: { complete: true } });
  });

  it("isCompleteResult reconhece os formatos esperados", () => {
    expect(isCompleteResult({ resumo: "x" })).toBe(true);
    expect(isCompleteResult({ processing: { complete: true } })).toBe(true);
    expect(isCompleteResult({ processing: { complete: false } })).toBe(false);
    expect(isCompleteResult({ complete: false })).toBe(false);
    expect(isCompleteResult(null)).toBe(false);
  });

  it("isolamento: cada teste começa com o cache vazio (setup global)", () => {
    expect(cacheStats().size).toBe(0);
  });
});

// ── Integração com o AIService (IA simulada, cache ativo) ─────────────────────

function simplifyCompletion(resumo: string) {
  return {
    choices: [{
      message: {
        role: "assistant",
        content: JSON.stringify({
          resumo,
          objetivo: "Objetivo",
          quemPodeParticipar: "Pesquisadores",
          prazoInscricao: "Não informado",
          ondeSeInscrever: "Não informado",
          principaisRequisitos: "Requisitos",
          linguagemSimples: "Texto simples",
        }),
      },
    }],
    usage: { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600 },
  };
}

const VALID_SIMPLES_RESPONSE = {
  type: "simples",
  scoreOportunidade: 80,
  categoria: "Bolsa de estudos",
  resumo: "Edital de bolsas.",
  objetivo: "Apoio financeiro.",
  publicoAlvo: "Estudantes.",
  prazo: "15/03 a 15/04/2026",
  requisitos: ["Ser brasileiro"],
  ondeInscrever: "Portal",
  observacao: "Bolsa mensal.",
};

const VALID_CHUNK_FACTS = {
  documentInfo: [{ title: "Edital Teste" }],
  dates: [{ event: "Publicação", value: "01/03/2026" }],
  requirements: [{ requirement: "Ser brasileiro" }],
  eligibility: [],
  documents: [{ document: "RG" }],
  values: [{ value: "R$ 1.500,00" }],
  contacts: [],
  obligations: [],
  restrictions: [],
  alerts: [],
};

function completion(payload: unknown) {
  return {
    choices: [{ message: { role: "assistant", content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 800, completion_tokens: 150, total_tokens: 950 },
  };
}

function longEdital(paragraphs: number, tail = ""): string {
  const out: string[] = [];
  for (let i = 1; i <= paragraphs; i++) {
    out.push(
      `SEÇÃO ${i} — Para participar, o candidato deverá ser brasileiro, estar matriculado em curso de graduação ` +
        `e comprovar renda familiar per capita de até dois salários mínimos. O valor da bolsa será de R$ 1.500,00 por mês ` +
        `durante doze meses. As inscrições ocorrem no portal eletrônico do programa ${i}.`,
    );
  }
  return out.join("\n\n") + tail;
}

describe("aiCache — integração com AIService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.AI_MODEL;
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("simplifyEdital: documentos com mesmo preâmbulo de 2.000 caracteres recebem resultados distintos", async () => {
    const { simplifyEdital } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any).mockImplementation((async (req: any) => {
      const user = String(req.messages?.find((m: any) => m.role === "user")?.content ?? "");
      return simplifyCompletion(user.includes("doutorandos") ? "Resumo B" : "Resumo A");
    }) as any);

    const a = (await simplifyEdital(DOC_A)) as { resumo: string };
    const b = (await simplifyEdital(DOC_B)) as { resumo: string };

    expect(a.resumo).toBe("Resumo A");
    expect(b.resumo).toBe("Resumo B");
    expect(spy).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("simplifyEdital: o mesmo documento repetido usa o cache (cache segue ativo)", async () => {
    const { simplifyEdital } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(simplifyCompletion("Resumo A") as any);

    await simplifyEdital(DOC_A);
    await simplifyEdital(DOC_A);

    expect(spy).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("simplifyEdital: trocar o modelo invalida o cache", async () => {
    const { simplifyEdital } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(simplifyCompletion("Resumo A") as any);

    process.env.AI_MODEL = "openai/gpt-oss-120b";
    await simplifyEdital(DOC_A);
    process.env.AI_MODEL = "openai/gpt-oss-20b";
    await simplifyEdital(DOC_A);

    expect(spy).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("analyzeAgent: perfis diferentes não compartilham resultado", async () => {
    const { analyzeAgent } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(completion(VALID_SIMPLES_RESPONSE) as any);

    const text = longEdital(3);
    await analyzeAgent("simples", text, { escolaridade: "superior" });
    const callsAfterFirst = spy.mock.calls.length;
    await analyzeAgent("simples", text, { escolaridade: "superior" });
    expect(spy.mock.calls.length).toBe(callsAfterFirst); // cache hit
    await analyzeAgent("simples", text, { escolaridade: "medio" });
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst); // perfil diferente → nova chamada
  }, 30_000);

  it("analyzeAgent: resultado parcial (chunk com 500) não é armazenado e a próxima chamada reprocessa", async () => {
    const { analyzeAgent } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any);

    const text = longEdital(220);

    // 1ª chamada: primeiro chunk ok, demais falham → parcial
    spy.mockResolvedValueOnce(completion(VALID_CHUNK_FACTS) as any);
    spy.mockRejectedValue(new Error("500 Internal Server Error"));
    const partial = (await analyzeAgent("simples", text)) as Record<string, any>;
    expect(partial.processing?.complete).toBe(false);

    // 2ª chamada: provedor recuperado → precisa chamar a IA de novo
    spy.mockReset();
    spy.mockResolvedValue(completion(VALID_CHUNK_FACTS) as any);
    const full = (await analyzeAgent("simples", text)) as Record<string, any>;
    expect(spy).toHaveBeenCalled();
    expect(full.processing?.complete).toBe(true);

    // 3ª chamada: resultado completo agora está em cache
    const callsBefore = spy.mock.calls.length;
    await analyzeAgent("simples", text);
    expect(spy.mock.calls.length).toBe(callsBefore);
  }, 120_000);

  it("analyzeAgent: documentos com mesmo início e final diferente não compartilham resultado", async () => {
    const { analyzeAgent } = await import("../aiService");
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(completion(VALID_SIMPLES_RESPONSE) as any);

    const base = longEdital(10);
    expect(base.length).toBeGreaterThan(2000);
    await analyzeAgent("simples", `${base}\n\nAnexo: prazo final 10/03/2026.`);
    const calls = spy.mock.calls.length;
    await analyzeAgent("simples", `${base}\n\nAnexo: prazo final 25/09/2026.`);
    expect(spy.mock.calls.length).toBeGreaterThan(calls);
  }, 30_000);
});
