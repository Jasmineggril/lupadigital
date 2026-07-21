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

/**
 * Schema de validação para o chat do Assistente IA.
 * Aceita um histórico de mensagens e contexto opcional de outros módulos.
 */
const ChatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    }),
  ).min(1).max(30),
  context: z.string().max(4000).optional(),
});

/**
 * POST /niasci/chat
 * Processa uma mensagem do chat científico do Assistente IA.
 *
 * Corpo: { messages: {role, content}[], context?: string }
 * Resposta: { reply: string } — resposta do assistente
 */
router.post("/niasci/chat", async (req, res): Promise<void> => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados da mensagem inválidos." });
    return;
  }

  try {
    const reply = await chatNiasci(
      parsed.data.messages,
      parsed.data.context,
      { userId: getReqUserId(req) },
    );
    res.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const classification = classifyAiError(message);
    req.log?.error({ error: message, reason: classification.reason }, classification.logMessage ?? "NIASci chat failed");
    if (classification.status === 429) {
      res.status(429).json({ error: classification.userMessage });
      return;
    }
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

export default router;
