import { Router } from "express";
import type { Request, Response } from "express";
import getSupabaseAdmin, { requireAuth } from "../lib/supabase";
import { z } from "zod";

const router = Router();

// Allowed tables and which operations to permit (basic CRUD)
const ALLOWED_TABLES = new Set([
  "documents",
  "ai_analyses",
  "edital_analises",
  "lattes_profiles",
  "article_analyses",
  "chat_messages",
]);

function tableNameIsAllowed(name: string) {
  return ALLOWED_TABLES.has(name);
}

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

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  edital_analises: EdtalAnalysisSchema,
  ai_analyses: AiAnalysisSchema,
  lattes_profiles: LattesProfileSchema,
  documents: DocumentSchema,
  chat_messages: ChatMessageSchema,
};

// Ensure authenticated for all resource routes
router.use(requireAuth());

// List records for authenticated user
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
    const { data, error } = await supabase.from(String(table)).select("*").eq("user_id", userId).order("created_at", { ascending: false });
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
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Payload inválido", details: parsed.error.format() });
        return;
      }
    }
    const payload = { ...rawPayload, user_id: userId };
    const { data, error } = await supabase.from(String(table)).insert([payload]).select().single();
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
    const { data, error } = await supabase.from(String(table)).select("*").eq("id", id).eq("user_id", userId).single();
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
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Payload inválido", details: parsed.error.format() });
        return;
      }
    }
    const { data, error } = await supabase.from(String(table)).update(rawPayload).match({ id, user_id: userId }).select().single();
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
    const { error } = await supabase.from(String(table)).delete().match({ id, user_id: userId });
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log?.error({ error: message, table, id, userId }, "resource:delete:error");
    res.status(500).json({ error: "Falha ao deletar recurso." });
  }
});

export default router;
