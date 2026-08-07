/**
 * @file niasci.ts
 * @description Rotas da API para os módulos NIASci do LUPA Digital.
 *
 * Cada módulo possui uma rota POST que:
 * 1. Valida o corpo da requisição com Zod
 * 2. Delega o processamento ao AIService (nunca chama OpenAI diretamente)
 * 3. Retorna o resultado estruturado como JSON
 * 4. Registra erros com mensagens amigáveis
 *
 * Todas as rotas ficam antes do resourcesRouter no index.ts para evitar
 * conflito com o middleware requireAuth() global do resourcesRouter.
 *
 * Módulos:
 *   POST /niasci/elattes/analyze    — Análise de currículo Lattes
 *   POST /niasci/artigos/analyze    — Análise de artigo científico
 *   POST /niasci/projetos/analyze   — Geração de plano de projeto
 *   POST /niasci/planetario/generate — Conteúdo educativo científico
 *   POST /niasci/chat               — Chat com Assistente IA
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  analyzeLattes,
  analyzeArtigo,
  analyzeProject,
  generatePlanetario,
  chatNiasci,
} from "../lib/aiService";
import { getReqUserId } from "../lib/supabase";
import { classifyAiError } from "../lib/processingErrors";

const router: IRouter = Router();

// ── e-Lattes ─────────────────────────────────────────────────────────────────

/**
 * Schema de validação para a rota de análise do Lattes.
 * O texto deve ter pelo menos 100 caracteres para garantir conteúdo suficiente.
 */
const LatteAnalyzeSchema = z.object({
  text: z.string().min(100, "Texto do currículo muito curto para análise.").max(20000),
});

/**
 * POST /niasci/elattes/analyze
 * Analisa um currículo Lattes e retorna dados estruturados.
 *
 * Corpo: { text: string } — texto extraído do PDF ou colado pelo usuário
 * Resposta: objeto com resumo, timeline, competências, publicações, áreas, sugestões
 */
router.post("/niasci/elattes/analyze", async (req, res): Promise<void> => {
  const parsed = LatteAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Texto inválido." });
    return;
  }

  try {
    const result = await analyzeLattes(parsed.data.text, { userId: getReqUserId(req) });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classification = classifyAiError(message);
    req.log?.error({ error: message, reason: classification.reason }, classification.logMessage ?? "e-Lattes analysis failed");
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

// ── Artigos Científicos ───────────────────────────────────────────────────────

/**
 * Schema de validação para a rota de análise de artigos.
 */
const ArtigoAnalyzeSchema = z.object({
  text: z.string().min(50, "Texto do artigo muito curto.").max(20000),
});

/**
 * POST /niasci/artigos/analyze
 * Analisa um artigo científico e extrai sua estrutura acadêmica completa.
 *
 * Corpo: { text: string } — texto completo do artigo
 * Resposta: objeto com título, tipo, resumo, objetivo, metodologia, resultados, etc.
 */
router.post("/niasci/artigos/analyze", async (req, res): Promise<void> => {
  const parsed = ArtigoAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Texto inválido." });
    return;
  }

  try {
    const result = await analyzeArtigo(parsed.data.text, { userId: getReqUserId(req) });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classification = classifyAiError(message);
    req.log?.error({ error: message, reason: classification.reason }, classification.logMessage ?? "Artigo analysis failed");
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

// ── Projetos ──────────────────────────────────────────────────────────────────

/**
 * Schema de validação para a geração de plano de projeto.
 */
const ProjetoAnalyzeSchema = z.object({
  description: z.string().min(30, "Descreva o projeto com pelo menos 30 caracteres.").max(8000),
});

/**
 * POST /niasci/projetos/analyze
 * Gera um plano de projeto científico completo a partir de uma descrição.
 *
 * Corpo: { description: string } — descrição livre do projeto
 * Resposta: plano completo com objetivos, equipe, cronograma, riscos, etc.
 */
router.post("/niasci/projetos/analyze", async (req, res): Promise<void> => {
  const parsed = ProjetoAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Descrição inválida." });
    return;
  }

  try {
    const result = await analyzeProject(parsed.data.description, { userId: getReqUserId(req) });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classification = classifyAiError(message);
    req.log?.error({ error: message, reason: classification.reason }, classification.logMessage ?? "Projeto analysis failed");
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

// ── Planetário ────────────────────────────────────────────────────────────────

/**
 * Schema de validação para a geração de conteúdo educativo.
 */
const PlanetarioGenerateSchema = z.object({
  topic: z.string().min(3, "Informe um tema com pelo menos 3 caracteres.").max(300),
  audience: z.enum(["criancas", "jovens", "adultos", "geral"]).default("geral"),
});

/**
 * POST /niasci/planetario/generate
 * Gera conteúdo científico educativo adaptado ao público-alvo.
 *
 * Corpo: { topic: string, audience: "criancas"|"jovens"|"adultos"|"geral" }
 * Resposta: roteiro, curiosidades, quiz, slides, glossário e fontes
 */
router.post("/niasci/planetario/generate", async (req, res): Promise<void> => {
  const parsed = PlanetarioGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Dados inválidos." });
    return;
  }

  try {
    const result = await generatePlanetario(
      parsed.data.topic,
      parsed.data.audience,
      { userId: getReqUserId(req) },
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classification = classifyAiError(message);
    req.log?.error({ error: message, reason: classification.reason }, classification.logMessage ?? "Planetario generation failed");
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

// ── Assistente IA ─────────────────────────────────────────────────────────────

import { and, eq } from "drizzle-orm";
import { db, agentResultsTable } from "@workspace/db";

/**
 * Schema de validação para o chat do Assistente IA.
 * Aceita um histórico de mensagens, contexto opcional e historyId opcional.
 * Quando historyId é fornecido (e o usuário autenticado é o dono), o backend
 * busca o result_json salvo no Supabase e constrói um contexto controlado
 * a partir dos fatos consolidados.
 */
const ChatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    }),
  ).min(1).max(30),
  context: z.string().max(8000).optional(),
  historyId: z.coerce.number().int().positive().optional(),
});

/**
 * Constrói contexto estruturado a partir do result_json salvo.
 * Extrai apenas fatos consolidados: cronograma, elegibilidade, checklist,
 * documentos exigidos, interpretação, premiação e tema.
 */
export function buildStructuredContext(resultJson: Record<string, unknown>): string {
  const sections: string[] = [];

  const interp = resultJson.interpretation as Record<string, unknown> | undefined;
  if (interp) {
    const parts: string[] = [];
    if (interp.summary) parts.push(`Resumo: ${interp.summary}`);
    if (interp.objective) parts.push(`Objetivo: ${interp.objective}`);
    if (interp.targetAudience) parts.push(`Público-alvo: ${interp.targetAudience}`);
    if (interp.deadlines) parts.push(`Prazos: ${interp.deadlines}`);
    if (parts.length) sections.push(`## INTERPRETAÇÃO\n${parts.join("\n")}`);
  }

  const cronograma = resultJson.cronograma as Record<string, unknown> | undefined;
  if (cronograma && Array.isArray(cronograma.items)) {
    const items = cronograma.items as Array<Record<string, unknown>>;
    const lines = items.map((item) => {
      const parts = [
        `- ${item.fase}: ${item.periodo}`,
        item.descricao ? `  ${item.descricao}` : "",
        item.vigente === false ? "  [ALTERADO]" : "",
        item.vigente === true ? "  [VIGENTE]" : "",
      ].filter(Boolean);
      return parts.join("\n");
    });
    sections.push(`## CRONOGRAMA\n${lines.join("\n")}`);

    const retificacoes = cronograma.retificacoes as Array<Record<string, unknown>> | undefined;
    if (retificacoes?.length) {
      const retLines = retificacoes.map((r) => `- ${r.campo}: "${r.valorOriginal}" → "${r.valorVigente}"`);
      sections.push(`## RETIFICAÇÕES\n${retLines.join("\n")}`);
    }
  }

  const elegibilidade = resultJson.elegibilidade as Record<string, unknown> | undefined;
  if (elegibilidade && Array.isArray(elegibilidade.criteria)) {
    const criteria = elegibilidade.criteria as Array<Record<string, unknown>>;
    const lines = criteria.map((c) => {
      const atendeVal = c.atende === true ? "atende" : c.atende === false ? "não atende" : `parcialmente: ${c.atende}`;
      return `- ${c.criterio}: ${atendeVal}${c.observacao ? ` (${c.observacao})` : ""}`;
    });
    sections.push(`## ELEGIBILIDADE\n${lines.join("\n")}`);
  }

  const checklist = resultJson.checklist as Record<string, unknown> | undefined;
  if (checklist && Array.isArray(checklist.items)) {
    const items = checklist.items as Array<Record<string, unknown>>;
    const lines = items.map((i) => `- ${i.doc}${i.obrigatorio ? " (obrigatório)" : ""}: ${i.checked ? "✓" : "✗"}${i.observacao ? ` — ${i.observacao}` : ""}`);
    sections.push(`## CHECKLIST DE DOCUMENTOS\n${lines.join("\n")}`);
  }

  const docsExigidos = resultJson.documentosExigidos as Record<string, unknown> | undefined;
  if (docsExigidos && Array.isArray(docsExigidos.items)) {
    const items = docsExigidos.items as Array<Record<string, unknown>>;
    const lines = items.map((i) => `- ${i.nome}${i.obrigatorio ? " (obrigatório)" : ""}`);
    sections.push(`## DOCUMENTOS EXIGIDOS\n${lines.join("\n")}`);
  }

  const premiacao = resultJson.premiacao as Record<string, unknown> | undefined;
  if (premiacao) {
    const parts: string[] = [];
    if (Array.isArray(premiacao.items)) {
      for (const item of premiacao.items as Array<Record<string, unknown>>) {
        parts.push(`- ${item.categoria}: ${item.valor}`);
      }
    }
    if (parts.length) sections.push(`## PREMIAÇÃO\n${parts.join("\n")}`);
  }

  const tema = resultJson.tema as Record<string, unknown> | undefined;
  if (tema?.titulo) sections.push(`## TEMA\n${tema.titulo}`);

  const documento = resultJson.documento as Record<string, unknown> | undefined;
  if (documento) {
    const parts: string[] = [];
    if (documento.titulo) parts.push(`Título: ${documento.titulo}`);
    if (documento.orgao) parts.push(`Órgão: ${documento.orgao}`);
    if (parts.length) sections.push(`## IDENTIFICAÇÃO DO DOCUMENTO\n${parts.join("\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * POST /niasci/chat
 * Processa uma mensagem do chat científico do Assistente IA.
 * Requer autenticação (requireAuth).
 *
 * Quando historyId é fornecido, busca o result_json salvo no Supabase
 * filtrando por id + user_id (owner check). Se o registro não pertencer
 * ao usuário, retorna 404 sem revelar existência.
 *
 * Corpo: { messages: {role, content}[], context?: string, historyId?: number }
 * Resposta: { reply: string } — resposta do assistente
 */
router.post("/niasci/chat", async (req, res): Promise<void> => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados da mensagem inválidos." });
    return;
  }

  const userId = getReqUserId(req);
  let finalContext = parsed.data.context || "";

  if (parsed.data.historyId && userId) {
    try {
      const [row] = await db
        .select()
        .from(agentResultsTable)
        .where(and(
          eq(agentResultsTable.id, parsed.data.historyId),
          eq(agentResultsTable.userId, userId),
        ))
        .limit(1);

      if (!row) {
        // 404 genérico — não revela se o registro existe
        res.status(404).json({ error: "Análise não encontrada." });
        return;
      }

      if (typeof row.resultJson === "object" && row.resultJson !== null) {
        const structuredCtx = buildStructuredContext(row.resultJson as Record<string, unknown>);
        if (structuredCtx) {
          finalContext = `ANÁLISE SALVA DO EDITAL (fonte única de verdade — use APENAS estes fatos):\n\n${structuredCtx}`;
        }
      }
    } catch (err) {
      // Sanitizado: registra apenas requestId e erro genérico
      req.log?.warn({ requestId: (req as any).requestId, historyId: parsed.data.historyId }, "Falha ao carregar contexto do histórico");
    }
  }

  try {
    const reply = await chatNiasci(
      parsed.data.messages,
      finalContext || parsed.data.context,
      { userId },
    );
    res.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classification = classifyAiError(message);
    req.log?.error({ error: classification.reason, requestId: (req as any).requestId }, classification.logMessage ?? "NIASci chat failed");
    if (classification.status === 429) {
      res.status(429).json({ error: classification.userMessage });
      return;
    }
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

export default router;
