/**
 * @file aiService.ts
 * @description Serviço central de IA do LUPA Digital (NIASci).
 *
 * PRINCÍPIO DE PRESERVAÇÃO SEMÂNTICA
 * ────────────────────────────────────────────────────────────────────────────
 * Inspirado no conceito de signo linguístico de Saussure, este sistema opera
 * sobre a distinção entre significante e significado:
 *
 *   • Significante (PODE ser transformado): a forma linguística — vocabulário,
 *     estrutura de frase, organização, nível de linguagem.
 *
 *   • Significado (DEVE ser preservado): o conteúdo semântico — prazos,
 *     critérios, valores, exigências, obrigações e relações causais do documento.
 *
 * Toda função de IA neste arquivo injeta o SEMANTIC_PRESERVATION_MANDATE nos
 * prompts de sistema, garantindo que a simplificação nunca distorça o sentido
 * original do documento analisado.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { openai, getOpenAIModel } from "@workspace/integrations-openai-ai-server";
import { SimplifyEditalResponse } from "@workspace/api-zod";
import { z } from "zod";
import { logger } from "./logger";
import { getSupabaseAdmin } from "./supabase";

export type AgentId = "simples" | "analista" | "estrategica" | "acompanhamento" | "documentacao" | "elegibilidade";

export const AgentUserProfileSchema = z.object({
  escolaridade: z.string().default("superior"),
  atuacao: z.string().default(""),
  municipio: z.string().default(""),
  rendaFamiliar: z.string().default("1a3"),
});

export const AgentAnalyzeBodySchema = z.object({
  agentId: z.enum(["simples", "analista", "estrategica", "acompanhamento", "documentacao", "elegibilidade"]),
  text: z.string().min(10),
  profile: AgentUserProfileSchema.optional(),
});

// ── Response validators ────────────────────────────────────────────────────
export const SimplesResponseSchema = z.object({
  type: z.literal("simples"),
  scoreOportunidade: z.number().int().min(0).max(100),
  categoria: z.string(),
  resumo: z.string(),
  objetivo: z.string(),
  publicoAlvo: z.string(),
  prazo: z.string(),
  requisitos: z.array(z.string()),
  ondeInscrever: z.string(),
  observacao: z.string(),
});

export const AnalistaResponseSchema = z.object({
  type: z.literal("analista"),
  tipoEdital: z.string(),
  instituicao: z.string(),
  prazo: z.string(),
  publicoAlvo: z.string(),
  requisitos: z.array(z.string()),
  documentos: z.array(z.string()),
  valor: z.string(),
});

export const EstrategicaResponseSchema = z.object({
  type: z.literal("estrategica"),
  score: z.number().int().min(0).max(100),
  oportunidade: z.string(),
  vantagens: z.array(z.string()),
  pontosAtencao: z.array(z.string()),
  riscos: z.array(z.string()),
  recomendacao: z.string(),
});

const TimelineItemSchema = z.object({
  fase: z.string(),
  periodo: z.string(),
  descricao: z.string(),
  status: z.enum(["passado", "ativo", "futuro"]),
});

export const AcompanhamentoResponseSchema = z.object({
  type: z.literal("acompanhamento"),
  timeline: z.array(TimelineItemSchema),
  observacao: z.string(),
});

const ChecklistItemSchema = z.object({
  doc: z.string(),
  obrigatorio: z.boolean(),
  observacao: z.string(),
  checked: z.boolean().default(false),
});

export const DocumentacaoResponseSchema = z.object({
  type: z.literal("documentacao"),
  checklist: z.array(ChecklistItemSchema),
  dica: z.string(),
});

const ElegibilidadeCriterioSchema = z.object({
  criterio: z.string(),
  atende: z.union([z.boolean(), z.literal("parcial")]),
  observacao: z.string(),
});

export const ElegibilidadeResponseSchema = z.object({
  type: z.literal("elegibilidade"),
  score: z.number().int().min(0).max(100),
  criterios: z.array(ElegibilidadeCriterioSchema),
  recomendacao: z.string(),
  proximosPassos: z.array(z.string()),
});

// ── Princípio de Preservação Semântica (centralizado) ─────────────────────
/**
 * Mandato injetado em TODOS os prompts de sistema do LUPA Digital.
 *
 * Garante que a IA transforme apenas o significante (forma linguística) e
 * jamais altere o significado (conteúdo semântico) do documento original.
 *
 * O que PODE ser transformado: vocabulário, estrutura de frases, nível de
 * linguagem, organização, explicação de termos técnicos.
 *
 * O que NUNCA pode ser alterado: prazos, critérios de elegibilidade, valores,
 * condições, exigências, obrigações, relações causais e consequências.
 */
const SEMANTIC_PRESERVATION_MANDATE = `
PRINCÍPIO DE PRESERVAÇÃO SEMÂNTICA (obrigatório):
Você pode transformar o SIGNIFICANTE (a forma linguística), mas NUNCA o SIGNIFICADO.

PERMITIDO — transformações de forma:
- Simplificar vocabulário e substituir jargão por linguagem acessível
- Reduzir frases longas e reorganizar informações
- Explicar termos técnicos e jurídicos
- Dividir conteúdo em tópicos e adaptar o nível de linguagem

PROIBIDO — alterações de conteúdo:
- Inventar informações que não estão no documento
- Alterar ou omitir prazos (datas, períodos, vigências)
- Mudar critérios de elegibilidade ou requisitos
- Omitir exigências, condições ou obrigações importantes
- Alterar valores monetários ou quantitativos
- Transformar uma OBRIGAÇÃO em recomendação ou sugestão
- Transformar uma POSSIBILIDADE em certeza ou garantia
- Modificar relações de causa e consequência

AMBIGUIDADE — quando o documento for impreciso ou contraditório:
- Informe que o trecho precisa ser conferido no documento original
- Cite o trecho exato de onde a informação foi extraída
- Não assuma uma interpretação como verdadeira sem base textual

FIDELIDADE SEMÂNTICA: toda análise deve preservar o significado original,
o contexto, a intenção e as relações entre condições e consequências presentes
no documento. Em caso de dúvida, prefira a cautela à assertividade.`.trim();

// ── Schema examples (estrutura de resposta esperada por agente) ────────────
const SCHEMA_EXAMPLES: Record<AgentId, string> = {
  simples: `{
  "type": "simples",
  "scoreOportunidade": 72,
  "categoria": "Classificação do edital (ex: Bolsa de Estudo, Pesquisa Científica, Concurso Público, Inovação, Fomento, Licitação, Processo Seletivo, Chamamento Público)",
  "resumo": "Resumo em 3-4 frases simples que qualquer pessoa entenda, sem jargão técnico — mantendo todos os critérios e condições originais",
  "objetivo": "O objetivo principal do edital em 1-2 frases diretas, exatamente como consta no documento",
  "publicoAlvo": "Quem pode participar, de forma clara e objetiva, sem omitir restrições",
  "prazo": "Data limite de inscrição ou período de inscrições EXATAMENTE como consta no edital (ou 'Não informado' se não constar)",
  "requisitos": ["Requisito principal 1 — fiel ao documento", "Requisito principal 2", "Requisito principal 3"],
  "ondeInscrever": "Como e onde fazer a inscrição: site, endereço, portal — exatamente como consta",
  "observacao": "Uma dica importante e prática para o candidato, sem alterar exigências ou criar expectativas não previstas no edital"
}`,
  analista: `{
  "type": "analista",
  "tipoEdital": "Tipo do edital (ex: Concurso Público, Concessão de Bolsa, Licitação, Fomento, Processo Seletivo, Chamamento Público)",
  "instituicao": "Nome completo da instituição ou órgão responsável pelo edital",
  "prazo": "Todas as datas e prazos identificados separados por ' | ' — transcreva exatamente os valores do documento",
  "publicoAlvo": "Descrição precisa do público-alvo do edital, incluindo todas as restrições mencionadas",
  "requisitos": ["Requisito 1 — fiel ao documento", "Requisito 2", "Requisito 3"],
  "documentos": ["Documento 1", "Documento 2", "Documento 3"],
  "valor": "Valor da bolsa, prêmio, financiamento ou benefício EXATAMENTE como consta (ou 'Não especificado')"
}`,
  estrategica: `{
  "type": "estrategica",
  "score": 75,
  "oportunidade": "Parágrafo de 2-3 frases descrevendo a oportunidade com base estrita no que consta no edital",
  "vantagens": ["Vantagem 1 — baseada em informação do documento", "Vantagem 2", "Vantagem 3", "Vantagem 4"],
  "pontosAtencao": ["Ponto de atenção 1 — exigência ou condição real do edital", "Ponto de atenção 2", "Ponto de atenção 3"],
  "riscos": ["Risco 1 — fundamentado no texto do edital", "Risco 2"],
  "recomendacao": "Recomendação estratégica acionável, baseada exclusivamente nas condições reais do edital"
}`,
  acompanhamento: `{
  "type": "acompanhamento",
  "timeline": [
    {"fase": "📢 Publicação do Edital", "periodo": "data ou período EXATO do documento (ou 'Verificar no edital')", "descricao": "descrição fiel", "status": "passado"},
    {"fase": "📝 Período de Inscrições", "periodo": "data ou período EXATO", "descricao": "descrição fiel", "status": "ativo"},
    {"fase": "📋 Análise / Seleção", "periodo": "data ou período EXATO (ou 'Verificar no edital')", "descricao": "descrição fiel", "status": "futuro"},
    {"fase": "📣 Resultado Preliminar", "periodo": "data ou período EXATO (ou 'Verificar no edital')", "descricao": "descrição fiel", "status": "futuro"},
    {"fase": "✉️ Prazo para Recurso", "periodo": "data ou período EXATO (ou 'Verificar no edital')", "descricao": "descrição fiel", "status": "futuro"},
    {"fase": "🏆 Resultado Final", "periodo": "data ou período EXATO (ou 'Verificar no edital')", "descricao": "descrição fiel", "status": "futuro"}
  ],
  "observacao": "Observação sobre os prazos — se alguma data não constar no edital, indicar 'Verificar no edital' e NÃO inventar datas"
}`,
  documentacao: `{
  "type": "documentacao",
  "checklist": [
    {"doc": "Nome do documento exatamente como consta no edital", "obrigatorio": true, "observacao": "Onde obter ou como preparar — sem adicionar exigências que não estão no edital", "checked": false}
  ],
  "dica": "Dica prática sobre como organizar a documentação — baseada no que o edital efetivamente exige"
}`,
  elegibilidade: `{
  "type": "elegibilidade",
  "score": 75,
  "criterios": [
    {"criterio": "Nome exato do critério conforme o edital", "atende": true, "observacao": "Explicação baseada estritamente no texto do edital e no perfil informado"}
  ],
  "recomendacao": "Recomendação personalizada baseada nos critérios reais do edital — sem suavizar exigências não atendidas",
  "proximosPassos": ["Passo 1 — ação concreta baseada no edital", "Passo 2", "Passo 3", "Passo 4"]
}`,
};

// ── Instruções por agente ──────────────────────────────────────────────────
/**
 * Instruções de identidade e missão de cada agente.
 * Estas instruções definem O QUE o agente faz (significante), enquanto o
 * SEMANTIC_PRESERVATION_MANDATE garante que o conteúdo semântico do documento
 * original seja preservado integralmente em todas as análises.
 */
const INSTRUCTIONS: Record<AgentId, string> = {
  simples:
    "Você é o agente Lupa Simples. Crie um resumo curto e acessível do edital em linguagem simples, direta e sem jargão técnico, para que qualquer cidadão possa entender. Adapte a forma, nunca o conteúdo: todos os prazos, critérios e exigências devem ser mantidos integralmente.",

  analista:
    "Você é o agente Lupa Analista. Extraia e organize os indicadores-chave do edital com precisão absoluta: tipo, instituição, prazos, público-alvo, requisitos, documentos exigidos e valor do benefício. Transcreva datas e valores exatamente como constam no documento. Se uma informação não estiver explícita, use 'Não informado' — nunca infira ou invente.",

  estrategica:
    "Você é o agente Lupa Estratégica, um consultor especializado em editais públicos. Avalie a oportunidade (score 0–100 refletindo qualidade, clareza, benefício e acessibilidade), identifique vantagens, pontos de atenção e riscos. Toda avaliação deve ser fundamentada exclusivamente nas informações presentes no edital: não crie vantagens ou riscos sem base textual.",

  acompanhamento:
    "Você é o agente Lupa Acompanhamento. Construa uma linha do tempo completa com todas as fases do edital. Use SOMENTE datas e períodos que constem explicitamente no documento. Para fases sem data informada, use 'Verificar no edital' — jamais invente ou estime datas. Classifique cada fase como 'passado', 'ativo' ou 'futuro' com base nas datas reais.",

  documentacao:
    "Você é o agente Lupa Documentação. Liste TODOS os documentos exigidos pelo edital e crie um checklist fiel. Inclua documentos explicitamente mencionados e apenas aqueles que são implicitamente necessários para o tipo de edital — sinalizando claramente quando um documento for inferido e não declarado. Para cada item, informe se é obrigatório conforme o edital.",

  elegibilidade:
    "Você é o agente Lupa Elegibilidade. Analise criteriosamente se o perfil do usuário atende aos critérios do edital. Compare cada requisito do edital com o perfil informado: true (atende), false (não atende) ou 'parcial' (atende parcialmente ou precisa verificar). Não suavize critérios não atendidos. Calcule o score proporcional aos critérios efetivamente atendidos.",
};

// ── Construção de prompts ──────────────────────────────────────────────────
/**
 * Constrói os prompts de sistema e usuário para um agente específico.
 * O SEMANTIC_PRESERVATION_MANDATE é sempre injetado no prompt de sistema,
 * garantindo preservação semântica em todas as análises de editais.
 */
function buildAgentPrompt(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>) {
  const profileInfo =
    profile && agentId === "elegibilidade"
      ? `\n\nPERFIL DO USUÁRIO:\n- Escolaridade: ${profile.escolaridade}\n- Área de atuação: ${profile.atuacao || "não informada"}\n- Município/UF: ${profile.municipio || "não informado"}\n- Renda familiar: ${profile.rendaFamiliar}`
      : "";

  const system = [
    INSTRUCTIONS[agentId],
    "",
    SEMANTIC_PRESERVATION_MANDATE,
    "",
    "Responda SEMPRE em português brasileiro.",
    "Retorne SOMENTE um JSON válido sem markdown, sem blocos de código, sem texto adicional.",
  ].join("\n");

  const user = `Analise o edital abaixo e retorne um JSON com exatamente esta estrutura:\n\n${SCHEMA_EXAMPLES[agentId]}${profileInfo}\n\nEDITAL:\n${text}\n\nResponda APENAS com o JSON válido. Preserve integralmente todos os prazos, critérios, valores e exigências presentes no documento.`;

  return { system, user };
}

// ── Logging de uso ─────────────────────────────────────────────────────────
function buildUsageLogPayload(args: {
  userId?: string | null;
  documentId?: string | null;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}) {
  return {
    user_id: args.userId ?? null,
    document_id: args.documentId ?? null,
    latency_ms: args.latencyMs,
    input_tokens: args.inputTokens ?? null,
    output_tokens: args.outputTokens ?? null,
    total_tokens: args.totalTokens ?? null,
    success: args.success,
    error_message: args.errorMessage ?? null,
  };
}

async function persistUsageLog(args: {
  module: string;
  model: string;
  userId?: string | null;
  documentId?: string | null;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  agentId?: AgentId | null;
  level?: "info" | "warn" | "error";
  message?: string;
}) {
  const payload = {
    module: args.module,
    model: args.model,
    ...buildUsageLogPayload({
      userId: args.userId ?? null,
      documentId: args.documentId ?? null,
      latencyMs: args.latencyMs,
      success: args.success,
      errorMessage: args.errorMessage ?? null,
      inputTokens: args.inputTokens ?? null,
      outputTokens: args.outputTokens ?? null,
      totalTokens: args.totalTokens ?? null,
    }),
  };

  const logContext = {
    module: args.module,
    model: args.model,
    agentId: args.agentId ?? null,
    user_id: args.userId ?? null,
    document_id: args.documentId ?? null,
    latency_ms: args.latencyMs,
    success: args.success,
    error_message: args.errorMessage ?? null,
    total_tokens: args.totalTokens ?? null,
  };

  try {
    if (args.level === "error") {
      logger.error(logContext, args.message ?? "AIService usage log");
    } else if (args.level === "warn") {
      logger.warn(logContext, args.message ?? "AIService usage log");
    } else {
      logger.info(logContext, args.message ?? "AIService usage log");
    }

    const supa = getSupabaseAdmin();
    await supa.from("ai_usage_logs").insert(payload);
  } catch (logErr) {
    logger.warn({ err: logErr instanceof Error ? logErr.message : String(logErr) }, "Failed to persist ai_usage_logs");
  }
}

const VALIDATORS: Record<AgentId, z.ZodTypeAny> = {
  simples: SimplesResponseSchema,
  analista: AnalistaResponseSchema,
  estrategica: EstrategicaResponseSchema,
  acompanhamento: AcompanhamentoResponseSchema,
  documentacao: DocumentacaoResponseSchema,
  elegibilidade: ElegibilidadeResponseSchema,
};

// ── simplifyEdital ─────────────────────────────────────────────────────────
/**
 * Simplifica um edital público em linguagem acessível.
 *
 * PRESERVAÇÃO SEMÂNTICA: o prompt de sistema injeta o SEMANTIC_PRESERVATION_MANDATE,
 * garantindo que a simplificação altere apenas a forma linguística (significante)
 * sem modificar prazos, critérios, valores ou obrigações (significado).
 */
export async function simplifyEdital(
  text: string,
  opts?: { userId?: string | null; documentId?: string | null },
) {
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n\n[Texto truncado para processamento]" : text;

  const systemPrompt = [
    "Você é um especialista em simplificação de documentos públicos brasileiros.",
    "Sua missão é tornar editais públicos acessíveis para toda a população, independentemente do nível de escolaridade.",
    "Responda SEMPRE em português brasileiro com linguagem simples, clara e direta.",
    "Evite jargões jurídicos e técnicos. Se precisar usar um termo técnico, explique-o entre parênteses.",
    "",
    SEMANTIC_PRESERVATION_MANDATE,
  ].join("\n");

  const userPrompt = `Analise o edital a seguir e retorne as informações no formato JSON especificado.

EDITAL:
${truncated}

Retorne um JSON válido com exatamente estes campos:
{
  "resumo": "Resumo claro e direto do edital em 3-5 frases simples — mantendo todos os critérios e condições originais",
  "objetivo": "O que este edital quer alcançar, em uma ou duas frases simples e fiéis ao documento",
  "quemPodeParticipar": "Quem tem direito de participar, de forma clara — sem omitir restrições ou requisitos",
  "prazoInscricao": "Data e hora limite para se inscrever EXATAMENTE como consta no edital (ou 'Não informado' se não constar)",
  "ondeSeInscrever": "Como e onde fazer a inscrição exatamente como consta (site, endereço, etc.) — ou 'Não informado'",
  "principaisRequisitos": "Lista dos principais requisitos exigidos, em linguagem simples mas fiel ao documento — não omita nenhuma exigência",
  "linguagemSimples": "Reescreva os pontos mais importantes do edital em linguagem simples, como se estivesse explicando para alguém que nunca leu um edital. Use frases curtas e diretas. Preserve integralmente prazos, valores, critérios e obrigações — apenas simplifique as palavras."
}

Responda SOMENTE com o JSON, sem markdown, sem código de formatação, sem texto adicional.`;

  const model = getOpenAIModel();
  const start = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      const e = new Error("AI response is not valid JSON");
      (e as any).raw = raw;
      throw e;
    }

    const validated = SimplifyEditalResponse.safeParse(parsed);
    const latency = Date.now() - start;
    const usage = (completion as any)?.usage;
    const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
    const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
    const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

    if (!validated.success) {
      const e = new Error("AI response did not match expected schema");
      (e as any).validation = validated.error.format();
      (e as any).raw = raw;
      throw e;
    }

    await persistUsageLog({
      module: "AIService.simplifyEdital",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: true,
      errorMessage: null,
      inputTokens,
      outputTokens,
      totalTokens,
      level: "info",
      message: "AI simplify request completed",
    });

    return validated.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.simplifyEdital",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: false,
      errorMessage: message,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      level: "error",
      message: "AIService simplify error",
    });

    throw new Error(message);
  }
}

// ── analyzeAgent ───────────────────────────────────────────────────────────
/**
 * Executa um agente de análise de edital (simples, analista, estrategica, etc.).
 *
 * PRESERVAÇÃO SEMÂNTICA: buildAgentPrompt() injeta o SEMANTIC_PRESERVATION_MANDATE
 * no prompt de sistema de todos os agentes, assegurando que nenhuma análise
 * invente informações, altere prazos, modifique critérios ou distorça obrigações
 * presentes no documento original.
 */
export async function analyzeAgent(
  agentId: AgentId,
  text: string,
  profile?: unknown,
  opts?: { userId?: string | null; documentId?: string | null },
) {
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n\n[Texto truncado para processamento]" : text;
  const parsedProfile = AgentUserProfileSchema.safeParse(profile ?? undefined);
  const { system, user } = buildAgentPrompt(agentId, truncated, parsedProfile.success ? parsedProfile.data : undefined);

  const model = getOpenAIModel();
  const start = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      const e = new Error("AI response is not valid JSON");
      (e as any).raw = raw;
      throw e;
    }

    const validator = VALIDATORS[agentId];
    const validated = validator.safeParse(parsed);
    const latency = Date.now() - start;
    const usage = (completion as any)?.usage;
    const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null;
    const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
    const totalTokens = typeof usage?.total_tokens === "number" ? usage.total_tokens : null;

    if (!validated.success) {
      const e = new Error("AI response did not match expected schema");
      (e as any).validation = validated.error.format();
      (e as any).raw = raw;
      await persistUsageLog({
        module: "AIService.analyzeAgent",
        model,
        userId: opts?.userId ?? null,
        documentId: opts?.documentId ?? null,
        latencyMs: latency,
        success: false,
        errorMessage: "validation_failure",
        inputTokens,
        outputTokens,
        totalTokens,
        agentId,
        level: "warn",
        message: "AI response validation failed",
      });

      throw e;
    }

    await persistUsageLog({
      module: "AIService.analyzeAgent",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: true,
      errorMessage: null,
      inputTokens,
      outputTokens,
      totalTokens,
      agentId,
      level: "info",
      message: "AI request completed",
    });

    return validated.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - start;
    await persistUsageLog({
      module: "AIService.analyzeAgent",
      model,
      userId: opts?.userId ?? null,
      documentId: opts?.documentId ?? null,
      latencyMs: latency,
      success: false,
      errorMessage: message,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      agentId,
      level: "error",
      message: "AIService error",
    });

    throw new Error(`AIService error: ${message}`);
  }
}

export default { analyzeAgent };
