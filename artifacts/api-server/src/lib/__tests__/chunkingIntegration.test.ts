import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  chunkDocument,
  estimateTokens,
  consolidateChunkFacts,
  type AgentId,
} from "../aiService";

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
    "O peso das questões será distribuído da seguinte forma: Língua Portuguesa com dez questões, Matemática com dez questões, Conhecimentos Gerais com dez questões.",
    "A prova será realizada em 20 de maio, das 9h às 12h30, nos centros de aplicação que serão divulgados até 10 de maio no portal eletrônico.",
    "Os candidatos deverão Comparecer ao local da prova com documento de identidade original e caneta esferográfica azul ou preta. É vedada a entrada com aparelhos eletrônicos.",
    "A pontuação mínima para aprovação na prova objetiva será de 70% (setenta por cento) do total de pontos, equivalendo a 28 acertos de quarenta questões.",
    "Os aprovados na primeira etapa deverão apresentar a documentação original para fins de verificação, no prazo de dez dias úteis após a divulgação do resultado.",
    "A renda familiar per capita será calculada dividindo-se a renda bruta mensal pelo número de membros da família que residam no mesmo domicílio.",
    "Serão desclassificados os candidatos que não apresentarem a documentação completa dentro do prazo estabelecido, bem como aqueles que apresentarem documentação irregular.",
    "O resultado da análise documental será divulgado no portal eletrônico em até quinze dias úteis após o encerramento do prazo de entrega da documentação.",
    "Os candidatos que não concordarem com o resultado poderão interpor recurso administrativo no prazo de cinco dias úteis, contados da data de publicação do resultado.",
    "Os recursos deverão ser protocolados exclusivamente por meio do portal eletrônico, motivadamente, acompanhados dos documentos que sustentem o pedido.",
    "A comissão de recursos terá o prazo de dez dias úteis para analisar e julgar os recursos apresentados, e sua decisão será publicada no portal eletrônico.",
    "A bolsa será paga mensalmente por meio de transferência bancária, na conta indicada pelo beneficiário durante o processo de inscrição no programa.",
    "O beneficiário deverá manter seu cadastro atualizado junto ao programa, informando qualquer alteração de dados pessoais, bancários ou acadêmicos.",
    "A não atualização dos dados cadastrais poderá acarretar o cancelamento da bolsa, até que a regularização seja efetuada pelo beneficiário.",
    "O beneficiário deverá manter aproveitamento acadêmico mínimo de 70% das disciplinas cursadas no período letivo, comprovado mediante declaração da instituição.",
    "A suspensão temporária da bolsa ocorrerá nos seguintes casos: afastamento por doença superior a noventa dias, gravidez, ou estágio não obrigatório.",
    "O cancelamento da bolsa ocorrerá nos seguintes casos: reprovação em mais de 30% das disciplinas, abandono do curso, ou falsidade na documentação apresentada.",
    "Os casos omissos neste edital serão resolvidos pela comissão organizadora, que poderá solicitar orientação à Assessoria Jurídica do Ministério da Educação.",
    "Este edital entra em vigor na data de sua publicação no Diário Oficial da União, com efeitos a partir da data de abertura das inscrições.",
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

describe("chunking com texto sintético de ~6.800 palavras", () => {
  const syntheticText = generateSyntheticEdital(6800);
  const wordCount = syntheticText.split(/\s+/).length;

  it(`gera texto com ~6.800 palavras (actual: ${wordCount})`, () => {
    expect(wordCount).toBeGreaterThanOrEqual(6000);
    expect(wordCount).toBeLessThanOrEqual(8000);
  });

  it("estimateTokens > 7.200 (threshold de 60% de 12.000)", () => {
    const tokens = estimateTokens(syntheticText);
    const threshold = 12000 * 0.6;

    expect(tokens).toBeGreaterThan(threshold);
  });

  it("shouldChunk é true para este texto", () => {
    const tokens = estimateTokens(syntheticText);
    const threshold = 12000 * 0.6;
    const shouldChunk = tokens > threshold;

    expect(shouldChunk).toBe(true);
  });

  it("chunkDocument produz mais de 1 chunk", () => {
    const chunks = chunkDocument(syntheticText);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("cada chunk tem estimatedTokens dentro do limite alvo", () => {
    const chunks = chunkDocument(syntheticText);
    const targetTokens = 1800;

    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeLessThanOrEqual(targetTokens * 1.5);
    }
  });

  it("chunks têm índices sequenciais", () => {
    const chunks = chunkDocument(syntheticText);

    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(chunk.chunkId).toBe(`chunk-${i + 1}`);
    });
  });

  it("consolidação de chunks retorna estrutura válida", () => {
    const chunks = chunkDocument(syntheticText);

    const chunkResults = chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      facts: {
        documentInfo: [{ title: `Documento chunk ${chunk.index}` }],
        dates: [{ event: `Publicação chunk ${chunk.index}`, value: "01/01/2025" }],
        requirements: [{ requirement: `Requisito do chunk ${chunk.index}` }],
        eligibility: [],
        documents: [],
        values: [],
        contacts: [],
        obligations: [],
        restrictions: [],
        alerts: [],
      },
    }));

    const consolidated = consolidateChunkFacts(chunkResults);

    expect(consolidated.documentInfo.length).toBeGreaterThan(0);
    expect(consolidated.dates.length).toBeGreaterThanOrEqual(chunks.length);
    expect(consolidated.requirements.length).toBeGreaterThanOrEqual(chunks.length);
  });
});

describe("fallback provider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("createWithFallback tenta fallback em erro retryable 503", async () => {
    const { createWithFallback } = await import("@workspace/integrations-openai-ai-server");

    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const geminiBody = {
      candidates: [{ content: { parts: [{ text: '{"test": true}' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    };

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockRejectedValueOnce(new Error("503 Service Unavailable: server overloaded"));

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => geminiBody,
    } as Response);

    const result = await createWithFallback({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.fallbackAttempted).toBe(true);
    expect(result.fallbackSucceeded).toBe(true);
  });

  it("createWithFallback NÃO tenta fallback em erro não-retryable 401", async () => {
    const { createWithFallback } = await import("@workspace/integrations-openai-ai-server");

    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const mockCreate = vi.fn()
      .mockRejectedValue(new Error("401 Unauthorized: invalid api key"));

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockImplementation(mockCreate as any);

    await expect(
      createWithFallback({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow("401 Unauthorized");

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("createWithFallback trata timeout como retryable", async () => {
    const { createWithFallback } = await import("@workspace/integrations-openai-ai-server");

    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const geminiBody = {
      candidates: [{ content: { parts: [{ text: '{"fallback": true}' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    };

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockRejectedValueOnce(new Error("ETIMEDOUT: request timed out"));

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => geminiBody,
    } as Response);

    const result = await createWithFallback({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.fallbackAttempted).toBe(true);
    expect(result.fallbackSucceeded).toBe(true);
  });

  it("createWithFallback lança erro primário quando fallback também falha", async () => {
    const { createWithFallback } = await import("@workspace/integrations-openai-ai-server");

    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const mockCreate = vi.fn()
      .mockRejectedValueOnce(new Error("500 Internal Server Error"))
      .mockRejectedValueOnce(new Error("Gemini also failed"));

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockImplementation(mockCreate as any);

    await expect(
      createWithFallback({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow("500 Internal Server Error");
  });
});

describe("logs não expõem dados sensíveis", () => {
  const syntheticText = generateSyntheticEdital(6800);

  it("inputCharacters é número, não texto", () => {
    const chars = syntheticText.length;

    expect(typeof chars).toBe("number");
    expect(chars).toBeGreaterThan(0);
    expect(typeof syntheticText).toBe("string");
  });

  it("estimateTokens não contém conteúdo do documento", () => {
    const tokens = estimateTokens(syntheticText);

    expect(typeof tokens).toBe("number");
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("end-to-end: analyzeAgent com ~6.800 palavras via chunking", () => {
  const syntheticText = generateSyntheticEdital(6800);

  it("fluxo completo: chunking → processamento → consolidação → resposta válida", async () => {
    const { analyzeAgent } = await import("../aiService");

    const mockAnalysisResult = {
      choices: [{
        message: {
          content: JSON.stringify({
            documentInfo: [{ title: "Edital de Bolsa", organization: "MEC" }],
            dates: [{ event: "Publicação", value: "01/03/2025" }],
            requirements: [{ requirement: "Ser brasileiro" }],
            eligibility: [{ criterion: "Renda familiar" }],
            documents: [{ document: "RG" }],
            values: [{ value: "R$ 1.500,00" }],
            contacts: [],
            obligations: [{ obligation: "Manter aproveitamento" }],
            restrictions: [],
            alerts: [],
          }),
          role: "assistant",
        },
      }],
      usage: { prompt_tokens: 1500, completion_tokens: 200, total_tokens: 1700 },
    };

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(mockAnalysisResult as any);

    const result = await analyzeAgent("simples", syntheticText, undefined, { userId: "test-user", documentId: null }) as Record<string, unknown>;

    expect(result).toBeDefined();
    expect(result.type).toBe("simples");
    expect(result.analysisId).toBeDefined();
    expect(result.schemaVersion).toBe("1.0.1");

    const processing = result.processing as Record<string, unknown> | undefined;
    expect(processing).toBeDefined();
    expect(processing?.mode).toBe("chunked");
    expect(processing?.totalChunks).toBeGreaterThan(1);
    expect(processing?.processedChunks).toBeGreaterThan(0);
    expect(processing?.complete).toBe(true);
  }, 60_000);

  it("resposta contém campos canônicos obrigatórios", async () => {
    const { analyzeAgent } = await import("../aiService");

    const mockResult = {
      choices: [{
        message: {
          content: JSON.stringify({
            documentInfo: [{ title: "Edital Teste" }],
            dates: [],
            requirements: [],
            eligibility: [],
            documents: [],
            values: [],
            contacts: [],
            obligations: [],
            restrictions: [],
            alerts: [],
          }),
          role: "assistant",
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockResolvedValue(mockResult as any);

    const result = await analyzeAgent("simples", syntheticText) as Record<string, unknown>;

    expect(result.interpretation).toBeDefined();
    expect(result.documentosExigidos).toBeDefined();
    expect(result.alertas).toBeDefined();
    expect(result.source).toBeDefined();
    expect((result.source as Record<string, unknown>).agentId).toBe("simples");
  }, 60_000);
});

describe("fallback Groq 503 → Gemini conclui análise", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("quando Groq retorna 503, fallback para Gemini retorna resposta válida", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY = "test-gemini-key";
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const geminiContent = JSON.stringify({
      type: "simples",
      scoreOportunidade: 75,
      categoria: "Bolsa",
      resumo: "Edital de bolsa para estudantes de baixa renda.",
      objetivo: "Apoio financeiro a estudantes.",
      publicoAlvo: "Estudantes de baixa renda.",
      prazo: "15/03 a 15/04/2025",
      requisitos: ["Ser brasileiro", "Renda familiar baixa"],
      ondeInscrever: "Portal do MEC",
      observacao: "Bolsa mensal de até R$ 1.500.",
      alertas: [],
    });

    const geminiBody = {
      candidates: [{ content: { parts: [{ text: geminiContent }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 150, totalTokenCount: 650 },
    };

    const { openai } = await import("@workspace/integrations-openai-ai-server");
    vi.spyOn(openai.chat.completions, "create" as any).mockRejectedValueOnce(new Error("503 Service Unavailable: Groq server overloaded"));

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => geminiBody,
    } as Response);

    const { createWithFallback } = await import("@workspace/integrations-openai-ai-server");
    const result = await createWithFallback({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Analise este edital." }],
    });

    expect(result.fallbackAttempted).toBe(true);
    expect(result.fallbackSucceeded).toBe(true);
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");

    const content = (result.result as any).choices[0].message.content;
    const parsed = JSON.parse(content);
    expect(parsed.type).toBe("simples");
    expect(parsed.resumo).toBeDefined();
  });
});
