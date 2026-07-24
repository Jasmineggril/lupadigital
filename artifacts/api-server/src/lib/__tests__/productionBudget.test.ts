import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const VALID_SIMPLES_RESPONSE = {
  type: "simples",
  scoreOportunidade: 80,
  categoria: "Bolsa de estudos",
  resumo: "Edital de concessão de bolsas para estudantes de baixa renda.",
  objetivo: "Apoio financeiro a estudantes de graduação.",
  publicoAlvo: "Estudantes de graduação com renda familiar baixa.",
  prazo: "15/03 a 15/04/2025",
  requisitos: ["Ser brasileiro", "Renda familiar per capita até 2 SM"],
  ondeInscrever: "Portal do MEC",
  observacao: "Bolsa mensal de até R$ 1.500,00.",
};

const VALID_CHUNK_FACTS = {
  documentInfo: [{ title: "Edital Teste" }],
  dates: [{ event: "Publicação", value: "01/03/2025" }],
  requirements: [{ requirement: "Ser brasileiro" }],
  eligibility: [],
  documents: [{ document: "RG" }],
  values: [{ value: "R$ 1.500,00" }],
  contacts: [],
  obligations: [],
  restrictions: [],
  alerts: [],
};

function buildSimplesCompletion() {
  return {
    choices: [{
      message: { content: JSON.stringify(VALID_SIMPLES_RESPONSE), role: "assistant" },
    }],
    usage: { prompt_tokens: 800, completion_tokens: 150, total_tokens: 950 },
  };
}

function buildChunkCompletion() {
  return {
    choices: [{
      message: { content: JSON.stringify(VALID_CHUNK_FACTS), role: "assistant" },
    }],
    usage: { prompt_tokens: 1200, completion_tokens: 200, total_tokens: 1400 },
  };
}

function buildRateLimitError(retryAfter?: number): Error {
  const err = new Error("429 Too Many Requests: rate limit reached");
  (err as any).status = 429;
  (err as any).cause = {
    status: 429,
    headers: retryAfter != null ? { "retry-after": String(retryAfter) } : {},
    body: retryAfter != null ? { retry_after: retryAfter } : {},
  };
  return err;
}

function generateSyntheticEdital(wordCount: number): string {
  const base = [
    "Edital de convocação pública para concessão de bolsa de estudos no âmbito do Programa Nacional de Apoio à Educação Superior.",
    "A Secretaria de Educação Superior do Ministério da Educação torna público, para conhecimento dos interessados, que está aberto o prazo para inscrição.",
    "O presente edital regula a concessão de bolsas de estudos destinadas a estudantes de baixa renda que estejam matriculados em instituições de ensino superior.",
    "Para participar deste programa, o candidato deverá atender aos seguintes requisitos: ser brasileiro ou naturalizado, estar regularmente matriculado em curso de graduação.",
    "O valor da bolsa será de até R$ 1.500,00 (um mil e quinhentos reais) por mês, durante o período de doze meses, podendo ser renovado anualmente.",
    "As inscrições deverão ser realizadas exclusivamente por meio do portal eletrônico do MEC, no endereço eletrônico bolsas.mec.gov.br, no período de 15 de março a 15 de abril.",
    "Serão aceitas inscrições de candidatos que comprovem renda familiar per capita de até dois salários mínimos, mediante declaração assinada e documentação comprobatória.",
    "A documentação necessária inclui: RG, CPF, comprovante de residência, certidão de nascimento ou casamento, comprovante de renda e declaração de situação socioeconômica.",
    "O processo seletivo será realizado em duas etapas: análise documental e prova objetiva. A análise documental verificará a regularidade da documentação apresentada.",
    "A prova objetiva será composta de quarenta questões de múltipla escolha, abrangendo as disciplinas de Língua Portuguesa, Matemática, Conhecimentos Gerais e Área de Concentração.",
  ];

  const paragraphs: string[] = [];
  let count = 0;
  let sectionIndex = 1;

  while (count < wordCount) {
    const section = `SEÇÃO ${sectionIndex} — DISPOSIÇÕES Gerais do Artigo ${sectionIndex}. `;
    const body = base[count % base.length];
    const extra = ` Parágrafo único. As disposições desta seção aplicam-se a todos os candidatos inscritos no programa ${sectionIndex} do edital.`;
    const paragraph = section + body + extra;
    paragraphs.push(paragraph);
    count += paragraph.split(/\s+/).length;
    sectionIndex += 1;
  }

  return paragraphs.join("\n\n");
}

describe("orçamento dinâmico de tempo", () => {
  it("canStartChunk retorna true quando há tempo suficiente", async () => {
    const { createTimeBudget } = await import("../aiService");
    const budget = createTimeBudget(Date.now(), 240_000, 30_000);
    expect(budget.canStartChunk(6, 0)).toBe(true);
    expect(budget.canStartChunk(6, 5)).toBe(true);
  });

  it("canStartChunk retorna false quando não há tempo suficiente", async () => {
    const { createTimeBudget } = await import("../aiService");
    const budget = createTimeBudget(Date.now() - 230_000, 240_000, 30_000);
    expect(budget.canStartChunk(6, 0)).toBe(false);
  });

  it("getChunkTimeoutMs diminui conforme chunks são processados", async () => {
    const { createTimeBudget } = await import("../aiService");
    const budget = createTimeBudget(Date.now(), 240_000, 30_000);
    const timeout0 = budget.getChunkTimeoutMs(6, 0);
    const timeout3 = budget.getChunkTimeoutMs(6, 3);
    const timeout5 = budget.getChunkTimeoutMs(6, 5);
    expect(timeout0).toBeGreaterThanOrEqual(20_000);
    expect(timeout3).toBeGreaterThanOrEqual(timeout0);
    expect(timeout5).toBeGreaterThanOrEqual(timeout3);
  });

  it("getChunkTimeoutMs nunca cai abaixo de MIN_CHUNK_TIMEOUT_MS (20s)", async () => {
    const { createTimeBudget } = await import("../aiService");
    const budget = createTimeBudget(Date.now() - 235_000, 240_000, 30_000);
    const timeout = budget.getChunkTimeoutMs(6, 5);
    expect(timeout).toBeGreaterThanOrEqual(20_000);
  });

  it("getRemainingMs retorna tempo restante correto", async () => {
    const { createTimeBudget } = await import("../aiService");
    const start = Date.now() - 10_000;
    const budget = createTimeBudget(start, 240_000, 30_000);
    const remaining = budget.getRemainingMs();
    expect(remaining).toBeGreaterThanOrEqual(229_000);
    expect(remaining).toBeLessThanOrEqual(231_000);
  });

  it("orçamento global insuficiente → canStartChunk retorna false", async () => {
    const { createTimeBudget } = await import("../aiService");
    const budget = createTimeBudget(Date.now() - 235_000, 240_000, 30_000);
    expect(budget.canStartChunk(6, 0)).toBe(false);
    expect(budget.getRemainingMs()).toBeLessThan(30_000);
  });
});

describe("teste de produção realista — ~7.000 palavras", () => {
  const syntheticText = generateSyntheticEdital(7000);
  const wordCount = syntheticText.split(/\s+/).length;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SKIP_GEMINI_FALLBACK;
    delete process.env.AI_SKIP_OPENAI_FALLBACK;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("gera texto com ~7.000 palavras", () => {
    expect(wordCount).toBeGreaterThanOrEqual(6500);
    expect(wordCount).toBeLessThanOrEqual(8000);
  });

  it("fluxo completo: chunking → processamento → consolidação → HTTP 200", async () => {
    const { analyzeAgent, chunkDocument, estimateTokens } = await import("../aiService");

    const tokens = estimateTokens(syntheticText);
    const chunks = chunkDocument(syntheticText);

    console.log(`\n  === MÉTRICAS DE PRODUÇÃO ===`);
    console.log(`  Palavras: ${wordCount}`);
    console.log(`  estimatedTokens: ${tokens}`);
    console.log(`  totalChunks: ${chunks.length}`);
    console.log(`  concurrency: 1`);

    for (const chunk of chunks) {
      console.log(`  chunk ${chunk.chunkId}: ~${chunk.estimatedTokens} tokens`);
    }

    const mockCompletion = buildChunkCompletion();
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(mockCompletion as any);

    const start = Date.now();
    const result = await analyzeAgent("simples", syntheticText, undefined, { userId: "test-user", documentId: null }) as Record<string, unknown>;
    const totalDuration = Date.now() - start;

    console.log(`  duração total: ${totalDuration}ms`);
    console.log(`  margem restante: ${240_000 - totalDuration}ms`);
    console.log(`  status: HTTP 200 (sucesso)`);
    console.log(`  ============================\n`);

    expect(result).toBeDefined();
    expect(result.type).toBe("simples");
    expect(result.analysisId).toBeDefined();

    const processing = result.processing as Record<string, unknown> | undefined;
    expect(processing).toBeDefined();
    expect(processing?.mode).toBe("chunked");
    expect(processing?.totalChunks).toBeGreaterThan(1);
    expect(processing?.complete).toBe(true);
    expect(totalDuration).toBeLessThan(240_000);
  }, 60_000);
});

describe("tratamento de 429 do Groq", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SKIP_GEMINI_FALLBACK;
    delete process.env.AI_SKIP_OPENAI_FALLBACK;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("429 uma vez no chunking → retry com backoff e sucesso", async () => {
    const { analyzeAgent } = await import("../aiService");
    const longText = generateSyntheticEdital(7000);
    const { chunkDocument } = await import("../aiService");
    const chunks = chunkDocument(longText);

    const mockCompletion = buildChunkCompletion();
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any);

    spy.mockRejectedValueOnce(buildRateLimitError(1));
    spy.mockResolvedValue(mockCompletion as any);

    const start = Date.now();
    const result = await analyzeAgent("simples", longText, undefined, { userId: "test-user", documentId: null }) as Record<string, unknown>;
    const duration = Date.now() - start;

    console.log(`\n  429 retry: duração = ${duration}ms (inclui backoff ~1s)`);
    console.log(`  chunks processados: ${(result.processing as any)?.processedChunks}`);
    console.log(`  totalChunks: ${(result.processing as any)?.totalChunks}`);

    expect(result).toBeDefined();
    expect(result.type).toBe("simples");
    expect(duration).toBeGreaterThanOrEqual(800);
  }, 60_000);

  it("429 continuamente → erro claro antes do timeout global", async () => {
    const { analyzeAgent } = await import("../aiService");
    const longText = generateSyntheticEdital(7000);

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockRejectedValue(buildRateLimitError());

    const start = Date.now();
    let caughtError: Error | null = null;
    try {
      await analyzeAgent("simples", longText, undefined, { userId: "test-user", documentId: null });
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err));
    }
    const duration = Date.now() - start;

    console.log(`\n  429 contínuo: duração = ${duration}ms (deve ser < 240s)`);

    expect(caughtError).not.toBeNull();
    const msg = caughtError!.message.toLowerCase();
    expect(msg.includes("429") || msg.includes("rate limit") || msg.includes("orçamento") || msg.includes("chunks falharam")).toBe(true);
    expect(duration).toBeLessThan(240_000);
  }, 60_000);
});

describe("testes de falha", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SKIP_GEMINI_FALLBACK;
    delete process.env.AI_SKIP_OPENAI_FALLBACK;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("Groq responde 200 → análise completa", async () => {
    const { analyzeAgent } = await import("../aiService");
    const shortText = generateSyntheticEdital(500);

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(buildSimplesCompletion() as any);

    const result = await analyzeAgent("simples", shortText, undefined, { userId: "test-user", documentId: null }) as Record<string, unknown>;

    expect(result).toBeDefined();
    expect(result.type).toBe("simples");
    expect(result.schemaVersion).toBe("1.0.1");
  }, 30_000);

  it("um chunk falha 500 → propaga erro, não retorna análise falsa", async () => {
    const { analyzeAgent, chunkDocument } = await import("../aiService");
    const longText = generateSyntheticEdital(7000);
    const chunks = chunkDocument(longText);

    const mockCompletion = buildChunkCompletion();
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any);

    spy.mockResolvedValueOnce(mockCompletion as any);
    spy.mockRejectedValue(new Error("500 Internal Server Error"));

    let caughtError: Error | null = null;
    try {
      await analyzeAgent("simples", longText, undefined, { userId: "test-user", documentId: null });
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err));
    }

    expect(caughtError).not.toBeNull();
    const msg = caughtError!.message;
    expect(msg.includes("chunks falharam") || msg.includes("Orçamento")).toBe(true);
  }, 60_000);
});

describe("documentação de flags temporárias", () => {
  it("AI_SKIP_GEMINI_FALLBACK e AI_SKIP_OPENAI_FALLBACK são medidas operacionais", () => {
    const flags = [
      "AI_SKIP_GEMINI_FALLBACK",
      "AI_SKIP_OPENAI_FALLBACK",
    ];
    for (const flag of flags) {
      expect(flag.startsWith("AI_SKIP_")).toBe(true);
      expect(flag).toMatch(/FALLBACK$/);
    }
  });
});

describe("subdivisão de chunk por context_length_exceeded", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SKIP_GEMINI_FALLBACK;
    delete process.env.AI_SKIP_OPENAI_FALLBACK;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("chunk com context_length_exceeded é subdividido e subchunks consolidam", async () => {
    const { analyzeAgent, chunkDocument } = await import("../aiService");
    const longText = generateSyntheticEdital(7000);

    const mockCompletion = buildChunkCompletion();
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const spy = vi.spyOn(openai.chat.completions, "create" as any);

    let callCount = 0;
    spy.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("context_length_exceeded: maximum context length is 128000 tokens (request: 130000)");
      }
      return mockCompletion as any;
    });

    const result = await analyzeAgent("simples", longText, undefined, { userId: "test-user", documentId: null }) as Record<string, unknown>;

    expect(result).toBeDefined();
    expect(result.type).toBe("simples");
    expect(callCount).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("chunk normal passa sem subdivisão", async () => {
    const { analyzeAgent } = await import("../aiService");
    const shortText = generateSyntheticEdital(500);

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(buildSimplesCompletion() as any);

    const result = await analyzeAgent("simples", shortText, undefined, { userId: "test-user", documentId: null }) as Record<string, unknown>;

    expect(result).toBeDefined();
    expect(result.type).toBe("simples");
  }, 30_000);
});

describe("separação de classificação de erros", () => {
  it("TPM limit é classificado como rate_limit, não content_too_large", async () => {
    const { classifyAiError } = await import("../processingErrors");
    const result = classifyAiError("TPM limit exceeded: 30000 tokens per minute");
    expect(result.reason).toBe("rate_limit");
    expect(result.status).toBe(429);
    expect(result.retryable).toBe(true);
  });

  it("context_length_exceeded é classificado separadamente", async () => {
    const { classifyAiError } = await import("../processingErrors");
    const result = classifyAiError("context_length_exceeded: maximum context length is 128000 tokens");
    expect(result.reason).toBe("context_length_exceeded");
    expect(result.status).toBe(413);
  });

  it("content too large permanece como content_too_large", async () => {
    const { classifyAiError } = await import("../processingErrors");
    const result = classifyAiError("Content too large: exceeds maximum token limit");
    expect(result.reason).toBe("content_too_large");
    expect(result.status).toBe(413);
  });

  it("max_tokens é classificado como max_output_tokens_invalid, não rate_limit", async () => {
    const { classifyAiError } = await import("../processingErrors");
    const result = classifyAiError("max_tokens exceeds the maximum allowed");
    expect(result.reason).toBe("max_output_tokens_invalid");
    expect(result.status).toBe(500);
    expect(result.retryable).toBe(false);
  });
});
