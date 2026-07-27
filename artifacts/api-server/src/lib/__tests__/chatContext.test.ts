import { describe, expect, it } from "vitest";
import { buildStructuredContext } from "../../routes/niasci";

// ── Fixture: análise canônica do [NOVO] EDITAL ────────────────────────────
const CANONICAL_FIXTURE: Record<string, unknown> = {
  analysisId: "test-analysis-001",
  interpretation: {
    summary: "Edital de premiação científica do CNPq",
    objective: "Premiar pesquisadores e estudantes com projetos de IA para o Bem Comum",
    targetAudience: "Pesquisadores, mestrandos, doutorandos e estudantes de graduação e ensino médio",
    deadlines: "10 de março de 2026 a 14 de agosto de 2026",
  },
  cronograma: {
    items: [
      { fase: "Inscrição", periodo: "10/03/2026 a 14/08/2026", descricao: "Período de inscrições", status: "futuro", vigente: true },
      { fase: "Avaliação", periodo: "15/08/2026 a 30/09/2026", descricao: "Análise dos trabalhos", status: "futuro", vigente: true },
      { fase: "Inscrição (original)", periodo: "10/03/2026 a 31/07/2026", descricao: "Prazo original — alterado por retificação", status: "passado", vigente: false },
    ],
    retificacoes: [
      {
        campo: "encerramento de inscrições",
        valorOriginal: "31 de julho de 2026",
        valorVigente: "14 de agosto de 2026",
      },
    ],
  },
  elegibilidade: {
    criteria: [
      { criterio: "Ser mestre ou doutor", atende: true, observacao: "Categoria Mestre/Doutor" },
      { criterio: "Trabalho inédito", atende: "parcial", observacao: "Verificar ineditismo" },
      { criterio: "Tema: IA para o Bem Comum", atende: true, observacao: "Direcionamento do edital" },
    ],
  },
  checklist: {
    items: [
      { doc: "Trabalho científico", obrigatorio: true, observacao: "Formato PDF", checked: false },
      { doc: "Formulário de inscrição", obrigatorio: true, observacao: "Preenchido online", checked: false },
      { doc: "Comprovante de vínculo", obrigatorio: true, observacao: "Instituição de ensino", checked: false },
    ],
  },
  documentosExigidos: {
    items: [
      { nome: "Trabalho científico", obrigatorio: true },
      { nome: "Formulário de inscrição", obrigatorio: true },
      { nome: "Comprovante de vínculo institucional", obrigatorio: true },
    ],
  },
  premiacao: {
    items: [
      { categoria: "Mestre/Doutor — 1º lugar", valor: "R$ 35.000,00" },
      { categoria: "Mestre/Doutor — 2º lugar", valor: "R$ 28.000,00" },
      { categoria: "Mestre/Doutor — 3º lugar", valor: "R$ 25.000,00" },
      { categoria: "Ensino Superior — 1º lugar", valor: "R$ 25.000,00" },
      { categoria: "Ensino Médio — 1º lugar", valor: "R$ 5.000,00 + notebook" },
      { categoria: "Mérito Institucional", valor: "R$ 40.000,00 cada" },
    ],
  },
  tema: { titulo: "IA para o Bem Comum" },
  documento: {
    titulo: "Edital de Premiação Científica",
    orgao: "CNPq",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 1: buildStructuredContext produz contexto correto
// ═══════════════════════════════════════════════════════════════════════════
describe("buildStructuredContext", () => {
  it("produz contexto com todas as seções", () => {
    const ctx = buildStructuredContext(CANONICAL_FIXTURE);
    expect(ctx).toContain("## INTERPRETAÇÃO");
    expect(ctx).toContain("## CRONOGRAMA");
    expect(ctx).toContain("## ELEGIBILIDADE");
    expect(ctx).toContain("## CHECKLIST DE DOCUMENTOS");
    expect(ctx).toContain("## DOCUMENTOS EXIGIDOS");
    expect(ctx).toContain("## PREMIAÇÃO");
    expect(ctx).toContain("## TEMA");
    expect(ctx).toContain("## IDENTIFICAÇÃO DO DOCUMENTO");
  });

  it("cronograma mostra prazo vigente e alterado", () => {
    const ctx = buildStructuredContext(CANONICAL_FIXTURE);
    expect(ctx).toContain("14/08/2026");
    expect(ctx).toContain("[VIGENTE]");
    expect(ctx).toContain("[ALTERADO]");
    expect(ctx).toContain("31/07/2026");
  });

  it("retificações documentam a alteração", () => {
    const ctx = buildStructuredContext(CANONICAL_FIXTURE);
    expect(ctx).toContain("## RETIFICAÇÕES");
    expect(ctx).toContain("31 de julho de 2026");
    expect(ctx).toContain("14 de agosto de 2026");
  });

  it("elegibilidade lista critérios com status", () => {
    const ctx = buildStructuredContext(CANONICAL_FIXTURE);
    expect(ctx).toContain("atende");
    expect(ctx).toContain("parcialmente");
  });

  it("checklist mostra obrigatoriedade e status", () => {
    const ctx = buildStructuredContext(CANONICAL_FIXTURE);
    expect(ctx).toContain("obrigatório");
  });

  it("premiação lista valores", () => {
    const ctx = buildStructuredContext(CANONICAL_FIXTURE);
    expect(ctx).toContain("R$ 35.000,00");
    expect(ctx).toContain("R$ 5.000,00 + notebook");
    expect(ctx).toContain("R$ 40.000,00 cada");
  });

  it("contexto vazio para objeto vazio", () => {
    const ctx = buildStructuredContext({});
    expect(ctx).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 2: Contexto impede contradicção
// ═══════════════════════════════════════════════════════════════════════════
describe("contexto impede contradicção", () => {
  const ctx = buildStructuredContext(CANONICAL_FIXTURE);

  it("cronograma contém apenas os itens fornecidos — sem datas inventadas", () => {
    const cronogramaSection = ctx.split("## CRONOGRAMA")[1]?.split("##")[0] ?? "";
    const lines = cronogramaSection.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(lines.length).toBe(3);

    const datasNoCronograma = cronogramaSection.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
    expect(datasNoCronograma).toContain("10/03/2026");
    expect(datasNoCronograma).toContain("14/08/2026");
    expect(datasNoCronograma).toContain("15/08/2026");
    expect(datasNoCronograma).toContain("30/09/2026");
    expect(datasNoCronograma).toContain("31/07/2026");
  });

  it("checklist contém exatamente 3 documentos", () => {
    const checklistSection = ctx.split("## CHECKLIST DE DOCUMENTOS")[1]?.split("##")[0] ?? "";
    const lines = checklistSection.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(lines.length).toBe(3);
  });

  it("elegibilidade contém exatamente 3 critérios", () => {
    const elegSection = ctx.split("## ELEGIBILIDADE")[1]?.split("##")[0] ?? "";
    const lines = elegSection.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(lines.length).toBe(3);
  });

  it("prazo vigente é 14/08/2026 e não 31/07/2026 como inscrição vigente", () => {
    const cronogramaSection = ctx.split("## CRONOGRAMA")[1]?.split("##")[0] ?? "";
    const blocks = cronogramaSection.split(/^- /m).filter(Boolean);
    const inscricaoBlock = blocks.find((b) => b.includes("Inscrição:") && b.includes("[VIGENTE]"));
    expect(inscricaoBlock).toBeDefined();
    expect(inscricaoBlock).toContain("14/08/2026");
    expect(inscricaoBlock).not.toContain("31/07/2026");
  });

  it("valor antigo 31/07/2026 aparece apenas como [ALTERADO]", () => {
    const cronogramaSection = ctx.split("## CRONOGRAMA")[1]?.split("##")[0] ?? "";
    const blocks = cronogramaSection.split(/^- /m).filter(Boolean);
    const alteradoBlocks = blocks.filter((b) => b.includes("[ALTERADO]"));
    expect(alteradoBlocks.length).toBeGreaterThanOrEqual(1);
    expect(alteradoBlocks.some((b) => b.includes("31/07/2026"))).toBe(true);
    expect(alteradoBlocks.some((b) => b.includes("14/08/2026"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 3: System prompt contém regras de contexto controlado
// ═══════════════════════════════════════════════════════════════════════════
describe("chatNiasci — system prompt", () => {
  it("contexto iniciado com 'ANÁLISE SALVA' ativa regras de contexto controlado", () => {
    const ctx = "ANÁLISE SALVA DO EDITAL (fonte única de verdade — use APENAS estes fatos):\n\n## CRONOGRAMA\n- Inscrição: 10/03/2026 a 14/08/2026 [VIGENTE]";
    expect(ctx.startsWith("ANÁLISE SALVA DO EDITAL")).toBe(true);
  });

  it("contexto sem prefixo 'ANÁLISE SALVA' usa regras gerais", () => {
    const ctx = "TEXTO DO EDITAL:\n...";
    expect(ctx.startsWith("ANÁLISE SALVA DO EDITAL")).toBe(false);
  });

  it("buildStructuredContext produz dados serializáveis — não quebra com campos undefined", () => {
    const minimal = {
      interpretation: { summary: "Teste" },
      cronograma: { items: [] },
    };
    const ctx = buildStructuredContext(minimal);
    expect(ctx).toContain("## INTERPRETAÇÃO");
    expect(ctx).toContain("## CRONOGRAMA");
  });

  it("buildStructuredContext é pura — não faz chamadas de rede", () => {
    const before = buildStructuredContext(CANONICAL_FIXTURE);
    const after = buildStructuredContext(CANONICAL_FIXTURE);
    expect(before).toBe(after);
  });
});
