/**
 * @file semanticPreservation.ts
 * @description Módulo de Validação Científica da Preservação Semântica.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONTEXTO CIENTÍFICO
 * ────────────────────────────────────────────────────────────────────────────
 * Este módulo implementa a camada de avaliação do Princípio de Preservação
 * Semântica definido no AIService. Enquanto o AIService instrui a IA a
 * preservar o significado, este módulo VERIFICA se essa preservação ocorreu.
 *
 * A abordagem é inspirada em:
 * - Linguística computacional: extração e comparação de unidades semânticas
 * - Engenharia de software: testes de propriedade (property-based testing)
 * - Linguística Simples (Plain Language): os 7 princípios técnicos
 *
 * NOTA IMPORTANTE:
 * Este módulo avalia preservação semântica como REQUISITO e AVALIA por testes.
 * Não afirma que a preservação semântica é garantida — apenas indica quando
 * a análise de texto sugere que ela foi respeitada ou violada.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * @module semanticPreservation
 * @author NIASci / LUPA Digital
 */

// ────────────────────────────────────────────────────────────────────────────
// TIPOS E INTERFACES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Métrica genérica de preservação para qualquer categoria de informação.
 *
 * @example
 * // Se o original tinha 3 datas e a simplificação preservou 2:
 * { total: 3, preserved: 2, missing: 1, invented: 0, rate: 0.667 }
 */
export interface PreservationMetric {
  /** Total de ocorrências encontradas no texto original */
  total: number;
  /** Quantas ocorrências estão presentes na simplificação */
  preserved: number;
  /** Quantas ocorrências do original estão ausentes na simplificação */
  missing: number;
  /** Quantas ocorrências aparecem na simplificação mas NÃO no original */
  invented: number;
  /** Taxa de preservação: preserved / total (0..1). Retorna 1 quando total = 0. */
  rate: number;
}

/**
 * Representa uma mudança de modalidade lógica entre o original e a simplificação.
 *
 * RISCO CIENTÍFICO: Alterar a modalidade muda a força pragmática do enunciado.
 * "pode" (permissão) → "deve" (obrigação) cria uma obrigação inexistente.
 * "deve" (obrigação) → "pode" (permissão) elimina uma obrigação real.
 */
export interface ModalShift {
  /** Contexto extraído do texto original (até 60 chars) */
  originalContext: string;
  /** Modalidade identificada no original */
  originalModal: "obligation" | "permission" | "preference";
  /** Contexto correspondente na simplificação */
  simplifiedContext: string;
  /** Modalidade identificada na simplificação */
  simplifiedModal: "obligation" | "permission" | "preference";
}

/** Relatório de preservação de datas */
export interface DateReport {
  metric: PreservationMetric;
  /** Datas do original ausentes na simplificação */
  missingDates: string[];
  /** Datas na simplificação não encontradas no original */
  inventedDates: string[];
}

/** Relatório de preservação de valores monetários */
export interface MonetaryReport {
  metric: PreservationMetric;
  /** Valores do original ausentes na simplificação */
  missingValues: string[];
  /** Valores na simplificação não encontrados no original */
  inventedValues: string[];
}

/** Relatório de modalidade lógica */
export interface ModalReport {
  /** Mudanças de modalidade detectadas */
  shifts: ModalShift[];
  /** Quantidade total de mudanças */
  shiftCount: number;
  /** true quando nenhuma mudança de modalidade foi detectada */
  preserved: boolean;
}

/** Relatório de preservação de negações */
export interface NegationReport {
  metric: PreservationMetric;
  /** Expressões negativas do original ausentes na simplificação */
  missingNegations: string[];
}

/** Relatório de tratamento de ambiguidade */
export interface AmbiguityReport {
  /** O original contém marcadores de ambiguidade ou ausência de informação */
  hasAmbiguityInOriginal: boolean;
  /** A simplificação usa "Não informado" ou expressão equivalente */
  usesNotInformed: boolean;
  /** A simplificação contém alertas (⚠) */
  hasAlertas: boolean;
  /** A ambiguidade foi tratada corretamente (usesNotInformed ou hasAlertas) */
  handledCorrectly: boolean;
}

/** Relatório de preservação de requisitos de elegibilidade */
export interface EligibilityReport {
  metric: PreservationMetric;
  /** Requisitos do original ausentes na simplificação */
  missingRequirements: string[];
}

/** Relatório de preservação da documentação */
export interface DocumentationReport {
  metric: PreservationMetric;
  /** Documentos obrigatórios do original ausentes na simplificação */
  missingMandatory: string[];
  /** Documentos opcionais apresentados como obrigatórios */
  wronglyMandatory: string[];
}

/**
 * Relatório completo de preservação semântica.
 *
 * Agrupa todos os relatórios individuais e calcula métricas globais.
 * O campo `overallRisk` é uma avaliação de risco baseada nas taxas de
 * preservação: "low" (todos > 0.9), "medium" (algum entre 0.7–0.9),
 * "high" (algum abaixo de 0.7).
 */
export interface SemanticReport {
  dates: DateReport;
  monetaryValues: MonetaryReport;
  modality: ModalReport;
  negations: NegationReport;
  ambiguity: AmbiguityReport;
  summary: {
    datePreservationRate: number;
    monetaryPreservationRate: number;
    negationPreservationRate: number;
    modalShiftCount: number;
    /** Risco geral: "low" (bom), "medium" (atenção), "high" (crítico) */
    overallRisk: "low" | "medium" | "high";
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXTRATORES DE UNIDADES SEMÂNTICAS CRÍTICAS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Padrões de data reconhecidos em documentos oficiais brasileiros.
 *
 * Cobre:
 * - Formato numérico: 15/08/2024, 15-08-2024, 15.08.2024
 * - Formato por extenso: "15 de agosto de 2024"
 * - Formato ISO (raramente em editais): 2024-08-15
 */
const DATE_PATTERNS = [
  /\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/gi,
  /\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}\b/gi,
  /\b\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}\b/gi,
];

/**
 * Padrões de valores monetários e percentuais.
 *
 * Cobre: R$ 2.500,00 | R$2.500 | 80% | 1,5 salário mínimo
 */
const MONETARY_PATTERNS = [
  /R\$\s*[\d.,]+(?:\s*(?:mil|milhão|milhões|bilhão|bilhões))?/gi,
  /\b\d+(?:[.,]\d+)?\s*%/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:salários?\s+mínimos?|SM)/gi,
];

/**
 * Expressões de negação e restrição em português.
 *
 * RISCO CIENTÍFICO: A omissão de uma negação inverte o significado do
 * enunciado. "vedado a servidores públicos" omitido cria a impressão de
 * que servidores podem participar — o oposto do que diz o edital.
 */
const NEGATION_KEYWORDS = [
  /\bnão\b/gi,
  /\bexceto\b/gi,
  /\bvedad[oa]s?\b/gi,
  /\bsomente\b/gi,
  /\bapenas\b/gi,
  /\bexclusivamente\b/gi,
  /\bproibido[as]?\b/gi,
  /\bimpedido[as]?\b/gi,
  /\brestrito[as]?\b/gi,
  /\bsalvo\b/gi,
];

/**
 * Marcadores de modalidade obrigatória (obligation).
 *
 * Identificam enunciados que impõem uma obrigação ao candidato.
 * Exemplo: "os candidatos DEVEM entregar os documentos"
 */
const OBLIGATION_PATTERNS = [
  /\bdev[eê][mns]?\b/gi,
  /\bobrigató(?:rio|ria|rios|rias)\b/gi,
  /\bé\s+exigid[oa]\b/gi,
  /\bserá\s+exigid[oa]\b/gi,
  /\bnecessário\b/gi,
  /\bimprescindível\b/gi,
  /\bindispensável\b/gi,
];

/**
 * Marcadores de modalidade permissiva (permission).
 *
 * Identificam enunciados que permitem — mas não obrigam — uma ação.
 * Exemplo: "os candidatos PODEM entregar os documentos por correio"
 */
const PERMISSION_PATTERNS = [
  /\bpod[eê][mns]?\b/gi,
  /\bfacultativ[oa][s]?\b/gi,
  /\bopcional\b/gi,
  /\bé\s+permitid[oa]\b/gi,
  /\bpermitid[oa][s]?\b/gi,
];

/**
 * Marcadores de modalidade preferencial (preference).
 *
 * Identificam enunciados que recomendam sem obrigar.
 * Exemplo: "PREFERENCIALMENTE, os documentos devem ser digitalizados"
 */
const PREFERENCE_PATTERNS = [
  /\bpreferencialmente\b/gi,
  /\bde\s+preferência\b/gi,
  /\brecomend[aá]vel\b/gi,
  /\bé\s+recomendad[oa]\b/gi,
  /\bde\s+preferência\b/gi,
];

/**
 * Marcadores de ausência de informação ou ambiguidade no texto original.
 *
 * Quando o texto usa essas expressões, a simplificação DEVE usar
 * "Não informado" ou gerar um alerta — nunca inventar uma resposta.
 */
const AMBIGUITY_MARKERS = [
  /\boportunamente\b/gi,
  /\ba\s+definir\b/gi,
  /\ba\s+ser\s+(?:divulgad[ao]|anunciado|comunicad[ao])\b/gi,
  /\bposterior(?:mente)?\b/gi,
  /\bem\s+breve\b/gi,
  /\bquando\s+necessário\b/gi,
  /\ba\s+critério\b/gi,
  /\bconforme\s+conveniência\b/gi,
];

// ────────────────────────────────────────────────────────────────────────────
// FUNÇÕES DE EXTRAÇÃO
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extrai todas as datas presentes em um texto.
 *
 * OBJETIVO: Identificar as unidades temporais críticas que não podem ser
 * alteradas ou inventadas pela IA durante a simplificação.
 *
 * @param text - Texto a ser analisado (original ou simplificado)
 * @returns Array de strings com datas encontradas, normalizadas para minúsculas
 *
 * @example
 * extractDates("Inscrições até 15/08/2024 e resultado em 30 de setembro de 2024")
 * // → ["15/08/2024", "30 de setembro de 2024"]
 */
export function extractDates(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of DATE_PATTERNS) {
    // Redefinimos o lastIndex para garantir que o match começa do início
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      found.add(match[0].toLowerCase().trim());
    }
  }
  return [...found];
}

/**
 * Extrai valores monetários e percentuais de um texto.
 *
 * OBJETIVO: Identificar valores críticos que não podem ser alterados ou
 * omitidos — prazos financeiros são centrais para decisões do cidadão.
 *
 * @param text - Texto a ser analisado
 * @returns Array de strings com os valores encontrados (normalizados)
 *
 * @example
 * extractMonetaryValues("Benefício de R$ 2.500,00, limitado a 80%")
 * // → ["r$ 2.500,00", "80%"]
 */
export function extractMonetaryValues(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of MONETARY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      found.add(match[0].toLowerCase().trim());
    }
  }
  return [...found];
}

/**
 * Extrai expressões de negação e restrição de um texto.
 *
 * OBJETIVO: Garantir que termos que limitam ou excluem participantes não
 * sejam omitidos na simplificação — sua ausência inverte o sentido original.
 *
 * @param text - Texto a ser analisado
 * @returns Array de strings com os tokens de negação encontrados
 */
export function extractNegations(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of NEGATION_KEYWORDS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      found.add(match[0].toLowerCase().trim());
    }
  }
  return [...found];
}

/**
 * Detecta a modalidade lógica predominante em uma janela de texto.
 *
 * REGRA SEMÂNTICA: A modalidade (obrigação / permissão / preferência) é
 * parte essencial do significado — ela define o grau de coerção do enunciado.
 * Uma obrigação "deve" não pode ser simplificada como permissão "pode".
 *
 * @param text - Trecho de texto a classificar
 * @returns A modalidade detectada, ou null se nenhuma for identificada
 */
export function detectModality(
  text: string,
): "obligation" | "permission" | "preference" | null {
  // Preferência é verificada ANTES de obrigação porque "preferencialmente"
  // qualifica e suaviza um "deve" — "devem ser digitalizados preferencialmente"
  // é uma preferência, não uma obrigação estrita.
  if (PREFERENCE_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(text)))
    return "preference";
  if (OBLIGATION_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(text)))
    return "obligation";
  if (PERMISSION_PATTERNS.some((p) => new RegExp(p.source, p.flags).test(text)))
    return "permission";
  return null;
}

/**
 * Verifica se um texto contém marcadores de ambiguidade ou informação ausente.
 *
 * @param text - Texto original do edital
 * @returns true se o texto tiver marcadores de informação indefinida
 */
export function hasAmbiguityMarkers(text: string): boolean {
  return AMBIGUITY_MARKERS.some((p) => new RegExp(p.source, p.flags).test(text));
}

// ────────────────────────────────────────────────────────────────────────────
// FUNÇÕES DE VALIDAÇÃO POR CATEGORIA
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcula uma PreservationMetric comparando dois conjuntos de itens.
 *
 * É o núcleo matemático de todos os relatórios — reutilizado por cada
 * categoria (datas, valores, negações, documentos, requisitos).
 */
function buildMetric(originalItems: string[], simplifiedItems: string[]): PreservationMetric {
  const simplifiedSet = new Set(simplifiedItems.map((s) => s.toLowerCase().trim()));
  const originalSet = new Set(originalItems.map((s) => s.toLowerCase().trim()));

  const preserved = [...originalSet].filter((item) => simplifiedSet.has(item)).length;
  const missing = [...originalSet].filter((item) => !simplifiedSet.has(item));
  const invented = [...simplifiedSet].filter((item) => !originalSet.has(item));

  return {
    total: originalSet.size,
    preserved,
    missing: missing.length,
    invented: invented.length,
    rate: originalSet.size === 0 ? 1 : preserved / originalSet.size,
  };
}

/**
 * Categoria 1 — Validação de Preservação de Datas.
 *
 * OBJETIVO DO TESTE: Verificar se todas as datas críticas do edital original
 * estão presentes na resposta simplificada, sem alterações.
 *
 * RISCO CIENTÍFICO: Uma data alterada (ex: 15/08 → 20/08) pode levar o
 * cidadão a perder o prazo real — consequência direta e grave.
 *
 * REGRA SEMÂNTICA VERIFICADA:
 * - datas(original) ⊆ datas(simplificado): todas as datas do original devem estar presentes
 * - datas(simplificado) ⊆ datas(original): a simplificação não pode inventar datas novas
 *
 * @param originalText - Texto original do edital
 * @param simplifiedText - Texto simplificado gerado pela IA
 * @returns DateReport com métricas e listas de datas preservadas, ausentes e inventadas
 */
export function validateDatePreservation(
  originalText: string,
  simplifiedText: string,
): DateReport {
  const originalDates = extractDates(originalText);
  const simplifiedDates = extractDates(simplifiedText);

  const metric = buildMetric(originalDates, simplifiedDates);
  const originalSet = new Set(originalDates.map((d) => d.toLowerCase().trim()));
  const simplifiedSet = new Set(simplifiedDates.map((d) => d.toLowerCase().trim()));

  return {
    metric,
    missingDates: [...originalSet].filter((d) => !simplifiedSet.has(d)),
    inventedDates: [...simplifiedSet].filter((d) => !originalSet.has(d)),
  };
}

/**
 * Categoria 2 — Validação de Preservação de Valores Monetários.
 *
 * OBJETIVO DO TESTE: Verificar se valores (R$, %, salários mínimos) do
 * original estão presentes e corretos na simplificação.
 *
 * RISCO CIENTÍFICO: Um valor alterado gera decisões financeiras incorretas.
 * "R$ 2.500,00" não pode virar "um bom benefício".
 *
 * REGRA SEMÂNTICA VERIFICADA:
 * - valores(original) ⊆ valores(simplificado): todos os valores devem ser preservados
 * - Valores inventados são igualmente inaceitáveis
 *
 * @param originalText - Texto original do edital
 * @param simplifiedText - Texto simplificado gerado pela IA
 * @returns MonetaryReport com métricas de preservação de valores
 */
export function validateMonetaryPreservation(
  originalText: string,
  simplifiedText: string,
): MonetaryReport {
  const originalValues = extractMonetaryValues(originalText);
  const simplifiedValues = extractMonetaryValues(simplifiedText);

  const metric = buildMetric(originalValues, simplifiedValues);
  const originalSet = new Set(originalValues.map((v) => v.toLowerCase().trim()));
  const simplifiedSet = new Set(simplifiedValues.map((v) => v.toLowerCase().trim()));

  return {
    metric,
    missingValues: [...originalSet].filter((v) => !simplifiedSet.has(v)),
    inventedValues: [...simplifiedSet].filter((v) => !originalSet.has(v)),
  };
}

/**
 * Categoria 3 — Validação de Modalidade Lógica.
 *
 * OBJETIVO DO TESTE: Verificar se a força pragmática dos enunciados modais
 * foi preservada (obrigação permanece obrigação; permissão permanece permissão).
 *
 * RISCO CIENTÍFICO: "Deve" virar "pode" elimina uma obrigação real.
 * "Pode" virar "deve" cria uma obrigação inexistente — ambos são erros graves.
 *
 * REGRA SEMÂNTICA VERIFICADA:
 * modal(original[i]) = modal(simplificado[i]) para toda sentença com marcador modal
 *
 * LIMITAÇÃO: A detecção é baseada em heurísticas de palavras-chave, não em
 * análise sintática completa. Sentenças ambíguas podem gerar falsos positivos.
 *
 * @param originalText - Texto original do edital (sentença a sentença)
 * @param simplifiedText - Texto simplificado gerado pela IA
 * @returns ModalReport com lista de mudanças de modalidade detectadas
 */
export function validateModalPreservation(
  originalText: string,
  simplifiedText: string,
): ModalReport {
  // Divide os textos em sentenças (separadas por ponto ou ponto-e-vírgula)
  const splitSentences = (text: string) =>
    text
      .split(/[.;]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

  const originalSentences = splitSentences(originalText);
  const simplifiedSentences = splitSentences(simplifiedText);

  const shifts: ModalShift[] = [];

  // Para cada sentença do original com modalidade identificada,
  // tenta encontrar a sentença correspondente na simplificação
  for (const origSentence of originalSentences) {
    const origModality = detectModality(origSentence);
    if (!origModality) continue;

    // Estratégia de correspondência: busca a sentença simplificada com maior
    // sobreposição de tokens não-stop com a sentença original
    const origTokens = tokenize(origSentence);
    let bestMatch = "";
    let bestScore = 0;

    for (const simpSentence of simplifiedSentences) {
      const simpTokens = tokenize(simpSentence);
      const overlap = origTokens.filter((t) => simpTokens.includes(t)).length;
      const score = overlap / Math.max(origTokens.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = simpSentence;
      }
    }

    // Só avalia correspondências com sobreposição razoável (> 20%)
    if (bestScore < 0.2 || !bestMatch) continue;

    const simpModality = detectModality(bestMatch);
    if (simpModality && simpModality !== origModality) {
      shifts.push({
        originalContext: origSentence.slice(0, 80),
        originalModal: origModality,
        simplifiedContext: bestMatch.slice(0, 80),
        simplifiedModal: simpModality,
      });
    }
  }

  return {
    shifts,
    shiftCount: shifts.length,
    preserved: shifts.length === 0,
  };
}

/**
 * Categoria 4 — Validação de Preservação de Negações.
 *
 * OBJETIVO DO TESTE: Verificar se expressões negativas e restritivas do
 * original (não, vedado, exceto, somente) estão presentes na simplificação.
 *
 * RISCO CIENTÍFICO: Omitir uma negação inverte semanticamente o enunciado.
 * "vedado a servidores públicos" omitido → o cidadão entende que pode participar.
 *
 * REGRA SEMÂNTICA VERIFICADA:
 * negações(original) ⊆ negações(simplificado)
 *
 * @param originalText - Texto original do edital
 * @param simplifiedText - Texto simplificado gerado pela IA
 * @returns NegationReport com métricas de preservação de negações
 */
export function validateNegationPreservation(
  originalText: string,
  simplifiedText: string,
): NegationReport {
  const originalNegations = extractNegations(originalText);
  const simplifiedNegations = extractNegations(simplifiedText);

  const metric = buildMetric(originalNegations, simplifiedNegations);
  const simplifiedSet = new Set(simplifiedNegations.map((n) => n.toLowerCase().trim()));

  return {
    metric,
    missingNegations: originalNegations.filter((n) => !simplifiedSet.has(n.toLowerCase().trim())),
  };
}

/**
 * Categoria 5 — Validação do Tratamento de Ambiguidade.
 *
 * OBJETIVO DO TESTE: Verificar se, quando o original não fornece informação
 * explícita, a simplificação usa "Não informado" ou gera um alerta em vez
 * de inventar uma resposta.
 *
 * RISCO CIENTÍFICO: Apresentar como fato uma inferência é desinformação.
 * "resultado oportunamente" não pode virar "resultado em 30 dias".
 *
 * REGRA SEMÂNTICA VERIFICADA:
 * SE hasAmbiguityMarkers(original) ENTÃO
 *   simplificado CONTÉM "não informado" OU simplificado CONTÉM "⚠"
 *
 * @param originalText - Texto original do edital
 * @param simplifiedText - Texto simplificado gerado pela IA
 * @returns AmbiguityReport com avaliação de tratamento de ambiguidade
 */
export function validateAmbiguityHandling(
  originalText: string,
  simplifiedText: string,
): AmbiguityReport {
  const hasAmbiguity = hasAmbiguityMarkers(originalText);
  const normalizedSimplified = simplifiedText.toLowerCase();

  const NOT_INFORMED_MARKERS = [
    "não informado",
    "nao informado",
    "a ser definido",
    "verificar no edital",
    "não especificado",
    "não consta",
  ];

  const usesNotInformed = NOT_INFORMED_MARKERS.some((m) =>
    normalizedSimplified.includes(m),
  );
  const hasAlertas = simplifiedText.includes("⚠");
  const handledCorrectly = !hasAmbiguity || usesNotInformed || hasAlertas;

  return {
    hasAmbiguityInOriginal: hasAmbiguity,
    usesNotInformed,
    hasAlertas,
    handledCorrectly,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// FUNÇÃO MASTER: AVALIAÇÃO GLOBAL
// ────────────────────────────────────────────────────────────────────────────

/**
 * Avalia a preservação semântica de uma simplificação de edital.
 *
 * Esta é a função principal do módulo — ela orquestra todas as validações
 * por categoria e retorna um relatório completo com métricas e risco geral.
 *
 * IMPORTANTE: Esta função avalia a PRESERVAÇÃO SEMÂNTICA como REQUISITO.
 * Ela não afirma que a preservação é garantida — apenas indica se as
 * métricas sugerem que ela foi respeitada neste par (original, simplificado).
 *
 * @param originalText - Texto original completo do edital
 * @param simplifiedText - Texto simplificado completo gerado pela IA (JSON serializado ou texto)
 * @returns SemanticReport com todas as categorias avaliadas e risco geral
 *
 * @example
 * const report = evaluateSemanticPreservation(edital, simplificado);
 * if (report.summary.overallRisk === 'high') {
 *   logger.warn("Possível perda semântica detectada");
 * }
 */
export function evaluateSemanticPreservation(
  originalText: string,
  simplifiedText: string,
): SemanticReport {
  const dates = validateDatePreservation(originalText, simplifiedText);
  const monetaryValues = validateMonetaryPreservation(originalText, simplifiedText);
  const modality = validateModalPreservation(originalText, simplifiedText);
  const negations = validateNegationPreservation(originalText, simplifiedText);
  const ambiguity = validateAmbiguityHandling(originalText, simplifiedText);

  // Cálculo do risco geral
  // Considera todas as taxas de preservação — a mais baixa define o risco
  const rates = [
    dates.metric.total > 0 ? dates.metric.rate : 1,
    monetaryValues.metric.total > 0 ? monetaryValues.metric.rate : 1,
    negations.metric.total > 0 ? negations.metric.rate : 1,
  ];
  const minRate = Math.min(...rates);
  const hasModalShifts = modality.shiftCount > 0;
  const ambiguityProblem = ambiguity.hasAmbiguityInOriginal && !ambiguity.handledCorrectly;

  // Limiares de risco calibrados para avaliar preservação semântica:
  //   "high"   — minRate < 0.60: mais de 40% das unidades críticas perdidas,
  //              OU a ambiguidade não foi tratada (informação inventada)
  //   "medium" — minRate < 0.85: algumas perdas detectáveis, ou mudança de
  //              modalidade lógica (deve→pode), mas sem colapso semântico
  //   "low"    — todas as taxas ≥ 0.85 e sem modalShifts nem problemas de ambiguidade
  let overallRisk: "low" | "medium" | "high";
  if (minRate < 0.6 || ambiguityProblem) {
    overallRisk = "high";
  } else if (minRate < 0.85 || hasModalShifts) {
    overallRisk = "medium";
  } else {
    overallRisk = "low";
  }

  return {
    dates,
    monetaryValues,
    modality,
    negations,
    ambiguity,
    summary: {
      datePreservationRate: dates.metric.rate,
      monetaryPreservationRate: monetaryValues.metric.rate,
      negationPreservationRate: negations.metric.rate,
      modalShiftCount: modality.shiftCount,
      overallRisk,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS INTERNOS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tokeniza um texto em palavras significativas (sem stop words básicas).
 *
 * Usado para calcular sobreposição entre sentenças original/simplificada
 * na análise de modalidade lógica.
 */
function tokenize(text: string): string[] {
  const STOP_WORDS = new Set([
    "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "em",
    "para", "com", "que", "se", "por", "um", "uma", "no", "na", "ao",
    "este", "esta", "esse", "essa", "isso", "aquele", "ser", "foi",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúâêîôûãõ\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}
