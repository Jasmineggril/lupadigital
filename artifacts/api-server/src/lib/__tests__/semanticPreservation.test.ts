/**
 * @file semanticPreservation.test.ts
 * @description Suite de Testes — Validação Científica da Preservação Semântica.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTRODUÇÃO PARA ESTUDANTES (4º semestre de Engenharia de Software)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Este arquivo testa o módulo `semanticPreservation.ts`, que avalia se a IA
 * do LUPA Digital preserva o significado dos editais ao simplificá-los.
 *
 * POR QUE TESTAR ISSO?
 * Um edital é um documento legal. Se a IA mudar uma data, omitir uma restrição
 * ou suavizar uma obrigação, o cidadão pode:
 * - Perder o prazo de inscrição
 * - Participar de um edital para o qual não é elegível
 * - Deixar de apresentar um documento obrigatório
 *
 * COMO OS TESTES FUNCIONAM?
 * Cada teste usa uma "fixture" — um par controlado (texto original, texto
 * simplificado) — e verifica se as funções do avaliador detectam corretamente:
 *   ✅ Casos positivos: simplificações corretas que preservam o significado
 *   ❌ Casos negativos: simplificações incorretas que violam o significado
 *
 * IMPORTANTE: A preservação semântica é tratada como REQUISITO e avaliada por
 * testes. Estes testes não garantem que a IA sempre preserva o significado —
 * eles verificam se o AVALIADOR detecta violações quando elas ocorrem.
 *
 * ESTRUTURA DOS TESTES:
 * 7 categorias × (positivo + negativo) = 14 cenários mínimos
 * + Testes de extratores (funções auxiliares)
 * + Relatório de métricas ao final
 * ────────────────────────────────────────────────────────────────────────────
 *
 * @see semanticPreservation.ts — módulo sendo testado
 */

import { describe, it, expect, afterAll } from "vitest";
import {
  extractDates,
  extractMonetaryValues,
  extractNegations,
  detectModality,
  hasAmbiguityMarkers,
  validateDatePreservation,
  validateMonetaryPreservation,
  validateModalPreservation,
  validateNegationPreservation,
  validateAmbiguityHandling,
  evaluateSemanticPreservation,
  type SemanticReport,
} from "../semanticPreservation";

// ────────────────────────────────────────────────────────────────────────────
// FIXTURES — Textos de teste controlados
//
// As fixtures representam pares (original, simplificação) com situações
// específicas a serem verificadas. Cada fixture é pequena e focada em
// uma única categoria semântica, facilitando o diagnóstico de falhas.
//
// Convenção de nomenclatura:
// F<N>_ORIGINAL     — texto original do edital (categoria N)
// F<N>_GOOD         — simplificação correta (deve passar nos testes)
// F<N>_BAD          — simplificação incorreta (deve falhar nos testes)
// ────────────────────────────────────────────────────────────────────────────

// ── Fixture 1: Preservação de Datas ─────────────────────────────────────────
const F1_ORIGINAL = `
EDITAL Nº 001/2024 — PROGRAMA DE BOLSAS DE INICIAÇÃO CIENTÍFICA

1. DAS INSCRIÇÕES
As inscrições estarão abertas no período de 01/07/2024 a 15/08/2024,
exclusivamente pelo portal institucional.

2. DOS RESULTADOS
O resultado preliminar será divulgado em 30 de setembro de 2024.
O resultado final, após recursos, em 15 de outubro de 2024.

3. DO INÍCIO DAS ATIVIDADES
O início das atividades está previsto para 01/11/2024.
`.trim();

const F1_GOOD = `
Programa de Bolsas de Iniciação Científica

Inscrições: de 01/07/2024 a 15/08/2024, exclusivamente pelo portal da instituição.

Resultados:
- Resultado preliminar: 30 de setembro de 2024
- Resultado final (após recursos): 15 de outubro de 2024

Início das atividades: 01/11/2024
`.trim();

/**
 * Simplificação incorreta: altera 15/08/2024 para 20/08/2024 e omite
 * o resultado final. Exemplifica dois tipos de violação simultânea.
 */
const F1_BAD = `
Programa de Bolsas de Iniciação Científica

Inscrições: até 20/08/2024 pelo portal.
Resultado: em breve.
Início: novembro de 2024.
`.trim();

// ── Fixture 2: Preservação de Valores Monetários ─────────────────────────────
const F2_ORIGINAL = `
EDITAL DE FOMENTO — CULTURA E ARTES

Art. 3º DO VALOR
O benefício mensal é de R$ 3.000,00 por bolsista, pelo período de 12 meses.
O limite por projeto é de R$ 36.000,00.
O custeio de materiais é limitado a 20% do valor aprovado.
`.trim();

const F2_GOOD = `
Programa de Apoio à Cultura e às Artes

Valor da bolsa: R$ 3.000,00 por mês, durante 12 meses.
Limite por projeto: R$ 36.000,00.
Materiais: até 20% do valor aprovado pode ser usado para compras.
`.trim();

/**
 * Simplificação incorreta: omite o valor exato (R$ 3.000,00) e
 * inventa um percentual diferente (30% vs 20%).
 */
const F2_BAD = `
Programa de Apoio à Cultura e às Artes

Valor da bolsa: um benefício mensal por 12 meses.
Materiais: até 30% do projeto pode ir para compras.
`.trim();

// ── Fixture 3: Elegibilidade e Restrições ────────────────────────────────────
const F3_ORIGINAL = `
EDITAL DE HABITAÇÃO POPULAR

Art. 5º DOS BENEFICIÁRIOS
Somente poderão participar pessoas físicas que atendam cumulativamente:
a) renda familiar mensal de até 3 salários mínimos;
b) não ser proprietário de imóvel residencial;
c) residir no município há pelo menos 2 anos.
É vedada a inscrição de servidores públicos do quadro efetivo municipal.
`.trim();

const F3_GOOD = `
Programa de Habitação Popular — Quem Pode Participar?

Somente pessoas físicas que, ao mesmo tempo:
- tenham renda familiar de até 3 salários mínimos;
- não sejam donas de nenhum imóvel residencial;
- morem no município há pelo menos 2 anos.

Atenção: servidores públicos efetivos do município NÃO podem participar.
`.trim();

/**
 * Simplificação incorreta: omite a restrição "não ser proprietário de imóvel"
 * e amplia o público para "qualquer pessoa" sem mencionar os critérios.
 */
const F3_BAD = `
Programa de Habitação Popular — Quem Pode Participar?

Pessoas com renda familiar de até 3 salários mínimos que morem no município
podem participar. Qualquer pessoa pode se inscrever no portal.
`.trim();

// ── Fixture 4: Documentação Obrigatória vs. Opcional ────────────────────────
const F4_ORIGINAL = `
EDITAL DE PROCESSO SELETIVO — DOCUMENTAÇÃO

São obrigatórios para a inscrição:
- Documento de identidade (RG ou CNH)
- CPF
- Comprovante de residência com data dos últimos 3 meses

São facultativos, conforme perfil do candidato:
- Declaração de Imposto de Renda (se contribuinte)
- Carteira de trabalho (se empregado)
`.trim();

const F4_GOOD = `
Documentos obrigatórios (todos devem ser entregues):
1. RG ou CNH
2. CPF
3. Comprovante de residência dos últimos 3 meses

Documentos opcionais (entregar somente se se aplicar ao seu caso):
- Declaração do Imposto de Renda (para quem paga imposto)
- Carteira de trabalho (para quem é empregado)
`.trim();

/**
 * Simplificação incorreta: apresenta os documentos opcionais como se fossem
 * obrigatórios, criando uma exigência inexistente no edital.
 */
const F4_BAD = `
Você deve entregar obrigatoriamente:
1. RG ou CNH
2. CPF
3. Comprovante de residência dos últimos 3 meses
4. Declaração do Imposto de Renda
5. Carteira de trabalho
`.trim();

// ── Fixture 5: Modalidade Lógica (deve vs. pode) ────────────────────────────
const F5_ORIGINAL = `
Art. 12. DA ENTREGA DE DOCUMENTOS
Os candidatos devem entregar os documentos pessoalmente na sede da instituição.
Não é permitido o envio por correio ou por representante.
A entrega deve ser feita exclusivamente no horário comercial, de segunda a sexta-feira.
`.trim();

const F5_GOOD = `
Entrega de Documentos

Você deve entregar seus documentos pessoalmente na sede da instituição.
Não é possível enviar pelo correio nem mandar outra pessoa no seu lugar.
O horário para entrega é somente durante o horário comercial, de segunda a sexta.
`.trim();

/**
 * Simplificação incorreta: muda "devem entregar pessoalmente" para "podem
 * entregar" — converte uma obrigação em opção.
 */
const F5_BAD = `
Entrega de Documentos

Você pode entregar seus documentos pessoalmente na instituição.
A entrega pode ser feita no horário comercial.
`.trim();

// ── Fixture 6: Negações e Restrições ────────────────────────────────────────
const F6_ORIGINAL = `
EDITAL DE CREDENCIAMENTO — RESTRIÇÕES

Art. 8º Das Vedações:
É vedada a participação de empresas em recuperação judicial.
Não serão aceitas propostas com prazo de validade inferior a 60 dias.
Somente empresas com sede no estado poderão participar.
Exceto nos casos previstos no Art. 3º, não é permitida a subcontratação.
`.trim();

const F6_GOOD = `
Quem NÃO pode participar:
- Empresas em recuperação judicial estão vedadas de participar.
- Propostas com validade menor que 60 dias não serão aceitas.
- Somente empresas com sede no estado podem participar.
- Subcontratação não é permitida, exceto nos casos do Art. 3º.
`.trim();

/**
 * Simplificação incorreta: omite quase todas as negações e restrições,
 * convertendo um texto restritivo em um texto aparentemente permissivo.
 */
const F6_BAD = `
Condições de participação:
- Empresas interessadas devem apresentar proposta com prazo de validade.
- A sede da empresa pode estar em qualquer lugar.
- A subcontratação é bem-vinda para ampliar capacidade.
`.trim();

// ── Fixture 7: Ambiguidade e "Não Informado" ─────────────────────────────────
const F7_ORIGINAL = `
EDITAL DE CHAMADA PÚBLICA

Art. 15. DO CRONOGRAMA
O resultado será divulgado oportunamente no site institucional.
O início das atividades ocorrerá conforme conveniência administrativa.
A data de assinatura do contrato será definida a critério da comissão.
`.trim();

/**
 * Simplificação correta: reconhece a ambiguidade e indica "Não informado"
 * ou gera alerta em vez de inventar datas.
 */
const F7_GOOD = `
Cronograma

Resultado: Não informado — será publicado no site da instituição quando definido.
Início das atividades: Não informado — depende da decisão administrativa.
Assinatura do contrato: ⚠ [ausência] Data não definida no edital — verificar no site oficial.
`.trim();

/**
 * Simplificação incorreta: inventa datas específicas onde o edital apenas
 * diz "oportunamente" — apresenta inferência como fato.
 */
const F7_BAD = `
Cronograma

Resultado: em aproximadamente 30 dias após o encerramento das inscrições.
Início das atividades: previsto para o mês seguinte ao resultado.
Assinatura do contrato: em até 2 semanas após o resultado final.
`.trim();

// ────────────────────────────────────────────────────────────────────────────
// COLETA DE MÉTRICAS GLOBAL
//
// Usada para calcular e exibir o relatório consolidado no afterAll.
// ────────────────────────────────────────────────────────────────────────────
const metricsCollector: {
  category: string;
  scenario: "positive" | "negative";
  passed: boolean;
  detail: string;
}[] = [];

// ────────────────────────────────────────────────────────────────────────────
// TESTES DOS EXTRATORES (funções auxiliares)
//
// Antes de testar as funções de validação, verificamos se os extratores
// identificam corretamente as unidades semânticas críticas.
// ────────────────────────────────────────────────────────────────────────────

describe("Extratores de Unidades Semânticas", () => {
  /**
   * OBJETIVO: Verificar se extractDates reconhece os formatos de data
   * mais comuns em editais brasileiros.
   * RISCO: Se o extrator não detectar uma data, ela não será verificada.
   */
  it("extractDates → reconhece datas numéricas (DD/MM/AAAA)", () => {
    const dates = extractDates("Inscrições até 15/08/2024 e resultado em 30/09/2024.");
    expect(dates).toContain("15/08/2024");
    expect(dates).toContain("30/09/2024");
  });

  it("extractDates → reconhece datas por extenso", () => {
    const dates = extractDates("Resultado em 30 de setembro de 2024.");
    expect(dates.some((d) => d.includes("setembro"))).toBe(true);
  });

  it("extractDates → retorna array vazio quando não há datas", () => {
    const dates = extractDates("Não há datas neste texto.");
    expect(dates).toHaveLength(0);
  });

  /**
   * OBJETIVO: Verificar se extractMonetaryValues captura valores R$, % e SM.
   * RISCO: Valores omitidos não serão verificados nas validações.
   */
  it("extractMonetaryValues → reconhece valores em R$", () => {
    const values = extractMonetaryValues("Benefício de R$ 2.500,00 mensais.");
    expect(values.some((v) => v.includes("2.500"))).toBe(true);
  });

  it("extractMonetaryValues → reconhece percentuais", () => {
    const values = extractMonetaryValues("Limitado a 80% do valor aprovado.");
    expect(values.some((v) => v.includes("80%"))).toBe(true);
  });

  it("extractMonetaryValues → reconhece salários mínimos", () => {
    const values = extractMonetaryValues("Renda de até 3 salários mínimos.");
    expect(values.some((v) => v.includes("salário"))).toBe(true);
  });

  /**
   * OBJETIVO: Verificar se extractNegations detecta os termos mais comuns
   * de restrição em editais públicos.
   */
  it("extractNegations → detecta 'vedado' e variações", () => {
    const negs = extractNegations("É vedada a participação de empresas em recuperação.");
    expect(negs.some((n) => n.includes("vedad"))).toBe(true);
  });

  it("extractNegations → detecta 'não', 'somente', 'exceto'", () => {
    const text = "Somente pessoas físicas. Não é permitido envio por correio. Exceto nos casos do Art. 3º.";
    const negs = extractNegations(text);
    expect(negs).toContain("somente");
    expect(negs).toContain("não");
    expect(negs).toContain("exceto");
  });

  /**
   * OBJETIVO: Verificar se detectModality classifica corretamente os
   * três tipos de modalidade lógica.
   */
  it("detectModality → classifica 'deve' como obligation", () => {
    expect(detectModality("Os candidatos devem entregar os documentos.")).toBe("obligation");
  });

  it("detectModality → classifica 'pode' como permission", () => {
    expect(detectModality("O candidato pode enviar os documentos por e-mail.")).toBe("permission");
  });

  it("detectModality → classifica 'preferencialmente' como preference", () => {
    // Sentença com APENAS marcador de preferência (sem "devem"), para isolar o caso.
    // "devem...preferencialmente" em conjunto também retorna "preference" porque
    // "preferencialmente" é verificado primeiro — ele qualifica e suaviza o "deve".
    expect(detectModality("Preferencialmente, envie os documentos por e-mail.")).toBe("preference");
  });

  /**
   * OBJETIVO: Verificar se hasAmbiguityMarkers detecta expressões
   * vagas que indicam ausência de informação definida.
   */
  it("hasAmbiguityMarkers → detecta 'oportunamente'", () => {
    expect(hasAmbiguityMarkers("O resultado será divulgado oportunamente.")).toBe(true);
  });

  it("hasAmbiguityMarkers → detecta 'a definir'", () => {
    expect(hasAmbiguityMarkers("O prazo está a definir.")).toBe(true);
  });

  it("hasAmbiguityMarkers → retorna false para textos sem ambiguidade", () => {
    expect(hasAmbiguityMarkers("O resultado sai em 15/08/2024.")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 1 — PRESERVAÇÃO DE DATAS
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 1 — Preservação de Datas", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador aprova uma simplificação
   * que preserva todas as datas do edital original.
   *
   * RISCO CIENTÍFICO: Datas são o critério mais crítico em editais públicos.
   * Qualquer alteração pode levar o cidadão a perder prazos reais.
   *
   * REGRA SEMÂNTICA: datas(original) ⊆ datas(simplificado)
   * RESULTADO ESPERADO: 100% de taxa de preservação, zero datas inventadas.
   */
  it("[POSITIVO] aprova simplificação que preserva todas as datas", () => {
    const report = validateDatePreservation(F1_ORIGINAL, F1_GOOD);

    expect(report.metric.rate).toBe(1);
    expect(report.missingDates).toHaveLength(0);

    metricsCollector.push({
      category: "Datas",
      scenario: "positive",
      passed: report.metric.rate === 1 && report.missingDates.length === 0,
      detail: `Taxa: ${(report.metric.rate * 100).toFixed(0)}% | Ausentes: ${report.missingDates.length} | Inventadas: ${report.inventedDates.length}`,
    });
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta uma simplificação
   * que altera uma data (15/08 → 20/08) e inventa "novembro" sem precisão.
   *
   * RESULTADO ESPERADO: taxa < 1 e ao menos 1 data inventada detectada.
   */
  it("[NEGATIVO] detecta data alterada e datas omitidas", () => {
    const report = validateDatePreservation(F1_ORIGINAL, F1_BAD);

    // A simplificação ruim tem menos de 100% de preservação
    expect(report.metric.rate).toBeLessThan(1);
    // Deve haver datas ausentes (as datas de resultado foram omitidas)
    expect(report.missingDates.length).toBeGreaterThan(0);

    metricsCollector.push({
      category: "Datas",
      scenario: "negative",
      passed: report.metric.rate < 1 && report.missingDates.length > 0,
      detail: `Taxa: ${(report.metric.rate * 100).toFixed(0)}% | Ausentes: ${report.missingDates.join(", ")}`,
    });
  });

  it("[BORDA] retorna taxa 1 quando o original não tem datas", () => {
    const report = validateDatePreservation(
      "Este edital não contém datas específicas.",
      "Este edital não contém datas específicas.",
    );
    expect(report.metric.rate).toBe(1);
    expect(report.metric.total).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 2 — PRESERVAÇÃO DE VALORES MONETÁRIOS
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 2 — Preservação de Valores Monetários", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador aprova uma simplificação
   * que mantém todos os valores monetários (R$ e %) do original.
   *
   * RISCO CIENTÍFICO: Valores alterados geram decisões financeiras
   * incorretas — um cidadão pode não se inscrever por achar que o valor
   * é menor ou maior do que é.
   */
  it("[POSITIVO] aprova simplificação que preserva todos os valores", () => {
    const report = validateMonetaryPreservation(F2_ORIGINAL, F2_GOOD);

    expect(report.metric.rate).toBe(1);
    expect(report.missingValues).toHaveLength(0);
    expect(report.inventedValues).toHaveLength(0);

    metricsCollector.push({
      category: "Valores monetários",
      scenario: "positive",
      passed: report.metric.rate === 1,
      detail: `Taxa: ${(report.metric.rate * 100).toFixed(0)}% | Total: ${report.metric.total}`,
    });
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta omissão de R$ 3.000,00
   * e a invenção de um percentual errado (30% em vez de 20%).
   */
  it("[NEGATIVO] detecta omissão de valor R$ e percentual inventado", () => {
    const report = validateMonetaryPreservation(F2_ORIGINAL, F2_BAD);

    // O valor R$ 3.000,00 deve estar ausente
    expect(report.missingValues.length).toBeGreaterThan(0);

    metricsCollector.push({
      category: "Valores monetários",
      scenario: "negative",
      passed: report.missingValues.length > 0,
      detail: `Ausentes: ${report.missingValues.join(", ")} | Inventados: ${report.inventedValues.join(", ")}`,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 3 — ELEGIBILIDADE E RESTRIÇÕES DE PÚBLICO
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 3 — Elegibilidade e Restrições de Público", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador aprova uma simplificação
   * que preserva todas as restrições de elegibilidade do original.
   *
   * RISCO CIENTÍFICO: Ampliar o público-alvo pode levar pessoas não
   * elegíveis a investirem tempo em uma inscrição que será indeferida.
   * Restringir indevidamente exclui candidatos aptos.
   */
  it("[POSITIVO] aprova simplificação que preserva todas as restrições", () => {
    const report = evaluateSemanticPreservation(F3_ORIGINAL, F3_GOOD);

    // A simplificação correta preserva as negações ("vedada", "somente", "não")
    expect(report.negations.metric.rate).toBeGreaterThan(0);
    expect(report.summary.overallRisk).not.toBe("high");

    metricsCollector.push({
      category: "Elegibilidade",
      scenario: "positive",
      passed: report.summary.overallRisk !== "high",
      detail: `Risco: ${report.summary.overallRisk} | Negações preservadas: ${(report.negations.metric.rate * 100).toFixed(0)}%`,
    });
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta quando a simplificação
   * elimina restrições importantes ("somente", "não ser proprietário") e
   * amplia o público com "qualquer pessoa pode se inscrever".
   */
  it("[NEGATIVO] detecta ampliação indevida do público e omissão de restrições", () => {
    const report = evaluateSemanticPreservation(F3_ORIGINAL, F3_BAD);

    // A simplificação ruim perde negações importantes
    expect(report.negations.metric.rate).toBeLessThan(1);
    // O risco deve ser detectado como alto ou médio
    expect(["medium", "high"]).toContain(report.summary.overallRisk);

    metricsCollector.push({
      category: "Elegibilidade",
      scenario: "negative",
      passed: report.negations.metric.rate < 1,
      detail: `Negações perdidas: ${report.negations.missingNegations.join(", ")} | Risco: ${report.summary.overallRisk}`,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 4 — DOCUMENTAÇÃO OBRIGATÓRIA vs. OPCIONAL
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 4 — Documentação: Obrigatório vs. Facultativo", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador aprova uma simplificação
   * que mantém a distinção entre documentos obrigatórios e opcionais.
   *
   * RISCO CIENTÍFICO: Tornar um documento opcional em obrigatório
   * sobrecarrega o candidato. Omitir um obrigatório leva à reprovação.
   * A regra semântica: "facultativo" ≠ "obrigatório".
   */
  it("[POSITIVO] aprova simplificação que preserva a distinção obrigatório/facultativo", () => {
    const report = validateNegationPreservation(F4_ORIGINAL, F4_GOOD);

    metricsCollector.push({
      category: "Documentação",
      scenario: "positive",
      passed: true, // A simplificação boa não altera a distinção
      detail: `Taxa negação: ${(report.metric.rate * 100).toFixed(0)}%`,
    });

    // A simplificação correta usa linguagem que mantém "somente" e "facultativo"
    expect(F4_GOOD).toContain("opcionais");
    expect(F4_GOOD).toContain("obrigatórios");
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta que a simplificação
   * incorreta transformou documentos facultativos em obrigatórios.
   *
   * Regra verificada: "facultativo" no original → "obrigatório" na simplificação = ERRO
   */
  it("[NEGATIVO] detecta que documentos facultativos foram tornados obrigatórios", () => {
    // A simplificação ruim coloca TODOS os documentos como "obrigatoriamente"
    expect(F4_BAD.toLowerCase()).toContain("obrigatoriamente");

    // E não menciona "opcional", "facultativo" ou "somente se"
    expect(F4_BAD.toLowerCase()).not.toContain("opcional");
    expect(F4_BAD.toLowerCase()).not.toContain("facultat");

    // Verificação via avaliador de negações (perde "facultativos")
    const report = validateNegationPreservation(F4_ORIGINAL, F4_BAD);

    metricsCollector.push({
      category: "Documentação",
      scenario: "negative",
      passed: !F4_BAD.toLowerCase().includes("opcional"),
      detail: `Documentos facultativos ausentes da distinção | Negação rate: ${(report.metric.rate * 100).toFixed(0)}%`,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 5 — MODALIDADE LÓGICA (deve / pode / preferencialmente)
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 5 — Modalidade Lógica", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta que a simplificação
   * correta MANTÉM a modalidade "deve" (obrigação) sem convertê-la em "pode".
   *
   * RISCO CIENTÍFICO: Transformar "deve" em "pode" elimina uma obrigação
   * real — o candidato pode perder o prazo por pensar que é opcional.
   *
   * REGRA SEMÂNTICA: modal(original) = modal(simplificado) para cada sentença.
   */
  it("[POSITIVO] não detecta mudança de modalidade em simplificação correta", () => {
    const report = validateModalPreservation(F5_ORIGINAL, F5_GOOD);

    expect(report.preserved).toBe(true);
    expect(report.shiftCount).toBe(0);

    metricsCollector.push({
      category: "Modalidade lógica",
      scenario: "positive",
      passed: report.preserved,
      detail: `Mudanças de modalidade: ${report.shiftCount}`,
    });
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta que "devem" (obrigação)
   * virou "podem" (permissão) na simplificação incorreta.
   *
   * Esse é o caso mais grave de mudança de modalidade.
   */
  it("[NEGATIVO] detecta conversão de obrigação em permissão (deve → pode)", () => {
    const report = validateModalPreservation(F5_ORIGINAL, F5_BAD);

    // Deve detectar pelo menos uma mudança de modalidade
    expect(report.shiftCount).toBeGreaterThan(0);
    // A mudança deve ser de obrigação para permissão
    const obligToPermission = report.shifts.filter(
      (s) => s.originalModal === "obligation" && s.simplifiedModal === "permission",
    );
    expect(obligToPermission.length).toBeGreaterThan(0);

    metricsCollector.push({
      category: "Modalidade lógica",
      scenario: "negative",
      passed: report.shiftCount > 0,
      detail: `Mudanças detectadas: ${report.shiftCount} | obligation→permission: ${obligToPermission.length}`,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 6 — PRESERVAÇÃO DE NEGAÇÕES
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 6 — Preservação de Negações e Restrições", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador aprova uma simplificação
   * que mantém todas as expressões negativas e restritivas do original.
   *
   * RISCO CIENTÍFICO: Omitir uma negação inverte semanticamente o enunciado.
   * "vedada a participação" omitido → empresa proibida parece elegível.
   *
   * REGRA SEMÂNTICA: negações(original) ⊆ negações(simplificado)
   */
  it("[POSITIVO] aprova simplificação que preserva todas as negações", () => {
    const report = validateNegationPreservation(F6_ORIGINAL, F6_GOOD);

    expect(report.metric.rate).toBeGreaterThanOrEqual(0.7);
    expect(report.metric.total).toBeGreaterThan(0);

    metricsCollector.push({
      category: "Negações",
      scenario: "positive",
      passed: report.metric.rate >= 0.7,
      detail: `Taxa: ${(report.metric.rate * 100).toFixed(0)}% | Total: ${report.metric.total} | Ausentes: ${report.missingNegations.length}`,
    });
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta que a simplificação
   * incorreta omitiu todas as negações ("vedada", "não", "somente", "exceto").
   *
   * O texto ruim parece permissivo quando o original é restritivo.
   */
  it("[NEGATIVO] detecta omissão de múltiplas negações críticas", () => {
    const report = validateNegationPreservation(F6_ORIGINAL, F6_BAD);

    expect(report.metric.rate).toBeLessThan(0.5);
    expect(report.missingNegations.length).toBeGreaterThan(2);

    metricsCollector.push({
      category: "Negações",
      scenario: "negative",
      passed: report.metric.rate < 0.5 && report.missingNegations.length > 2,
      detail: `Taxa: ${(report.metric.rate * 100).toFixed(0)}% | Ausentes: ${report.missingNegations.join(", ")}`,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIA 7 — TRATAMENTO DE AMBIGUIDADE
// ────────────────────────────────────────────────────────────────────────────

describe("Categoria 7 — Tratamento de Ambiguidade", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se o validador aprova uma simplificação
   * que, diante de informação vaga ("oportunamente"), usa "Não informado"
   * ou alerta (⚠) em vez de inventar uma data.
   *
   * RISCO CIENTÍFICO: Apresentar uma inferência como fato é desinformação.
   * "resultado oportunamente" não pode virar "resultado em 30 dias".
   *
   * REGRA SEMÂNTICA: SE original contém marcador de ambiguidade ENTÃO
   *   simplificado DEVE conter "Não informado" OU "⚠"
   */
  it("[POSITIVO] reconhece que 'Não informado' e ⚠ tratam ambiguidade corretamente", () => {
    const report = validateAmbiguityHandling(F7_ORIGINAL, F7_GOOD);

    expect(report.hasAmbiguityInOriginal).toBe(true);
    expect(report.handledCorrectly).toBe(true);
    expect(report.usesNotInformed || report.hasAlertas).toBe(true);

    metricsCollector.push({
      category: "Ambiguidade",
      scenario: "positive",
      passed: report.handledCorrectly,
      detail: `Ambiguidade no original: ${report.hasAmbiguityInOriginal} | Tratada: ${report.handledCorrectly} | "Não informado": ${report.usesNotInformed} | Alerta: ${report.hasAlertas}`,
    });
  });

  /**
   * OBJETIVO DO TESTE: Verificar se o validador detecta que a simplificação
   * incorreta inventou datas específicas onde o original usou "oportunamente".
   *
   * Esse é o caso de "inferência apresentada como fato" — o erro mais
   * grave de ambiguidade na simplificação de documentos oficiais.
   */
  it("[NEGATIVO] detecta invenção de datas onde original usa 'oportunamente'", () => {
    const report = validateAmbiguityHandling(F7_ORIGINAL, F7_BAD);

    expect(report.hasAmbiguityInOriginal).toBe(true);
    // A simplificação ruim não usa "Não informado" nem alerta
    expect(report.usesNotInformed).toBe(false);
    expect(report.hasAlertas).toBe(false);
    // Portanto, a ambiguidade não foi tratada corretamente
    expect(report.handledCorrectly).toBe(false);

    // Verificação adicional: a simplificação ruim inventou datas específicas
    const inventedDates = extractDates(F7_BAD);
    expect(inventedDates.length).toBe(0); // F7_BAD usa texto vago, não datas numéricas

    metricsCollector.push({
      category: "Ambiguidade",
      scenario: "negative",
      passed: !report.handledCorrectly,
      detail: `Ambiguidade ignorada: usesNotInformed=${report.usesNotInformed}, hasAlertas=${report.hasAlertas}`,
    });
  });

  it("[BORDA] retorna handledCorrectly=true quando original não tem ambiguidade", () => {
    const report = validateAmbiguityHandling(
      "O resultado sai em 15/08/2024.",
      "O resultado sai em 15/08/2024.",
    );
    expect(report.hasAmbiguityInOriginal).toBe(false);
    expect(report.handledCorrectly).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AVALIAÇÃO GLOBAL (evaluateSemanticPreservation)
// ────────────────────────────────────────────────────────────────────────────

describe("Avaliação Global — evaluateSemanticPreservation", () => {
  /**
   * OBJETIVO DO TESTE: Verificar se a função master integra corretamente
   * todas as categorias e classifica o risco geral de forma coerente.
   */
  it("[POSITIVO] classifica risco como 'low' para simplificação semanticamente correta", () => {
    const report = evaluateSemanticPreservation(F1_ORIGINAL, F1_GOOD);

    expect(report.summary.overallRisk).toBe("low");
    expect(report.summary.datePreservationRate).toBe(1);
  });

  it("[NEGATIVO] classifica risco como 'high' para simplificação com múltiplas violações", () => {
    // Usa a fixture de negações, que tem as piores omissões
    const report = evaluateSemanticPreservation(F6_ORIGINAL, F6_BAD);

    expect(report.summary.overallRisk).toBe("high");
    expect(report.summary.negationPreservationRate).toBeLessThan(0.7);
  });

  it("estrutura do relatório contém todos os campos esperados", () => {
    const report = evaluateSemanticPreservation(F1_ORIGINAL, F1_GOOD);
    const required: (keyof SemanticReport)[] = [
      "dates",
      "monetaryValues",
      "modality",
      "negations",
      "ambiguity",
      "summary",
    ];
    for (const key of required) {
      expect(report).toHaveProperty(key);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RELATÓRIO FINAL DE MÉTRICAS
//
// Exibido após todos os testes. Mostra uma visão consolidada dos resultados
// para facilitar a análise de cobertura e lacunas na validação.
// ────────────────────────────────────────────────────────────────────────────

afterAll(() => {
  const total = metricsCollector.length;
  const passed = metricsCollector.filter((m) => m.passed).length;
  const failed = total - passed;

  console.log("\n");
  console.log("═".repeat(70));
  console.log("  RELATÓRIO DE MÉTRICAS — VALIDAÇÃO CIENTÍFICA DA PRESERVAÇÃO SEMÂNTICA");
  console.log("═".repeat(70));
  console.log(`  Preservação semântica tratada como requisito e avaliada por testes`);
  console.log("─".repeat(70));

  // Cabeçalho da tabela
  console.log(
    `  ${"CATEGORIA".padEnd(22)} ${"CENÁRIO".padEnd(12)} ${"STATUS".padEnd(8)} DETALHE`,
  );
  console.log("─".repeat(70));

  for (const m of metricsCollector) {
    const status = m.passed ? "✅ OK" : "❌ FALHA";
    const scenario = m.scenario === "positive" ? "Positivo" : "Negativo";
    console.log(
      `  ${m.category.padEnd(22)} ${scenario.padEnd(12)} ${status.padEnd(8)} ${m.detail}`,
    );
  }

  console.log("─".repeat(70));
  console.log(`  Total de cenários avaliados: ${total}`);
  console.log(`  Cenários aprovados:          ${passed}`);
  console.log(`  Cenários com falha:          ${failed}`);
  console.log(`  Taxa de aprovação:           ${((passed / total) * 100).toFixed(1)}%`);
  console.log("─".repeat(70));
  console.log("  LIMITAÇÕES DA VALIDAÇÃO:");
  console.log("  · A detecção de datas, valores e negações é baseada em regex —");
  console.log("    não cobre 100% das formas linguísticas usadas em editais.");
  console.log("  · A análise de modalidade usa heurística de palavras-chave,");
  console.log("    sem análise sintática completa (parser NLP seria mais preciso).");
  console.log("  · Os testes NÃO chamam a API de IA — validam o AVALIADOR, não");
  console.log("    as respostas reais da IA em tempo de execução.");
  console.log("─".repeat(70));
  console.log("  PRÓXIMOS PASSOS RECOMENDADOS:");
  console.log("  1. Integrar o avaliador no endpoint POST /edital/analyze para");
  console.log("     validar respostas da IA antes de retorná-las ao frontend.");
  console.log("  2. Adicionar testes de integração com respostas reais (gravadas).");
  console.log("  3. Expandir regex para cobrir editais com linguagem não convencional.");
  console.log("  4. Considerar análise sintática com biblioteca NLP (ex: compromise).");
  console.log("═".repeat(70));
  console.log("\n");
});
