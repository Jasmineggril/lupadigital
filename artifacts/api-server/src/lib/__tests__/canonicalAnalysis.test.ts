import { describe, expect, it } from "vitest";
import { buildCanonicalAnalysis } from "../aiService";
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
});
