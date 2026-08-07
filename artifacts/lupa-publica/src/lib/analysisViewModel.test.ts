import { describe, expect, it } from "vitest";
import { buildChecklistItems, buildFaqItems, buildTimelineSteps, buildChatSuggestions } from "./analysisViewModel";

describe("analysis view model", () => {
  it("prefers canonical cronograma and falls back to the agent result when needed", () => {
    const canonical = {
      cronograma: {
        items: [{ fase: "Inscrição", periodo: "10/03/2026", descricao: "Abertura" }],
      },
    };

    expect(buildTimelineSteps(canonical, null)).toEqual([
      { title: "Inscrição", date: "10/03/2026", description: "Abertura" },
    ]);
  });

  it("uses checklist from the agent result when canonical checklist is empty", () => {
    const canonical = { interpretation: { summary: "Resumo" } };
    const agentResult = {
      type: "documentacao",
      checklist: [{ doc: "CPF", checked: false, observacao: "Obrigatório" }],
    };

    expect(buildChecklistItems(canonical, agentResult)).toEqual([
      { label: "CPF", done: false, hint: "Obrigatório" },
    ]);
  });

  it("builds FAQ from the canonical interpretation even when the structure is partial", () => {
    const canonical = {
      interpretation: {
        targetAudience: "Estudantes universitários",
        deadlines: "Até 15/04/2026",
        registrationLocation: "Portal do órgão",
      },
      elegibilidade: {
        recommendation: "Perfil compatível com o edital.",
      },
    };

    expect(buildFaqItems(canonical)).toEqual([
      { question: "Quem pode participar deste edital?", answer: "Estudantes universitários" },
      { question: "Quais são os prazos mais importantes?", answer: "Até 15/04/2026" },
      { question: "Como faço a inscrição?", answer: "Portal do órgão" },
      { question: "Meu perfil atende a este edital?", answer: "Perfil compatível com o edital." },
    ]);
  });

  it("offers chat suggestions based on a populated timeline and checklist", () => {
    const suggestions = buildChatSuggestions(
      { documento: { orgao: "MEC" } },
      [{ title: "Inscrição", date: "10/03/2026", description: "Abertura" }],
      [{ label: "CPF", done: true, hint: "Obrigatório" }],
    );

    expect(suggestions[0]).toBe("Qual órgão publicou este edital?");
    expect(suggestions).toContain("Quais datas precisam de atenção?");
  });
});
