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
      // Prazo só da IA (sem base documental): identificado como tal
      { question: "Quais são os prazos mais importantes?", answer: "Até 15/04/2026 (segundo a IA; a data não foi localizada no texto do documento — confira)" },
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

// ── Resolvedor único (falhas reproduzidas em 22/11/2026) ─────────────────────
import { describeDeadline, resolveAnalysisFacts } from "./analysisViewModel";

const baseDoc = {
  versao: 1, documento_hash: "h", caracteres: 100, objeto: null,
  datas: [
    { rotulo: "inscrições", iso: "2026-12-20", texto: "Inscrições: de 01/12/2026 até 20/12/2026.", evidencia: "Inscrições: de 01/12/2026 até 20/12/2026." },
    { rotulo: "resultado", iso: "2027-01-15", texto: "Resultado: 15/01/2027.", evidencia: "Resultado: 15/01/2027." },
  ],
  valores: [], documentos: [{ texto: "Documentos: comprovante de matrícula", evidencia: "Documentos: comprovante de matrícula" }],
  requisitos: [{ texto: "Requisitos: estar matriculado", evidencia: "Requisitos: estar matriculado" }],
  restricoes: [], criterios: [], canal_inscricao: [],
  ausentes: ["áreas", "público elegível", "documentos exigidos", "critérios de avaliação"],
  elegibilidade_perfil: null,
};

describe("resolveAnalysisFacts", () => {
  it("chat, FAQ e cronograma usam o mesmo prazo, mesmo com 'Prazo não informado' da IA (análise antiga, sem fatos)", () => {
    const canonical = { interpretation: { deadlines: "Prazo não informado." }, base: baseDoc };
    const facts = resolveAnalysisFacts(canonical);
    expect(facts.deadline).toMatchObject({ text: "20/12/2026", source: "documento" });
    expect(describeDeadline(facts.deadline)).toContain("20/12/2026");
    expect(buildFaqItems(canonical).find((f) => /prazo/i.test(f.question))?.answer).toContain("20/12/2026");
    expect(buildTimelineSteps(canonical, null).some((s) => s.date === "20/12/2026")).toBe(true);
  });

  it("nunca troca um prazo confirmado por um marcador de ausência", () => {
    const facts = resolveAnalysisFacts({ interpretation: { deadlines: "Não informado" } });
    expect(facts.deadline).toBeNull();
    expect(describeDeadline(null)).toMatch(/não foi localizado/);
  });

  it("prazo só da IA fica identificado como tal", () => {
    const facts = resolveAnalysisFacts({ interpretation: { deadlines: "30/11/2026" } });
    expect(facts.deadline).toMatchObject({ source: "ia", iso: null });
    expect(describeDeadline(facts.deadline)).toMatch(/segundo a IA/);
  });

  it("conflito do servidor aparece junto do prazo", () => {
    const facts = resolveAnalysisFacts({
      fatos: {
        versao: 1, documento_hash: "h",
        prazo_inscricao: { iso: "2026-12-20", hora: null, fuso: null, texto: "20/12/2026", evidencia: "Inscrições até 20/12/2026.", prorrogado: false, fases: ["2026-12-20"], situacao: "aberta", origem: "edital" },
        prazo_ia: "15/12/2026",
        conflitos: [{ campo: "prazo de inscrição", documento: "20/12/2026", ia: "15/12/2026", evidencia: null, mensagem: "A IA indica 15/12/2026; o edital indica 20/12/2026." }],
        exigencias: [], campos: [], qualificadores_sem_respaldo: [],
      },
    });
    expect(describeDeadline(facts.deadline)).toContain("Atenção: A IA indica 15/12/2026");
  });

  it("ausentes de análise antiga são conciliados com a própria base", () => {
    const facts = resolveAnalysisFacts({ base: baseDoc });
    expect(facts.missing.map((m) => m.label)).toEqual(["áreas", "critérios de avaliação"]);
  });

  it("checklist mostra origem, trecho e o que não foi confirmado", () => {
    const items = buildChecklistItems({
      checklist: { items: [
        { doc: "Comprovante de matrícula", origem: "edital", evidencia: "Documentos: comprovante de matrícula", condicao: "listado", nao_confirmado: ["foto"], conferir: true, motivo: "O edital não menciona: foto." },
        { doc: "RG e CPF", origem: "desconhecido", evidencia: null, condicao: "nao_informado", nao_confirmado: [], conferir: true, motivo: null },
      ] },
    }, null);
    expect(items[0]).toMatchObject({ origin: "edital", evidence: "Documentos: comprovante de matrícula", unconfirmed: ["foto"], check: true });
    expect(items[1]).toMatchObject({ origin: "desconhecido", check: true });
    expect(items[1].hint).toMatch(/Não localizado no texto do edital/);
  });
});
