import { describe, expect, it } from "vitest";
import { buildCanonicalAnalysis, chunkDocument, consolidateChunkFacts } from "../aiService";
import { classifyAiError } from "../processingErrors";

describe("buildCanonicalAnalysis", () => {
  it("assembles a single canonical analysis from an agent result", () => {
    const result = {
      type: "analista",
      tipoEdital: "Concurso Público",
      instituicao: "FAPESP",
      prazo: "20/10/2025",
      publicoAlvo: "Estudantes",
      requisitos: ["Possuir graduação"],
      documentos: ["RG", "CPF"],
      valor: "R$ 5.000,00",
      alertas: ["Prazo pode ser atualizado"],
    };

    const canonical = buildCanonicalAnalysis("analista", result as any, "Texto de exemplo do edital", {
      escolaridade: "superior",
      atuacao: "pesquisa",
      municipio: "São Paulo",
      rendaFamiliar: "1a3",
    });

    expect(canonical.analysisId).toMatch(/^analysis-/);
    expect(canonical.schemaVersion).toBe("1.0.1");
    expect(canonical.interpretation.summary).toContain("Concurso Público");
    expect(canonical.valores?.valor).toBe("R$ 5.000,00");
    expect(canonical.documentosExigidos.items).toEqual(["RG", "CPF"]);
    expect(canonical.alertas).toContain("Prazo pode ser atualizado");
  });

  it("detecta conflitos temporais no cronograma e marca alertas estruturados", () => {
    const result = {
      type: "acompanhamento",
      timeline: [
        { fase: "Inscrição", periodo: "20/10/2025", dataInicio: "20/10/2025", dataFim: "15/10/2025", descricao: "Erro de data", status: "ativo" },
      ],
      observacao: "Cronograma com inconsistência",
      alertas: [],
    };

    const canonical = buildCanonicalAnalysis("acompanhamento", result as any, "Edital com datas conflitantes", undefined);

    expect(canonical.cronograma?.validacaoTemporal?.temConflitos).toBe(true);
    expect(canonical.alertas).toEqual(expect.arrayContaining([expect.objectContaining({ categoria: "temporal" })]));
  });

  it("classifica mensagens de erro de conteúdo muito grande com resposta clara para o usuário", () => {
    const classification = classifyAiError("content too large: request exceeds the input limit");

    expect(classification.status).toBe(413);
    expect(classification.retryable).toBe(false);
    expect(classification.userMessage).toContain("processado em partes");
  });

  it("classifica limites de contexto da IA como documento grande para processamento em partes", () => {
    const classification = classifyAiError("The document exceeds the maximum context length for this model");

    expect(classification.status).toBe(413);
    expect(classification.retryable).toBe(false);
    expect(classification.userMessage).toContain("processado em partes");
  });

  it("registra evidência e alerta quando um cronograma usa data sem suporte explícito no edital", () => {
    const canonical = buildCanonicalAnalysis(
      "acompanhamento",
      {
        type: "acompanhamento",
        timeline: [{ fase: "Inscrição", periodo: "15/10/2026", descricao: "Período de inscrição", status: "ativo" }],
        alertas: [],
      } as any,
      "Edital da FAPDF com prazo de inscrição para 2026, sem data exata indicada.",
      undefined,
    );

    expect(canonical.evidencias?.some((item) => item.campo === "cronograma" && item.evento === "Inscrição")).toBe(true);
    expect(canonical.alertas).toEqual(expect.arrayContaining([expect.objectContaining({ categoria: "temporal" })]));
  });

  it("marca como não suportado um cronograma com datas históricas de anos anteriores ao edital sem contexto explícito", () => {
    const canonical = buildCanonicalAnalysis(
      "acompanhamento",
      {
        type: "acompanhamento",
        anoPublicacao: 2026,
        timeline: [
          { fase: "Inscrição", periodo: "15/10/2019", descricao: "Período de inscrição", status: "ativo" },
          { fase: "Resultado", periodo: "15/12/2017", descricao: "Resultado", status: "futuro" },
        ],
        alertas: [],
      } as any,
      "Edital nº 11/2026. Para fins históricos, houve eventos em 2017 e 2019, mas essas datas não são eventos deste edital.",
      undefined,
    );

    expect(canonical.evidencias?.some((item) => item.campo === "cronograma" && item.descricao.includes("sem evidência explícita"))).toBe(true);
    expect(canonical.alertas).toEqual(expect.arrayContaining([expect.objectContaining({ categoria: "temporal" })]));
  });

  it("divide documentos longos em chunks sem truncar o conteúdo", () => {
    const sections = Array.from({ length: 8 }, (_, index) => `Seção ${index + 1}: ${"texto de exemplo ".repeat(1200)}`).join("\n\n");
    const chunks = chunkDocument(`Título do edital\n\n${sections}`);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.trim().length > 0)).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("Seção 8"))).toBe(true);
    expect(chunks[0].text).toContain("Título do edital");
  });

  it("divide um documento de aproximadamente 84 mil caracteres em vários blocos sem truncar", () => {
    const largeDocument = Array.from({ length: 70 }, (_, index) => `Parágrafo ${index + 1}: ${"texto de exemplo para edital ".repeat(1200)}`).join("\n\n");
    const chunks = chunkDocument(`Título do edital\n\n${largeDocument}`);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.reduce((acc, chunk) => acc + chunk.text.length, 0)).toBeGreaterThan(84000);
    expect(chunks.every((chunk) => chunk.text.trim().length > 0)).toBe(true);
  });

  it("consolida fatos de chunks diferentes sem duplicar requisitos e datas", () => {
    const consolidated = consolidateChunkFacts([
      {
        chunkId: "chunk-1",
        facts: {
          documentInfo: [{ title: "Edital de exemplo", page: 1, section: "Resumo", text: "Edital de exemplo" }],
          dates: [{ event: "Inscrição", value: "10/10/2026", page: 1, section: "Cronograma", text: "Inscrição em 10/10/2026" }],
          requirements: [{ requirement: "Enviar RG", page: 2, section: "Requisitos", text: "Enviar RG" }],
          eligibility: [{ criterion: "Ter 18 anos", page: 2, section: "Elegibilidade", text: "Ter 18 anos" }],
          documents: [{ document: "RG", page: 2, section: "Documentos", text: "RG" }],
          values: [],
          contacts: [],
          obligations: [{ obligation: "Entregar documentação", page: 3, section: "Obrigações", text: "Entregar documentação" }],
          restrictions: [],
          alerts: [],
        },
      },
      {
        chunkId: "chunk-2",
        facts: {
          documentInfo: [{ title: "Edital de exemplo", page: 4, section: "Resumo", text: "Edital de exemplo" }],
          dates: [{ event: "Inscrição", value: "10/10/2026", page: 4, section: "Cronograma", text: "Inscrição em 10/10/2026" }],
          requirements: [{ requirement: "Enviar RG", page: 4, section: "Requisitos", text: "Enviar RG" }],
          eligibility: [{ criterion: "Ter 18 anos", page: 4, section: "Elegibilidade", text: "Ter 18 anos" }],
          documents: [{ document: "RG", page: 4, section: "Documentos", text: "RG" }],
          values: [],
          contacts: [],
          obligations: [{ obligation: "Entregar documentação", page: 5, section: "Obrigações", text: "Entregar documentação" }],
          restrictions: [],
          alerts: [],
        },
      },
    ] as any);

    expect(consolidated.requirements).toHaveLength(1);
    expect(consolidated.dates).toHaveLength(1);
    expect(consolidated.obligations).toHaveLength(1);
    expect(consolidated.documents).toHaveLength(1);
  });
});
