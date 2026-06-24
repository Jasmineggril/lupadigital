import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import * as cheerio from "cheerio";
import { z } from "zod";
import multer from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, savedEditalsTable, agentResultsTable, sharedResultsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import {
  SimplifyEditalBody,
  SimplifyEditalResponse,
  SaveEditalBody,
  DeleteEditalParams,
  ListEditalHistoryResponse,
  ExtractEditalFromUrlBody,
} from "@workspace/api-zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Apenas arquivos PDF são aceitos"));
  },
});

// ── Inline schemas for /edital/analyze (discriminated union, not codegen) ──

const AgentUserProfileSchema = z.object({
  escolaridade: z.string().default("superior"),
  atuacao: z.string().default(""),
  municipio: z.string().default(""),
  rendaFamiliar: z.string().default("1a3"),
});

const AgentAnalyzeBodySchema = z.object({
  agentId: z.enum(["simples", "analista", "estrategica", "acompanhamento", "documentacao", "elegibilidade"]),
  text: z.string().min(10),
  profile: AgentUserProfileSchema.optional(),
});

const SimplesResponseSchema = z.object({
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

const AnalistaResponseSchema = z.object({
  type: z.literal("analista"),
  tipoEdital: z.string(),
  instituicao: z.string(),
  prazo: z.string(),
  publicoAlvo: z.string(),
  requisitos: z.array(z.string()),
  documentos: z.array(z.string()),
  valor: z.string(),
});

const EstrategicaResponseSchema = z.object({
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

const AcompanhamentoResponseSchema = z.object({
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

const DocumentacaoResponseSchema = z.object({
  type: z.literal("documentacao"),
  checklist: z.array(ChecklistItemSchema),
  dica: z.string(),
});

const ElegibilidadeCriterioSchema = z.object({
  criterio: z.string(),
  atende: z.union([z.boolean(), z.literal("parcial")]),
  observacao: z.string(),
});

const ElegibilidadeResponseSchema = z.object({
  type: z.literal("elegibilidade"),
  score: z.number().int().min(0).max(100),
  criterios: z.array(ElegibilidadeCriterioSchema),
  recomendacao: z.string(),
  proximosPassos: z.array(z.string()),
});

type AgentId = z.infer<typeof AgentAnalyzeBodySchema>["agentId"];

function buildAgentPrompt(agentId: AgentId, text: string, profile?: z.infer<typeof AgentUserProfileSchema>): { system: string; user: string } {
  const profileInfo = profile && agentId === "elegibilidade"
    ? `\n\nPERFIL DO USUÁRIO:\n- Escolaridade: ${profile.escolaridade}\n- Área de atuação: ${profile.atuacao || "não informada"}\n- Município/UF: ${profile.municipio || "não informado"}\n- Renda familiar: ${profile.rendaFamiliar}`
    : "";

  const schemas: Record<AgentId, string> = {
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

  const instructions: Record<AgentId, string> = {
    simples: "Você é o agente Lupa Simples. Crie um resumo curto e acessível do edital em linguagem simples, direta e sem jargão técnico, para que qualquer cidadão possa entender.",
    analista: "Você é o agente Lupa Analista. Extraia e organize os indicadores-chave do edital com precisão: tipo, instituição, prazos, público-alvo, requisitos, documentos exigidos e valor do benefício.",
    estrategica: "Você é o agente Lupa Estratégica, um consultor estratégico especializado em editais públicos. Avalie se o edital representa uma boa oportunidade (score 0-100 refletindo qualidade, clareza, benefício e acessibilidade), identifique vantagens, pontos de atenção, riscos e dê uma recomendação acionável.",
    acompanhamento: "Você é o agente Lupa Acompanhamento. Construa uma linha do tempo completa com todas as fases do edital. Se as datas não estiverem explícitas, estime com base em padrões comuns de editais públicos e indique 'Verificar no edital'. Classifique cada fase como 'passado', 'ativo' ou 'futuro' baseando-se na data mais provável de publicação.",
    documentacao: "Você é o agente Lupa Documentação. Liste TODOS os documentos exigidos pelo edital e crie um checklist detalhado e prático. Inclua documentos explícitos e também os implicitamente necessários para o tipo de edital. Para cada documento, informe se é obrigatório e como obtê-lo ou prepará-lo.",
    elegibilidade: `Você é o agente Lupa Elegibilidade. Analise criteriosamente se o perfil do usuário atende aos critérios do edital. Compare cada requisito do edital com o perfil informado e determine: true (atende), false (não atende) ou "parcial" (atende parcialmente ou precisa verificar). Calcule um score de aderência (0-100) proporcional aos critérios atendidos.`,
  };

  return {
    system: `${instructions[agentId]}\nResponda SEMPRE em português brasileiro.\nRetorne SOMENTE um JSON válido sem markdown, sem blocos de código, sem texto adicional.`,
    user: `Analise o edital abaixo e retorne um JSON com exatamente esta estrutura:\n\n${schemas[agentId]}${profileInfo}\n\nEDITAL:\n${text}\n\nResponda APENAS com o JSON válido.`,
  };
}

const router: IRouter = Router();

router.post("/edital/analyze", async (req, res): Promise<void> => {
  const parsed = AgentAnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, text, profile } = parsed.data;

  // Truncate to ~12 000 chars to stay within token budget
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n\n[Texto truncado para processamento]" : text;

  const { system, user } = buildAgentPrompt(agentId, truncated, profile);

  const completion = await openai.chat.completions.create({
    model: "gpt-5.1",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  // Strip any markdown code fences the model may have added despite instructions
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    req.log.error({ raw }, "Failed to parse AI agent response as JSON");
    res.status(500).json({ error: "Falha ao processar a resposta da IA. Tente novamente." });
    return;
  }

  // Validate per-agent schema
  const validators: Record<AgentId, z.ZodTypeAny> = {
    simples: SimplesResponseSchema,
    analista: AnalistaResponseSchema,
    estrategica: EstrategicaResponseSchema,
    acompanhamento: AcompanhamentoResponseSchema,
    documentacao: DocumentacaoResponseSchema,
    elegibilidade: ElegibilidadeResponseSchema,
  };

  const validated = validators[agentId].safeParse(parsedJson);
  if (!validated.success) {
    req.log.error({ errors: validated.error.message, parsedJson }, "Agent AI response does not match schema");
    res.status(500).json({ error: "Resposta da IA em formato inesperado. Tente novamente." });
    return;
  }

  res.json(validated.data);
});

// ── Agent history routes ─────────────────────────────────────────

const SaveAgentResultBodySchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1).max(200),
  originalText: z.string().min(1),
  resultJson: z.record(z.string(), z.unknown()),
});

const DeleteAgentResultParamsSchema = z.object({ id: z.coerce.number().int().positive() });

router.get("/edital/agent-history", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(agentResultsTable)
    .orderBy(desc(agentResultsTable.createdAt));
  res.json(rows);
});

router.post("/edital/agent-history", async (req, res): Promise<void> => {
  const parsed = SaveAgentResultBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [saved] = await db
    .insert(agentResultsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(saved);
});

router.delete("/edital/agent-history/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentResultParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(agentResultsTable)
    .where(eq(agentResultsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Análise não encontrada." });
    return;
  }

  res.sendStatus(204);
});

router.post("/edital/extract-url", async (req, res): Promise<void> => {
  const parsed = ExtractEditalFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;

  let fetchedUrl = url;
  if (!/^https?:\/\//i.test(url)) {
    fetchedUrl = `https://${url}`;
  }

  let html: string;
  try {
    const response = await fetch(fetchedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LupaPublicaIA/1.0; +https://lupapublica.replit.app)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      res.status(422).json({ error: `Não foi possível acessar a URL (status ${response.status}). Verifique se ela é pública e tente novamente.` });
      return;
    }

    html = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ url: fetchedUrl, message }, "Failed to fetch URL");
    res.status(422).json({ error: "Não foi possível acessar a URL. Verifique se ela está correta e disponível." });
    return;
  }

  const $ = cheerio.load(html);

  // Remove elements that don't contain useful content
  $("script, style, nav, header, footer, aside, iframe, noscript, [aria-hidden='true']").remove();
  $("[class*='menu'], [class*='nav'], [class*='sidebar'], [class*='cookie'], [class*='banner'], [class*='popup']").remove();
  $("[id*='menu'], [id*='nav'], [id*='sidebar'], [id*='cookie'], [id*='banner']").remove();

  const title = $("title").text().trim() || $("h1").first().text().trim() || "";

  // Try to get the main content first, fallback to body
  const mainSelectors = ["main", "article", "[role='main']", ".content", "#content", ".post-content", ".entry-content", ".page-content", ".edital", "#edital"];
  let textContent = "";

  for (const selector of mainSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      textContent = el.text();
      break;
    }
  }

  if (!textContent || textContent.trim().length < 200) {
    textContent = $("body").text();
  }

  // Clean up whitespace
  const cleanedText = textContent
    .replace(/\t/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanedText || cleanedText.length < 100) {
    res.status(422).json({ error: "Não foi possível extrair texto útil desta página. Tente copiar e colar o texto manualmente." });
    return;
  }

  // Limit to 50,000 chars to avoid overloading the AI
  const truncated = cleanedText.length > 50000 ? cleanedText.slice(0, 50000) + "\n\n[Texto truncado para processamento]" : cleanedText;

  res.json({ text: truncated, title });
});

router.post("/edital/simplify", async (req, res): Promise<void> => {
  const parsed = SimplifyEditalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text } = parsed.data;

  const systemPrompt = `Você é um especialista em simplificação de documentos públicos brasileiros.
Sua missão é tornar editais públicos acessíveis para toda a população, independentemente do nível de escolaridade.
Responda SEMPRE em português brasileiro com linguagem simples, clara e direta.
Evite jargões jurídicos e técnicos. Se precisar usar um termo técnico, explique-o.`;

  const userPrompt = `Analise o edital a seguir e retorne as informações no formato JSON especificado.

EDITAL:
${text}

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

  const completion = await openai.chat.completions.create({
    model: "gpt-5.1",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    req.log.error({ content }, "Failed to parse AI response as JSON");
    res.status(500).json({ error: "Falha ao processar a resposta da IA. Tente novamente." });
    return;
  }

  const validated = SimplifyEditalResponse.safeParse(parsedJson);
  if (!validated.success) {
    req.log.error({ errors: validated.error.message, parsedJson }, "AI response does not match expected schema");
    res.status(500).json({ error: "Resposta da IA em formato inesperado. Tente novamente." });
    return;
  }

  res.json(validated.data);
});

router.get("/edital/history", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(savedEditalsTable)
    .orderBy(desc(savedEditalsTable.createdAt));

  res.json(ListEditalHistoryResponse.parse(rows));
});

router.post("/edital/history", async (req, res): Promise<void> => {
  const parsed = SaveEditalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [saved] = await db
    .insert(savedEditalsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(saved);
});

router.delete("/edital/history/:id", async (req, res): Promise<void> => {
  const params = DeleteEditalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(savedEditalsTable)
    .where(eq(savedEditalsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Edital não encontrado." });
    return;
  }

  res.sendStatus(204);
});

// ── POST /edital/share — create a share link ──────────────────────
const ShareBodySchema = z.object({
  agentId: z.string(),
  title: z.string(),
  resultJson: z.record(z.string(), z.unknown()),
});

router.post("/share", async (req, res) => {
  const parsed = ShareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { agentId, title, resultJson } = parsed.data;
  const token = randomUUID();
  await db.insert(sharedResultsTable).values({ token, agentId, title, resultJson });
  res.status(201).json({ token });
});

// ── GET /edital/share/:token — retrieve shared result ─────────────
router.get("/share/:token", async (req, res) => {
  const { token } = req.params;
  const rows = await db
    .select()
    .from(sharedResultsTable)
    .where(eq(sharedResultsTable.token, token))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Link não encontrado ou expirado." });
    return;
  }
  res.json(rows[0]);
});

export default router;
