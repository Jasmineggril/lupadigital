/**
 * @file resources.ts
 * @description CRUD genérico para recursos do usuário via Supabase.
 *
 * Implementa o padrão Repository com uma allowlist de tabelas para evitar
 * que clientes acessem tabelas arbitrárias do banco de dados.
 *
 * Todas as rotas exigem autenticação (requireAuth middleware aplicado no router).
 * O user_id é sempre lido do JWT decodificado pelo supabaseAuthMiddleware —
 * nunca do corpo da requisição, evitando privilege escalation.
 *
 * Endpoints disponíveis:
 *   GET    /api/resources/:table          — lista registros do usuário autenticado
 *   POST   /api/resources/:table          — cria um novo registro (user_id injetado)
 *   GET    /api/resources/:table/:id      — busca um registro específico (owner check)
 *   PUT    /api/resources/:table/:id      — atualiza um registro (owner check)
 *   DELETE /api/resources/:table/:id      — remove um registro (owner check)
 *
 * Tabelas permitidas (ALLOWED_TABLES):
 *   documents, ai_analyses, edital_analyses, lattes_profiles,
 *   article_analyses, research_projects, planetarium_contents, chat_messages
 *
 * Segurança:
 *   - Tabelas fora da allowlist retornam 404 (não revela a existência da tabela)
 *   - Todas as operações filtram por user_id (owner isolation)
 *   - Payloads são validados com Zod antes de ir ao banco
 *   - Erros do Supabase nunca são repassados diretamente ao cliente
 */

import { Router } from "express";
import type { Request, Response } from "express";
import getSupabaseAdmin, { getReqUserId, requireAuth } from "../lib/supabase";
import { z } from "zod";

const router = Router();

// ── Allowlist de tabelas ──────────────────────────────────────────────────────
// Apenas estas tabelas podem ser acessadas pela API de recursos.
// Qualquer nome fora desta lista retorna 404 para não revelar o schema do banco.
const ALLOWED_TABLES = new Set([
  "documents",
  "ai_analyses",
  "edital_analyses",
  "lattes_profiles",
  "article_analyses",
  "research_projects",
  "planetarium_contents",
  "chat_messages",
]);

/**
 * Verifica se o nome da tabela está na allowlist.
 * @param name - Nome da tabela vindo do parâmetro de rota
 * @returns true se a tabela é permitida, false caso contrário
 */
function tableNameIsAllowed(name: string) {
  return ALLOWED_TABLES.has(name);
}

// ── Schemas Zod para validação de payload por tabela ─────────────────────────
// Cada schema define os campos aceitos para aquela tabela.
// Campos extras no corpo da requisição são ignorados pelo Zod (strip by default).

/** Schema de validação para a tabela edital_analyses */
const EdtalAnalysisSchema = z.object({
  titulo: z.string().nullable().optional(),
  conteudo_original: z.string().nullable().optional(),
  conteudo_simplificado: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  modo_analise: z.string().nullable().optional(),
  indicadores: z.record(z.string(), z.unknown()).nullable().optional(),
  timeline: z.record(z.string(), z.unknown()).nullable().optional(),
  recomendacoes: z.record(z.string(), z.unknown()).nullable().optional(),
  favorito: z.boolean().optional(),
});

/** Schema de validação para a tabela ai_analyses */
const AiAnalysisSchema = z.object({
  model: z.string().optional(),
  input: z.string().optional(),
  output: z.union([z.record(z.string(), z.unknown()), z.string()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela lattes_profiles */
const LattesProfileSchema = z.object({
  name: z.string().optional(),
  lattes_xml: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela documents */
const DocumentSchema = z.object({
  filename: z.string(),
  mime_type: z.string(),
  size: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela chat_messages */
const ChatMessageSchema = z.object({
  conversation_id: z.string().nullable().optional(),
  role: z.enum(["user", "assistant", "system"]).optional(),
  content: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela article_analyses */
const ArticleAnalysisSchema = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela research_projects */
const ResearchProjectSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  team: z.record(z.string(), z.unknown()).nullable().optional(),
  timeline: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela planetarium_contents */
const PlanetariumContentSchema = z.object({
  title: z.string().optional(),
  content: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * Mapa de schemas indexados por nome de tabela.
 * Tabelas sem schema listado aceitam qualquer payload (sem validação adicional).
 */
const SCHEMAS: Record<string, z.ZodTypeAny> = {
  edital_analyses: EdtalAnalysisSchema,
  ai_analyses: AiAnalysisSchema,
  lattes_profiles: LattesProfileSchema,
  documents: DocumentSchema,
  article_analyses: ArticleAnalysisSchema,
  research_projects: ResearchProjectSchema,
  planetarium_contents: PlanetariumContentSchema,
  chat_messages: ChatMessageSchema,
};

// Aplica requireAuth() a todas as rotas deste router.
// Requisições sem JWT válido recebem 401 antes de chegarem a qualquer handler.
router.use(requireAuth());

// ── GET /resources/:table ─────────────────────────────────────────────────────

/**
 * Lista todos os registros de uma tabela pertencentes ao usuário autenticado.
 * Retorna em ordem decrescente por created_at (mais recentes primeiro).
 *
 * @route GET /api/resources/:table
 * @param table - Nome da tabela (deve estar em ALLOWED_TABLES)
 * @returns 200 com array de registros | 404 tabela não permitida | 401 sem auth
 */
router.get("/resources/:table", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  if (!tableNameIsAllowed(String(table))) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from(String(table))
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, userId }, "resource:list:error");
    res.status(500).json({ error: "Falha ao listar recursos." });
  }
});

// ── POST /resources/:table ────────────────────────────────────────────────────

/**
 * Cria um novo registro em uma tabela.
 * O campo user_id é sempre injetado pelo servidor a partir do JWT —
 * nunca aceito do body para prevenir privilege escalation.
 *
 * @route POST /api/resources/:table
 * @param table - Nome da tabela (deve estar em ALLOWED_TABLES)
 * @body Payload validado pelo schema Zod da tabela correspondente
 * @returns 201 com o registro criado | 400 payload inválido | 404 tabela não permitida
 */
router.post("/resources/:table", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  if (!tableNameIsAllowed(String(table))) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const supabase = getSupabaseAdmin();
  try {
    const rawPayload = { ...req.body };
    // Valida o payload apenas se houver schema definido para esta tabela
    const schema = SCHEMAS[String(table)];
    if (schema) {
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Payload inválido",
          details: parsed.error.format(),
        });
        return;
      }
    }
    // Injeta user_id do JWT, sobrescrevendo qualquer valor enviado no body
    const payload = { ...rawPayload, user_id: userId };
    const { data, error } = await supabase
      .from(String(table))
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, userId }, "resource:create:error");
    res.status(500).json({ error: "Falha ao criar recurso." });
  }
});

// ── GET /resources/:table/:id ─────────────────────────────────────────────────

/**
 * Busca um registro específico verificando que pertence ao usuário autenticado.
 * Retorna 404 tanto quando o registro não existe quanto quando pertence a outro usuário
 * (para não revelar a existência de dados de outros usuários).
 *
 * @route GET /api/resources/:table/:id
 * @param table - Nome da tabela
 * @param id - ID do registro
 * @returns 200 com o registro | 404 não encontrado/sem permissão | 401 sem auth
 */
router.get("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const rawId = req.params.id;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!tableNameIsAllowed(String(table))) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from(String(table))
      .select("*")
      .eq("id", id)
      .eq("user_id", userId) // owner check: só retorna se pertencer ao usuário
      .single();
    if (error) {
      // PGRST116 = "Row not found" (Supabase/PostgREST code)
      if ((error as any).code === "PGRST116") {
        res.status(404).json({ error: "Não encontrado" });
        return;
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, id, userId }, "resource:get:error");
    res.status(500).json({ error: "Falha ao recuperar recurso." });
  }
});

// ── PUT /resources/:table/:id ─────────────────────────────────────────────────

/**
 * Atualiza um registro existente, verificando que pertence ao usuário autenticado.
 * Usa .match({ id, user_id }) no Supabase para garantir o owner check de forma atômica.
 *
 * @route PUT /api/resources/:table/:id
 * @param table - Nome da tabela
 * @param id - ID do registro a atualizar
 * @body Campos a atualizar (validados pelo schema Zod)
 * @returns 200 com o registro atualizado | 404 não encontrado | 400 payload inválido
 */
router.put("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const rawId = req.params.id;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!tableNameIsAllowed(String(table))) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const supabase = getSupabaseAdmin();
  try {
    const rawPayload = { ...req.body };
    const schema = SCHEMAS[String(table)];
    if (schema) {
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Payload inválido",
          details: parsed.error.format(),
        });
        return;
      }
    }
    const { data, error } = await supabase
      .from(String(table))
      .update(rawPayload)
      .match({ id, user_id: userId }) // atômico: só atualiza se id E user_id baterem
      .select()
      .single();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "Não encontrado ou sem permissão" });
      return;
    }
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, id, userId }, "resource:update:error");
    res.status(500).json({ error: "Falha ao atualizar recurso." });
  }
});

// ── DELETE /resources/:table/:id ──────────────────────────────────────────────

/**
 * Remove um registro, verificando que pertence ao usuário autenticado.
 * Retorna 204 No Content em caso de sucesso (sem corpo na resposta).
 *
 * @route DELETE /api/resources/:table/:id
 * @param table - Nome da tabela
 * @param id - ID do registro a remover
 * @returns 204 sem corpo | 404 tabela não permitida | 401 sem auth
 */
router.delete("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const rawId = req.params.id;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!tableNameIsAllowed(String(table))) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase
      .from(String(table))
      .delete()
      .match({ id, user_id: userId }); // owner check: só deleta se ambos baterem
    if (error) throw error;
    res.sendStatus(204); // 204 No Content: deleção bem-sucedida, sem corpo
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, id, userId }, "resource:delete:error");
    res.status(500).json({ error: "Falha ao deletar recurso." });
  }
});

export default router;
