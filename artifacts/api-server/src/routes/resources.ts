import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import getSupabaseAdmin, { getReqUserId, requireAuth } from "../lib/supabase";
import { resolveResourceTableName } from "../lib/tableNames";

const router = Router();

// Nota: resolução de nomes de tabela centralizada em `src/lib/tableNames.ts`

// Zod schemas for request validation per table
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

const AiAnalysisSchema = z.object({
  model: z.string().optional(),
  input: z.string().optional(),
  output: z.union([z.record(z.string(), z.unknown()), z.string()]).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const LattesProfileSchema = z.object({
  name: z.string().optional(),
  lattes_xml: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const DocumentSchema = z.object({
  filename: z.string(),
  mime_type: z.string(),
  size: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ChatMessageSchema = z.object({
  conversation_id: z.string().nullable().optional(),
  role: z.enum(["user", "assistant", "system"]).optional(),
  content: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ArticleAnalysisSchema = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ResearchProjectSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  team: z.record(z.string(), z.unknown()).nullable().optional(),
  timeline: z.record(z.string(), z.unknown()).nullable().optional(),
});

const PlanetariumContentSchema = z.object({
  title: z.string().optional(),
  content: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  // The API accepts the canonical resource route name `edital_analyses`.
  // This schema entry ensures payload validation for the canonical resource.
  edital_analyses: EdtalAnalysisSchema,
  ai_analyses: AiAnalysisSchema,
  lattes_profiles: LattesProfileSchema,
  documents: DocumentSchema,
  article_analyses: ArticleAnalysisSchema,
  research_projects: ResearchProjectSchema,
  planetarium_contents: PlanetariumContentSchema,
  chat_messages: ChatMessageSchema,
};

/**
 * O roteador `/resources` fornece um CRUD genérico protegido que mapeia
 * rotas públicas para operações em tabelas de usuário.
 *
 * Segurança: todas as rotas deste roteador exigem autenticação explícita.
 */
router.use(requireAuth());

// List records for authenticated user
router.get("/resources/:table", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const tableName = resolveResourceTableName(String(table));
  if (!tableName) {
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
    const { data, error } = await supabase.from(tableName).select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, userId }, "resource:list:error");
    res.status(500).json({ error: "Falha ao listar recursos." });
  }
});

// Create record (user_id will be set server-side)
router.post("/resources/:table", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const tableName = resolveResourceTableName(String(table));
  if (!tableName) {
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
    const schema = SCHEMAS[tableName];
    if (schema) {
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Payload inválido", details: parsed.error.format() });
        return;
      }
    }
    const payload = { ...rawPayload, user_id: userId };
    const { data, error } = await supabase.from(tableName).insert([payload]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, userId }, "resource:create:error");
    res.status(500).json({ error: "Falha ao criar recurso." });
  }
});

// Get single record (must belong to user)
router.get("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const rawId = req.params.id;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const tableName = resolveResourceTableName(String(table));
  if (!tableName) {
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
    const { data, error } = await supabase.from(tableName).select("*").eq("id", id).eq("user_id", userId).single();
    if (error) {
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

// Update record (only owner)
router.put("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const rawId = req.params.id;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const tableName = resolveResourceTableName(String(table));
  if (!tableName) {
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
    const schema = SCHEMAS[tableName];
    if (schema) {
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Payload inválido", details: parsed.error.format() });
        return;
      }
    }
    const { data, error } = await supabase.from(tableName).update(rawPayload).match({ id, user_id: userId }).select().single();
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

// Delete record (only owner)
router.delete("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const rawTable = req.params.table;
  const rawId = req.params.id;
  const table = Array.isArray(rawTable) ? rawTable[0] : rawTable;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const tableName = resolveResourceTableName(String(table));
  if (!tableName) {
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
    const { error } = await supabase.from(tableName).delete().match({ id, user_id: userId });
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, id, userId }, "resource:delete:error");
    res.status(500).json({ error: "Falha ao deletar recurso." });
  }
});

export default router;
