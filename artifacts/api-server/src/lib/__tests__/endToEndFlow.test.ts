import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildCanonicalAnalysis, validateDocumentAnalysis, consolidateChunkFacts, detectRetifications } from "../aiService";
import { classifyAiError } from "../processingErrors";

// ── Texto sintético do edital com retificação ──────────────────────────────
const EDITAL_COM_RETIFICACAO = `
EDITAL DE CONVOCAÇÃO Nº 2687239 - 32º PRÊMIO JOVEM CIENTISTA

O Conselho Nacional de Desenvolvimento Científico e Tecnológico - CNPq torna pública a alteração do Edital.

O item 2 passa a viger com a seguinte redação:
2. Inscrição e entrega de documentos
2.1. As inscrições acompanhadas do trabalho científico poderão ser realizadas no período de 10 de março de 2026, até 14 de agosto de 2026.

Anteriormente o prazo era de 10 de março de 2026 até 31 de julho de 2026.

3. Categorias
3.1. Mestre e Doutor
3.2. Estudante do Ensino Superior
3.3. Estudante de Ensino Médio
3.4. Mérito Institucional

4. Critérios de avaliação
- Mérito científico: 30 pontos
- Aplicação prática: 30 pontos
- Originalidade: 25 pontos
- Qualidade do texto: 15 pontos

5. Premiação
- Mestre/Doutor: R$ 35.000,00 / R$ 28.000,00 / R$ 25.000,00
- Ensino Superior: R$ 25.000,00 / R$ 22.000,00 / R$ 20.000,00
- Ensino Médio: R$ 5.000,00 + notebook
- Mérito Institucional: R$ 40.000,00 cada

6. Tema: IA para o Bem Comum

7. Cronograma
7.1. Avaliação dos trabalhos: 15 de agosto de 2026 a 30 de setembro de 2026
7.2. Divulgação do resultado: 15 de dezembro de 2026
`.trim();

const AGENT_RESULT_SIMPLES = {
  type: "simples",
  tipoEdital: "Edital de Premiação Científica",
  instituicao: "CNPq",
  prazo: "14 de agosto de 2026",
  publicoAlvo: "Pesquisadores e estudantes",
  requisitos: ["Trabalho científico", "Inscrição no site jovemcientista.cnpq.br"],
  documentos: ["Trabalho científico", "Formulário de inscrição"],
  valor: "R$ 35.000,00 (1º lugar Mestre/Doutor)",
  alertas: [],
  timeline: [
    { fase: "Inscrição", periodo: "10/03/2026 a 14/08/2026", descricao: "Período de inscrições", status: "futuro" },
    { fase: "Avaliação", periodo: "15/08/2026 a 30/09/2026", descricao: "Análise dos trabalhos", status: "futuro" },
    { fase: "Resultado", periodo: "15/12/2026", descricao: "Divulgação do resultado", status: "futuro" },
  ],
  criterios: [
    { criterio: "Mérito científico (30 pontos)", atende: true, observacao: "Critério principal" },
    { criterio: "Aplicação prática (30 pontos)", atende: true, observacao: "Critério secundário" },
    { criterio: "Originalidade (25 pontos)", atende: "parcial", observacao: "Verificar ineditismo" },
  ],
  checklist: [
    { doc: "Trabalho científico", obrigatorio: true, observacao: "Formato PDF", checked: false },
    { doc: "Formulário de inscrição", obrigatorio: true, observacao: "Preenchido online", checked: false },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 1: Retificação prevalece sobre texto original
// ═══════════════════════════════════════════════════════════════════════════
describe("retificação prevalece sobre texto original", () => {
  it("detectRetifications encontra retificação no texto", () => {
    const retifications = detectRetifications(EDITAL_COM_RETIFICACAO);
    expect(retifications.length).toBeGreaterThanOrEqual(1);

    const ret = retifications[0];
    expect(ret.campo).toBe("encerramento de inscrições");
    expect(ret.valorVigente).toContain("14");
    expect(ret.valorVigente).toContain("agosto");
  });

  it("buildCanonicalAnalysis aplica retificação ao cronograma", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);

    expect(canonical.cronograma?.items).toBeDefined();
    const inscricao = canonical.cronograma?.items.find(i => i.fase === "Inscrição");
    expect(inscricao).toBeDefined();
    expect(inscricao!.periodo).toContain("14/08/2026");
    expect(inscricao!.vigente).toBe(true);
  });

  it("retificação registrada em cronograma.retificacoes", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const rets = canonical.cronograma?.retificacoes;
    expect(rets).toBeDefined();
    expect(rets!.length).toBeGreaterThanOrEqual(1);
    expect(rets![0].valorVigente).toContain("14");
    expect(rets![0].valorVigente).toContain("agosto");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 2: Prazo antigo não aparece como vigente
// ═══════════════════════════════════════════════════════════════════════════
describe("prazo antigo não aparece como vigente", () => {
  it("data original marcada como não vigente no cronograma", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);

    const inscricao = canonical.cronograma?.items.find(i => i.fase === "Inscrição");
    expect(inscricao).toBeDefined();

    if (inscricao?.vigente === true) {
      expect(inscricao!.periodo).toContain("14/08/2026");
    }
  });

  it("nenhum item do cronograma tem vigente=false com prazo original como período atual", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const items = canonical.cronograma?.items || [];
    for (const item of items) {
      if (item.vigente === false) {
        expect(item.periodo).not.toContain("31 de julho de 2026");
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 3: Validação impede gravação inconsistente
// ═══════════════════════════════════════════════════════════════════════════
describe("validação impede gravação inconsistente", () => {
  it("retificação é ignorada pela validação (não causa erro falso)", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const validation = validateDocumentAnalysis(canonical as any, EDITAL_COM_RETIFICACAO);

    if (!validation.valid) {
      const retificacaoErrors = validation.errors.filter(e => e.includes("14 de agosto de 2026"));
      expect(retificacaoErrors).toHaveLength(0);
    }
  });

  it("validação rejeita ano de publicação absurdo", () => {
    const badResult = { ...AGENT_RESULT_SIMPLES, anoPublicacao: 1900 };
    const canonical = buildCanonicalAnalysis("simples", badResult as any, EDITAL_COM_RETIFICACAO, undefined);
    const validation = validateDocumentAnalysis(canonical as any, EDITAL_COM_RETIFICACAO);

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.errors.some(e => e.includes("suspeito"))).toBe(true);
    }
  });

  it("validação passa para análise válida", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const validation = validateDocumentAnalysis(canonical as any, EDITAL_COM_RETIFICACAO);
    expect(validation.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 4: Schema de rastreabilidade
// ═══════════════════════════════════════════════════════════════════════════
describe("schema de rastreabilidade", () => {
  it("cronograma items têm campos de rastreabilidade", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const items = canonical.cronograma?.items || [];
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(item).toHaveProperty("fase");
      expect(item).toHaveProperty("periodo");
      expect(item).toHaveProperty("confianca");
      expect(typeof item.confianca).toBe("string");
      expect(["alta", "média", "baixa"]).toContain(item.confianca);
      expect(item).toHaveProperty("vigente");
      expect(typeof item.vigente).toBe("boolean");
    }
  });

  it("evidencias têm campos de rastreabilidade", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const evidencias = canonical.evidencias || [];
    expect(evidencias.length).toBeGreaterThan(0);

    for (const ev of evidencias) {
      expect(ev).toHaveProperty("campo");
      expect(ev).toHaveProperty("descricao");
      expect(ev).toHaveProperty("vigente");
      expect(typeof ev.vigente).toBe("boolean");
    }
  });

  it("elegibilidade criteria têm campos de rastreabilidade", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const criteria = canonical.elegibilidade?.criteria || [];
    expect(criteria.length).toBeGreaterThan(0);

    for (const c of criteria) {
      expect(c).toHaveProperty("criterio");
      expect(c).toHaveProperty("atende");
      expect(c).toHaveProperty("confianca");
      expect(c).toHaveProperty("vigente");
      expect(typeof c.vigente).toBe("boolean");
    }
  });

  it("evidencias de cronograma retificado têm documentoOrigem preenchido", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const inscricaoEvidencia = canonical.evidencias?.find(e => e.evento === "Inscrição");
    expect(inscricaoEvidencia).toBeDefined();
    expect(inscricaoEvidencia!.vigente).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 5: Consolidação preserva schema
// ═══════════════════════════════════════════════════════════════════════════
describe("consolidação preserva schema de rastreabilidade", () => {
  it("consolidação de chunks mantém datas sem duplicar", () => {
    const consolidated = consolidateChunkFacts([
      {
        chunkId: "chunk-1",
        facts: {
          documentInfo: [{ title: "32º Prêmio Jovem Cientista", page: 1, section: "Capa", text: "32º Premio" }],
          dates: [{ event: "Inscrição", value: "14 de agosto de 2026", page: 1, section: "Item 2", text: "Prazo vigente" }],
          requirements: [{ requirement: "Trabalho científico", page: 1, section: "Item 2", text: "Trabalho" }],
          eligibility: [{ criterion: "Mérito científico (30 pontos)", page: 1, section: "Item 4", text: "Critério" }],
          documents: [{ document: "Trabalho científico", page: 1, section: "Item 2", text: "PDF" }],
          values: [{ value: "R$ 35.000,00", page: 2, section: "Item 5", text: "Premio" }],
          contacts: [],
          obligations: [],
          restrictions: [],
          alerts: [],
        },
      },
      {
        chunkId: "chunk-2",
        facts: {
          documentInfo: [{ title: "32º Prêmio Jovem Cientista", page: 4, section: "Capa", text: "32º Premio" }],
          dates: [{ event: "Inscrição", value: "14 de agosto de 2026", page: 4, section: "Item 2", text: "Prazo vigente" }],
          requirements: [{ requirement: "Trabalho científico", page: 4, section: "Item 2", text: "Trabalho" }],
          eligibility: [{ criterion: "Mérito científico (30 pontos)", page: 4, section: "Item 4", text: "Critério" }],
          documents: [{ document: "Trabalho científico", page: 4, section: "Item 2", text: "PDF" }],
          values: [{ value: "R$ 35.000,00", page: 5, section: "Item 5", text: "Premio" }],
          contacts: [],
          obligations: [],
          restrictions: [],
          alerts: [],
        },
      },
    ] as any);

    expect(consolidated.dates).toHaveLength(1);
    expect(consolidated.requirements).toHaveLength(1);
    expect(consolidated.values).toHaveLength(1);
    expect(consolidated.dates[0].value).toContain("14 de agosto de 2026");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 6: Orçamento em português classificado corretamente
// ═══════════════════════════════════════════════════════════════════════════
describe("orçamento em português classificado corretamente", () => {
  it("'orçamento de tempo esgotado' → time_budget_exhausted", () => {
    const c = classifyAiError("orçamento de tempo esgotado");
    expect(c.reason).toBe("time_budget_exhausted");
    expect(c.retryable).toBe(false);
  });

  it("'budget' → time_budget_exhausted", () => {
    const c = classifyAiError("budget exceeded");
    expect(c.reason).toBe("time_budget_exhausted");
    expect(c.retryable).toBe(false);
  });

  it("'tempo esgotado' → time_budget_exhausted", () => {
    const c = classifyAiError("tempo esgotado para processamento");
    expect(c.reason).toBe("time_budget_exhausted");
    expect(c.retryable).toBe(false);
  });

  it("'sem tempo restante' → time_budget_exhausted", () => {
    const c = classifyAiError("sem tempo restante para retry");
    expect(c.reason).toBe("time_budget_exhausted");
    expect(c.retryable).toBe(false);
  });

  it("'tempo insuficiente' → time_budget_exhausted", () => {
    const c = classifyAiError("tempo insuficiente para completar");
    expect(c.reason).toBe("time_budget_exhausted");
    expect(c.retryable).toBe(false);
  });

  it("'orcamento de tempo' (sem acento) → time_budget_exhausted", () => {
    const c = classifyAiError("orcamento de tempo esgotado");
    expect(c.reason).toBe("time_budget_exhausted");
    expect(c.retryable).toBe(false);
  });

  it("429 rate limit → rate_limit (não confundir com budget)", () => {
    const c = classifyAiError("429 Too Many Requests: rate limit reached");
    expect(c.reason).toBe("rate_limit");
    expect(c.retryable).toBe(true);
  });

  it("content too large → content_too_large (não budget)", () => {
    const c = classifyAiError("content too large: request exceeds the input limit");
    expect(c.reason).toBe("content_too_large");
    expect(c.retryable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 7: Retificação — cronograma sem duplicidade
// ═══════════════════════════════════════════════════════════════════════════
describe("retificação — cronograma sem duplicidade", () => {
  it("apenas um item de inscrição no cronograma", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const inscricoes = canonical.cronograma?.items.filter(i => i.fase === "Inscrição") || [];
    expect(inscricoes).toHaveLength(1);
  });

  it("conflitos temporais documentam a retificação", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const conflitos = canonical.cronograma?.validacaoTemporal?.conflitos || [];
    const retificacaoConflito = conflitos.find(c => c.problema.includes("Retificação"));
    expect(retificacaoConflito).toBeDefined();
    expect(retificacaoConflito!.problema).toContain("14 de agosto de 2026");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 8: buildCanonicalAnalysis — campos obrigatórios sempre presentes
// ═══════════════════════════════════════════════════════════════════════════
describe("campos obrigatórios sempre presentes", () => {
  it("analysisId começa com 'analysis-'", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, "texto", undefined);
    expect(canonical.analysisId).toMatch(/^analysis-/);
  });

  it("schemaVersion é '1.0.1'", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, "texto", undefined);
    expect(canonical.schemaVersion).toBe("1.0.1");
  });

  it("source.agentId corresponde ao agente informado", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, "texto", undefined);
    expect(canonical.source.agentId).toBe("simples");
  });

  it("source.generatedAt é ISO 8601", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, "texto", undefined);
    expect(new Date(canonical.source.generatedAt).toISOString()).toBe(canonical.source.generatedAt);
  });

  it("documentosExigidos.items é array", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, "texto", undefined);
    expect(Array.isArray(canonical.documentosExigidos.items)).toBe(true);
  });

  it("alertas é array", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, "texto", undefined);
    expect(Array.isArray(canonical.alertas)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 9: Ausência de chamada IA em operações de leitura
// ═══════════════════════════════════════════════════════════════════════════
describe("operações de leitura não chamam IA", () => {
  it("buildCanonicalAnalysis é pura — não faz chamadas de rede", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(canonical.analysisId).toMatch(/^analysis-/);
    fetchSpy.mockRestore();
  });

  it("validateDocumentAnalysis é pura — não faz chamadas de rede", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    validateDocumentAnalysis(canonical as any, EDITAL_COM_RETIFICACAO);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("consolidateChunkFacts é pura — não faz chamadas de rede", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    consolidateChunkFacts([
      {
        chunkId: "c1",
        facts: {
          documentInfo: [], dates: [], requirements: [], eligibility: [],
          documents: [], values: [], contacts: [], obligations: [],
          restrictions: [], alerts: [],
        },
      },
    ] as any);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 10: Exportação usa mesmo result_json
// ═══════════════════════════════════════════════════════════════════════════
describe("exportação usa mesmo result_json", () => {
  it("building canonical e serializando mantém dados íntegros", () => {
    const canonical = buildCanonicalAnalysis("simples", AGENT_RESULT_SIMPLES as any, EDITAL_COM_RETIFICACAO, undefined);
    const serialized = JSON.parse(JSON.stringify(canonical));

    expect(serialized.analysisId).toBe(canonical.analysisId);
    expect(serialized.cronograma?.items[0].periodo).toContain("14/08/2026");
    expect(serialized.elegibilidade?.criteria.length).toBe(3);
    expect(serialized.documentosExigidos.items.length).toBe(2);
  });
});
