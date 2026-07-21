import { describe, expect, it } from "vitest";
import { buildCanonicalAnalysis } from "../aiService";

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
    expect(canonical.schemaVersion).toBe("1.0.0");
    expect(canonical.interpretation.summary).toContain("Concurso Público");
    expect(canonical.valores.valor).toBe("R$ 5.000,00");
    expect(canonical.documentosExigidos.items).toEqual(["RG", "CPF"]);
    expect(canonical.alertas).toContain("Prazo pode ser atualizado");
  });
});
