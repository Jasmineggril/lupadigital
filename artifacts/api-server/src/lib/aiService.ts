import { openai, getOpenAIModel } from "@workspace/integrations-openai-ai-server";
import { SimplifyEditalResponse } from "@workspace/api-zod";
import { z } from "zod";
import { logger } from "./logger";
import { getSupabaseAdmin } from "./supabase";

export type AgentId = "simples" | "analista" | "estrategica" | "acompanhamento" | "documentacao" | "elegibilidade";

export const AgentUserProfileSchema = z.object({
  escolaridade: z.string().default("superior"),
  atuacao: z.string().default("") ,
  municipio: z.string().default("") ,
  rendaFamiliar: z.string().default("1a3"),
});

export const AgentAnalyzeBodySchema = z.object({
  agentId: z.enum(["simples", "analista", "estrategica", "acompanhamento", "documentacao", "elegibilidade"]),
  text: z.string().min(10),
  profile: AgentUserProfileSchema.optional(),
});

// Response validators (centralized)
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

const SCHEMA_EXAMPLES: Record<AgentId, string> = {
  simples: `{
  "type": "simples",
  "scoreOportunidade": 72,
  "categoria": "Classificação do edital (ex: Bolsa de Estudo, Pesquisa Científica, Concurso Público, Inovação, Fomento, Licitação, Processo Seletivo, Chamamento Público)",
  "resumo": "Resumo em 3-4 frases simples que qualquer pessoa entenda, sem jargão técnico",
  "objetivo": "O objetivo principal do edital em 1-2 frases diretas",
  "publicoAlvo": "Quem pode participar, de forma clara e objetiva",
  "prazo": "Data limite de inscrição ou período de inscrições (ou 'Não informado' se não constar)",
  "requisitos": ["Requisito principal 1", "Requisito principal 2", "Requisito principal 3"],
  "ondeInscrever": "Como e onde fazer a inscrição: site, endereço, portal",
  "observacao": "Uma dica importante e prática para o candidato sobre este edital específico"
}`,
  analista: `{
  "type": "analista",
  "tipoEdital": "Tipo do edital (ex: Concurso Público, Concessão de Bolsa, Licitação, Fomento, Processo Seletivo, Chamamento Público)",
  "instituicao": "Nome completo da instituição ou órgão responsável pelo edital",
  "prazo": "Todas as datas e prazos identificados separados por ' | '",
  "publicoAlvo": "Descrição precisa do público-alvo do edital",
  "requisitos": ["Requisito 1", "Requisito 2", "Requisito 3"],
  "documentos": ["Documento 1", "Documento 2", "Documento 3"],
  "valor": "Valor da bolsa, prêmio, financiamento ou benefício (ou 'Não especificado')"
}`,
  estrategica: `{
  "type": "estrategica",
  "score": 75,
  "oportunidade": "Parágrafo de 2-3 frases descrevendo a oportunidade e seu potencial para o público-alvo",
  "vantagens": ["Vantagem 1", "Vantagem 2", "Vantagem 3", "Vantagem 4"],
  "pontosAtencao": ["Ponto de atenção 1", "Ponto de atenção 2", "Ponto de atenção 3"],
  "riscos": ["Risco 1", "Risco 2"],
  "recomendacao": "Recomendação estratégica clara e acionável para o candidato"
}`,
  acompanhamento: `{
  "type": "acompanhamento",
  "timeline": [
    {"fase": "📢 Publicação do Edital", "periodo": "data ou período", "descricao": "descrição", "status": "passado"},
    {"fase": "📝 Período de Inscrições", "periodo": "data ou período", "descricao": "descrição", "status": "ativo"},
    {"fase": "📋 Análise / Seleção", "periodo": "data ou período", "descricao": "descrição", "status": "futuro"},
    {"fase": "📣 Resultado Preliminar", "periodo": "data ou período", "descricao": "descrição", "status": "futuro"},
    {"fase": "✉️ Prazo para Recurso", "periodo": "data ou período", "descricao": "descrição", "status": "futuro"},
    {"fase": "🏆 Resultado Final", "periodo": "data ou período", "descricao": "descrição", "status": "futuro"}
  ],
  "observacao": "Observação importante sobre os prazos ou sobre como interpretar o cronograma"
}`,
  documentacao: `{
  "type": "documentacao",
  "checklist": [
    {"doc": "Nome do documento", "obrigatorio": true, "observacao": "Onde obter ou como preparar", "checked": false}
  ],
  "dica": "Dica prática sobre como organizar e entregar a documentação"
}`,
  elegibilidade: `{
  "type": "elegibilidade",
  "score": 75,
  "criterios": [
    {"criterio": "Nome do critério", "atende": true, "observacao": "Explicação sobre o critério"}
  ],
  "recomendacao": "Recomendação personalizada baseada no perfil informado",
  "proximosPassos": ["Passo 1", "Passo 2", "Passo 3", "Passo 4"]
}`,
};

const INSTRUCTIONS: Record<AgentId, string> = {
  simples: "Você é o agente Lupa Simples. Crie um resumo curto e acessível do edital em linguagem simples, direta e sem jargão técnico, para que qualquer cidadão possa entender.",
  analista: "Você é o agente Lupa Analista. Extraia e organize os indicadores-chave do edital com precisão: tipo, instituição, prazos, público-alvo, requisitos, documentos exigidos e valor do benefício.",
  estrategica: "Você é o agente Lupa Estratégica, um consultor estratégico especializado em editais públicos. Avalie se o edital representa uma boa oportunidade (score 0-100 refletindo qualidade, clareza, benefício e acessibilidade), identifique vantagens, pontos de atenção, riscos e dê uma recomendação acionável.",
  acompanhamento: "Você é o agente Lupa Acompanhamento. Construa uma linha do tempo completa com todas as fases do edital. Se as datas não estiverem explícitas, estime com base em padrões comuns de editais públicos e indique 'Verificar no edital'. Classifique cada fase como 'passado', 'ativo' ou 'futuro' baseando-se na data mais provável de publicação.",
  documentacao: "Você é o agente Lupa Documentação. Liste TODOS os documentos exigidos pelo edital e crie um checklist detalhado e prático. Inclua documentos explícitos e também os implicitamente necessários para o tipo de edital. Para cada documento, informe se é obrigatório e como obtê-lo ou prepará-lo.",
  elegibilidade: `Você é o agente Lupa Elegibilidade. Analise criteriosamente se o perfil do usuário atende aos critérios do edital. Compare cada requisito do edital com o perfil informado e determine: true (atende), false (não atende) ou "parcial" (atende parcialmente ou precisa verificar). Calcule um score de aderência (0-100) proporcional aos critérios atendidos.`,
};

function buildAgentPrompt(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>) {
  const profileInfo = profile && agentId === "elegibilidade"
    ? `\n\nPERFIL DO USUÁRIO:\n- Escolaridade: ${profile.escolaridade}\n- Área de atuação: ${profile.atuacao || "não informada"}\n- Município/UF: ${profile.municipio || "não informado"}\n- Renda familiar: ${profile.rendaFamiliar}`
    : "";

  const system = `${INSTRUCTIONS[agentId]}\nResponda SEMPRE em português brasileiro.\nRetorne SOMENTE um JSON válido sem markdown, sem blocos de código, sem texto adicional.`;
  const user = `Analise o edital abaixo e retorne um JSON com exatamente esta estrutura:\n\n${SCHEMA_EXAMPLES[agentId]}${profileInfo}\n\nEDITAL:\n${text}\n\nResponda APENAS com o JSON válido.`;

  return { system, user };
}

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

export async function simplifyEdital(
  text: string,
  opts?: { userId?: string | null; documentId?: string | null },
) {
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n\n[Texto truncado para processamento]" : text;
  const systemPrompt = `Você é um especialista em simplificação de documentos públicos brasileiros.
Sua missão é tornar editais públicos acessíveis para toda a população, independentemente do nível de escolaridade.
Responda SEMPRE em português brasileiro com linguagem simples, clara e direta.
Evite jargões jurídicos e técnicos. Se precisar usar um termo técnico, explique-o.`;

  const userPrompt = `Analise o edital a seguir e retorne as informações no formato JSON especificado.

EDITAL:
${truncated}

Retorne um JSON válido com exatamente estes campos:
{
  "resumo": "Resumo claro e direto do edital em 3-5 frases simples",
  "objetivo": "O que este edital quer alcançar, em uma ou duas frases simples",
  "quemPodeParticipar": "Quem tem direito de participar, de forma clara e direta",
  "prazoInscricao": "Data e hora limite para se inscrever (ou 'Não informado' se não constar)",
  "ondeSeInscrever": "Como e onde fazer a inscrição (site, endereço, etc.) — ou 'Não informado'",
  "principaisRequisitos": "Lista dos principais requisitos exigidos, em linguagem simples",
  "linguagemSimples": "Reescreva os pontos mais importantes do edital inteiro em linguagem simples, como se estivesse explicando para alguém que nunca leu um edital antes. Use frases curtas e diretas."
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
      // Log failure
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
