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
 *   edital_analyses, lattes_profiles, article_analyses, research_projects,
 *   planetarium_contents, chat_messages, documents, ai_analyses
 *
 * Segurança:
 *   - Tabelas fora da allowlist retornam 404 (não revela a existência da tabela)
 *   - Todas as operações filtram por user_id (owner isolation)
 *   - Payloads são validados com Zod e SOMENTE os dados validados vão ao banco
 *   - id, user_id, created_at e updated_at nunca são aceitos do cliente (400)
 *   - Erros do Supabase nunca são repassados diretamente ao cliente
 */

import { Router } from "express";
import type { Request, Response } from "express";
import getSupabaseAdmin, { getReqUserId, requireAuth } from "../lib/supabase";
import { z } from "zod";
import { ResearchProjectWriteSchema } from "@workspace/project-contract";
import crypto from "node:crypto";

const router = Router();

// ── Allowlist de tabelas ──────────────────────────────────────────────────────
// Apenas estas tabelas podem ser acessadas pela API de recursos.
// Qualquer nome fora desta lista retorna 404 para não revelar o schema do banco.
const ALLOWED_TABLES = new Set([
  "edital_analyses",
  "lattes_profiles",
  "article_analyses",
  "research_projects",
  "planetarium_contents",
  "chat_messages",
  "documents",
  "ai_analyses",
]);

/**
 * Verifica se o nome da tabela está na allowlist.
 * @param name - Nome da tabela vindo do parâmetro de rota
 * @returns true se a tabela é permitida, false caso contrário
 */
function tableNameIsAllowed(name: string) {
  return ALLOWED_TABLES.has(name);
}

/**
 * Extrai mensagem legível de qualquer erro (Error ou objeto Supabase/PostgREST).
 * Evita logar "[object Object]" para erros que não são instâncias de Error.
 */
// ── Modo memória (SOMENTE testes/E2E: LUPA_STORE=memory, recusado em produção) ──
// Mesmo formato de linha do banco (snake_case), sempre filtrado pelo dono.
type MemRow = Record<string, unknown> & { id: string; user_id: string; created_at: string; updated_at: string };
const memRows = new Map<string, MemRow[]>();
function memoryMode(): boolean {
  if (process.env.LUPA_STORE !== "memory") return false;
  if (process.env.NODE_ENV === "production") throw new Error("LUPA_STORE=memory não é permitido em produção.");
  return true;
}
const memTable = (t: string) => {
  if (!memRows.has(t)) memRows.set(t, []);
  return memRows.get(t)!;
};
/** Exportado para testes. */
export function resetResourceMemory() {
  memRows.clear();
}

/** Resposta padrão quando o banco não responde: nada foi alterado. */
function unavailable(res: Response, action: string) {
  res.status(503).json({ error: `Não foi possível ${action} agora. Nada foi alterado; tente novamente em instantes.` });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
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

/** Schema de validação para a tabela documents */
const DocumentSchema = z.object({
  filename: z.string().optional(),
  mime_type: z.string().nullable().optional(),
  size: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela ai_analyses */
const AIAnalysisSchema = z.object({
  model: z.string().nullable().optional(),
  input: z.string().nullable().optional(),
  output: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Schema de validação para a tabela lattes_profiles */
const LattesProfileSchema = z.object({
  name: z.string().optional(),
  lattes_xml: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
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

/**
 * research_projects: contrato compartilhado com a tela (@workspace/project-contract).
 * `.strict()`: campo desconhecido é recusado em vez de descartado em silêncio.
 */
const ResearchProjectSchema = ResearchProjectWriteSchema.strict();

/** Schema de validação para a tabela planetarium_contents */
const PlanetariumContentSchema = z.object({
  title: z.string().optional(),
  content: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * Mapa de schemas indexados por nome de tabela.
 * Toda tabela da allowlist precisa de schema: sem schema, nada é gravado.
 */
const SCHEMAS: Record<string, z.ZodTypeAny> = {
  edital_analyses: EdtalAnalysisSchema,
  lattes_profiles: LattesProfileSchema,
  article_analyses: ArticleAnalysisSchema,
  research_projects: ResearchProjectSchema,
  planetarium_contents: PlanetariumContentSchema,
  chat_messages: ChatMessageSchema,
  documents: DocumentSchema,
  ai_analyses: AIAnalysisSchema,
};

// ── Campos controlados pelo servidor ─────────────────────────────────────────
// Nunca aceitos do cliente: id e timestamps são gerados pelo banco e user_id vem
// sempre do JWT. Enviar qualquer um deles no corpo resulta em 400, para que uma
// tentativa de transferir a propriedade de um registro nunca passe em silêncio.
export const SERVER_CONTROLLED_FIELDS = ["id", "user_id", "created_at", "updated_at"] as const;

type WritePayloadResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Monta o payload a ser gravado a partir do corpo da requisição.
 *
 * - Rejeita (400) campos controlados pelo servidor (id, user_id, created_at, updated_at).
 * - Valida com o schema Zod da tabela e usa SOMENTE os dados validados
 *   (campos fora do schema são descartados, nunca gravados).
 * - Em "create", injeta user_id a partir do usuário autenticado.
 * - Em "update", nunca inclui user_id (a propriedade não pode mudar) e exige
 *   ao menos um campo válido.
 */
export function buildWritePayload(
  table: string,
  body: unknown,
  mode: "create" | "update",
  userId: string,
): WritePayloadResult {
  const schema = SCHEMAS[table];
  if (!schema) {
    // Toda tabela da allowlist tem schema; sem schema não gravamos nada.
    return { ok: false, status: 404, body: { error: "Tabela não permitida" } };
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, body: { code: "VALIDATION_ERROR", message: "Payload inválido" } };
  }

  const forbidden = SERVER_CONTROLLED_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (forbidden.length > 0) {
    return {
      ok: false,
      status: 400,
      body: {
        code: "FORBIDDEN_FIELD",
        message: "Campos controlados pelo servidor não podem ser enviados.",
        fields: forbidden,
      },
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: { code: "VALIDATION_ERROR", message: "Payload inválido", details: parsed.error.format() },
    };
  }

  // Cópia defensiva só com chaves do schema; remove qualquer campo controlado
  // que porventura venha de um schema futuro.
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
  for (const f of SERVER_CONTROLLED_FIELDS) delete data[f];

  if (mode === "create") {
    return { ok: true, data: { ...data, user_id: userId } };
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, status: 400, body: { code: "VALIDATION_ERROR", message: "Nenhum campo válido para atualizar." } };
  }
  return { ok: true, data };
}

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
  try {
    if (memoryMode()) {
      res.json(memTable(String(table)).filter((r) => r.user_id === String(userId)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return;
    }
    const { data, error } = await getSupabaseAdmin()
      .from(String(table))
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    const message = errMessage(err);
    req.log?.error({ error: message, table, userId }, "resource:list:error");
    unavailable(res, "carregar o histórico");
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
  try {
    // Só dados validados; user_id vem do JWT (nunca do body)
    const built = buildWritePayload(String(table), req.body, "create", String(userId));
    if (!built.ok) {
      res.status(built.status).json(built.body);
      return;
    }
    if (memoryMode()) {
      const now = new Date().toISOString();
      const row = { ...(built.data as Record<string, unknown>), id: crypto.randomUUID(), user_id: String(userId), created_at: now, updated_at: now } as MemRow;
      memTable(String(table)).push(row);
      res.status(201).json(row);
      return;
    }
    const { data, error } = await getSupabaseAdmin()
      .from(String(table))
      .insert([built.data])
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    const message = errMessage(err);
    req.log?.error({ error: message, table, userId }, "resource:create:error");
    unavailable(res, "salvar");
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
  try {
    if (memoryMode()) {
      const row = memTable(String(table)).find((r) => r.id === String(id) && r.user_id === String(userId));
      if (!row) res.status(404).json({ error: "Não encontrado" });
      else res.json(row);
      return;
    }
    const { data, error } = await getSupabaseAdmin()
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
    const message = errMessage(err);
    req.log?.error({ error: message, table, id, userId }, "resource:get:error");
    unavailable(res, "abrir este item");
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
  try {
    // Só dados validados; id/user_id/timestamps nunca podem ser alterados
    const built = buildWritePayload(String(table), req.body, "update", String(userId));
    if (!built.ok) {
      res.status(built.status).json(built.body);
      return;
    }
    if (memoryMode()) {
      const row = memTable(String(table)).find((r) => r.id === String(id) && r.user_id === String(userId));
      if (!row) {
        res.status(404).json({ error: "Não encontrado ou sem permissão" });
        return;
      }
      Object.assign(row, built.data, { updated_at: new Date().toISOString() });
      res.json(row);
      return;
    }
    // Tabelas com updated_at (research_projects): data da última edição vem do servidor
    const values = String(table) === "research_projects" ? { ...(built.data as Record<string, unknown>), updated_at: new Date().toISOString() } : built.data;
    const { data, error } = await getSupabaseAdmin()
      .from(String(table))
      .update(values)
      .match({ id, user_id: userId }) // atômico: só atualiza se id E user_id baterem
      .select()
      .single();
    if (error) {
      // PGRST116 = nenhuma linha (id inexistente ou de outro usuário)
      if ((error as any).code === "PGRST116") {
        res.status(404).json({ error: "Não encontrado ou sem permissão" });
        return;
      }
      throw error;
    }
    if (!data) {
      res.status(404).json({ error: "Não encontrado ou sem permissão" });
      return;
    }
    res.json(data);
  } catch (err) {
    const message = errMessage(err);
    req.log?.error({ error: message, table, id, userId }, "resource:update:error");
    unavailable(res, "salvar a alteração");
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
  try {
    if (memoryMode()) {
      const t = memTable(String(table));
      const i = t.findIndex((r) => r.id === String(id) && r.user_id === String(userId));
      if (i >= 0) t.splice(i, 1);
      res.sendStatus(204);
      return;
    }
    const { error } = await getSupabaseAdmin()
      .from(String(table))
      .delete()
      .match({ id, user_id: userId }); // owner check: só deleta se ambos baterem
    if (error) throw error;
    res.sendStatus(204); // 204 No Content: deleção bem-sucedida, sem corpo
  } catch (err) {
    const message = errMessage(err);
    req.log?.error({ error: message, table, id, userId }, "resource:delete:error");
    unavailable(res, "excluir");
  }
});

export default router;
