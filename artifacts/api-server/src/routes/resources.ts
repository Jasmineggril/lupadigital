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
import { isMemoryMode, memoryTableForTests } from "../lib/db-http";
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
  "conversations",
]);

/** Tabelas com controle de versão, favorito e idempotência (migração 20261130_continuidade). */
const VERSIONED = new Set(["lattes_profiles", "article_analyses", "research_projects", "planetarium_contents", "conversations", "chat_messages"]);
/** Coluna que guarda o título de cada tabela (renomear pelo histórico). */
export const TITLE_COLUMN: Record<string, string> = {
  lattes_profiles: "name",
  article_analyses: "title",
  research_projects: "title",
  planetarium_contents: "title",
  conversations: "title",
  edital_analyses: "titulo",
};

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
// Mesmo armazenamento em memória do db-http (exportação/exclusão enxergam os mesmos dados)
const memoryMode = (): boolean => isMemoryMode();
const memTable = (t: string) => memoryTableForTests(t) as MemRow[];
/** Exportado para testes. */
export function resetResourceMemory() {
  for (const t of ALLOWED_TABLES) memTable(t)?.splice(0);
}

/** O registro existe e pertence a este usuário? (usado para vincular projeto à participação) */
export async function ownsResource(table: string, id: string, userId: string): Promise<boolean> {
  if (!tableNameIsAllowed(table)) return false;
  if (memoryMode()) return memTable(table).some((r) => r.id === id && r.user_id === userId);
  const { data, error } = await getSupabaseAdmin().from(table).select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
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
/** Conversas do Assistente (tabela conversations; mensagens em chat_messages.conversation_id) */
const ConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

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
  conversations: ConversationSchema,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const param = (v: unknown) => String(Array.isArray(v) ? v[0] : v);
const nowIso = () => new Date().toISOString();

/** Ordenação padrão: última alteração confirmada (cai para created_at em linhas antigas). */
function byUpdatedDesc(a: MemRow, b: MemRow) {
  return String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at));
}

/** Lista do usuário. Filtros aceitos: chat_messages?conversation_id=… (ordem de conversa). Paginação: limit/offset. */
router.get("/resources/:table", async (req: Request, res: Response): Promise<void> => {
  const table = param(req.params.table);
  if (!tableNameIsAllowed(table)) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  // Correção (22/11/2026): o filtro por conversa era ignorado e a tela recebia as mensagens de
  // TODAS as conversas, da mais nova para a mais antiga — as conversas apareciam misturadas.
  const conversationId = table === "chat_messages" && typeof req.query.conversation_id === "string" ? req.query.conversation_id.slice(0, 100) : null;
  try {
    if (memoryMode()) {
      let rows = memTable(table).filter((r) => r.user_id === String(userId) && (!conversationId || r.conversation_id === conversationId));
      rows = conversationId ? rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : rows.sort(byUpdatedDesc);
      res.json(rows.slice(offset, offset + limit));
      return;
    }
    let q = getSupabaseAdmin().from(table).select("*").eq("user_id", userId);
    if (conversationId) q = q.eq("conversation_id", conversationId).order("created_at", { ascending: true });
    else q = q.order(VERSIONED.has(table) ? "updated_at" : "created_at", { ascending: false });
    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    req.log?.error({ error: errMessage(err), table }, "resource:list:error");
    unavailable(res, "carregar o histórico");
  }
});

/**
 * Cria. `Idempotency-Key` (uuid gerado no navegador) evita duplicar em clique repetido ou nova
 * tentativa depois de falha de rede: o mesmo envio devolve o registro já criado (200).
 */
router.post("/resources/:table", async (req: Request, res: Response): Promise<void> => {
  const table = param(req.params.table);
  if (!tableNameIsAllowed(table)) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const built = buildWritePayload(table, req.body, "create", String(userId));
  if (!built.ok) {
    res.status(built.status).json(built.body);
    return;
  }
  const idem = String(req.headers["idempotency-key"] ?? "");
  const clientId = VERSIONED.has(table) && UUID_RE.test(idem) ? idem : null;
  const values = { ...(built.data as Record<string, unknown>), ...(clientId ? { client_id: clientId } : {}) };
  try {
    if (memoryMode()) {
      const t = memTable(table);
      const dup = clientId ? t.find((r) => r.user_id === String(userId) && r.client_id === clientId) : null;
      if (dup) {
        res.status(200).json(dup);
        return;
      }
      const now = nowIso();
      const row = { ...values, id: table === "conversations" ? t.length + 1 + Math.floor(Math.random() * 1e6) : crypto.randomUUID(), user_id: String(userId), created_at: now, updated_at: now, ...(VERSIONED.has(table) ? { version: 1, favorito: false } : {}) } as unknown as MemRow;
      t.push(row);
      res.status(201).json(row);
      return;
    }
    if (clientId) {
      const { data: existing } = await getSupabaseAdmin().from(table).select("*").eq("user_id", userId).eq("client_id", clientId).maybeSingle();
      if (existing) {
        res.status(200).json(existing);
        return;
      }
    }
    const { data, error } = await getSupabaseAdmin().from(table).insert([values]).select().single();
    if (error) {
      // Duas tentativas simultâneas com a mesma chave: a segunda devolve a primeira
      if ((error as { code?: string }).code === "23505" && clientId) {
        const { data: existing } = await getSupabaseAdmin().from(table).select("*").eq("user_id", userId).eq("client_id", clientId).maybeSingle();
        if (existing) {
          res.status(200).json(existing);
          return;
        }
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    req.log?.error({ error: errMessage(err), table }, "resource:create:error");
    unavailable(res, "salvar");
  }
});

router.get("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const table = param(req.params.table);
  const id = param(req.params.id);
  if (!tableNameIsAllowed(table)) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const row = await findOwned(table, id, String(userId));
    if (!row) res.status(404).json({ error: "Não encontrado" });
    else res.json(row);
  } catch (err) {
    req.log?.error({ error: errMessage(err), table }, "resource:get:error");
    unavailable(res, "abrir este item");
  }
});

async function findOwned(table: string, id: string, userId: string): Promise<MemRow | null> {
  if (memoryMode()) return memTable(table).find((r) => String(r.id) === id && r.user_id === userId) ?? null;
  const { data, error } = await getSupabaseAdmin().from(table).select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "22P02") return null; // id em formato inválido = inexistente
    throw error;
  }
  return (data as MemRow | null) ?? null;
}

/**
 * Atualização com controle de versão. `If-Match: <versão>` (opcional): se o registro mudou desde
 * essa versão (outra aba ou aparelho), responde 409 com a versão atual — nada é sobrescrito.
 * Sem If-Match, a gravação usa a versão atual (compatível com telas antigas) e incrementa.
 */
async function versionedUpdate(table: string, id: string, userId: string, values: Record<string, unknown>, expected: number | null) {
  const current = await findOwned(table, id, userId);
  if (!current) return { status: 404 as const };
  if (!VERSIONED.has(table)) {
    const patch = { ...values, ...(table === "edital_analyses" ? { updated_at: nowIso() } : {}) };
    if (memoryMode()) {
      Object.assign(current, patch, { updated_at: nowIso() });
      return { status: 200 as const, row: current };
    }
    const { data, error } = await getSupabaseAdmin().from(table).update(patch).match({ id, user_id: userId }).select().maybeSingle();
    if (error) throw error;
    return data ? { status: 200 as const, row: data as MemRow } : { status: 404 as const };
  }
  const have = Number(current.version ?? 1);
  if (expected !== null && expected !== have) return { status: 409 as const, row: current };
  const patch = { ...values, version: have + 1, updated_at: nowIso() };
  if (memoryMode()) {
    Object.assign(current, patch);
    return { status: 200 as const, row: current };
  }
  // Compare-and-set: só grava se ninguém gravou entre a leitura e esta escrita
  const { data, error } = await getSupabaseAdmin().from(table).update(patch).eq("id", id).eq("user_id", userId).eq("version", have).select().maybeSingle();
  if (error) throw error;
  if (!data) return { status: 409 as const, row: (await findOwned(table, id, userId)) ?? current };
  return { status: 200 as const, row: data as MemRow };
}

function ifMatch(req: Request): number | null {
  const h = req.headers["if-match"];
  const n = Number(String(h ?? "").replace(/"/g, ""));
  return h !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}

function sendUpdate(res: Response, r: Awaited<ReturnType<typeof versionedUpdate>>) {
  if (r.status === 404) res.status(404).json({ error: "Não encontrado ou sem permissão" });
  else if (r.status === 409)
    res.status(409).json({ error: "Este item foi alterado em outra aba ou aparelho. Nada foi sobrescrito.", code: "CONFLITO", atual: r.row });
  else res.json(r.row);
}

router.put("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const table = param(req.params.table);
  const id = param(req.params.id);
  if (!tableNameIsAllowed(table)) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const built = buildWritePayload(table, req.body, "update", String(userId));
  if (!built.ok) {
    res.status(built.status).json(built.body);
    return;
  }
  try {
    sendUpdate(res, await versionedUpdate(table, id, String(userId), built.data as Record<string, unknown>, ifMatch(req)));
  } catch (err) {
    req.log?.error({ error: errMessage(err), table }, "resource:update:error");
    unavailable(res, "salvar a alteração");
  }
});

/** Favoritar/fixar e renomear: comuns a todas as ferramentas (não passam pelo contrato de conteúdo). */
const MetaSchema = z.object({ favorito: z.boolean().optional(), titulo: z.string().trim().min(1).max(200).optional() }).strict();
router.patch("/resources/:table/:id/meta", async (req: Request, res: Response): Promise<void> => {
  const table = param(req.params.table);
  const id = param(req.params.id);
  if (!tableNameIsAllowed(table) || !(VERSIONED.has(table) || table === "edital_analyses")) {
    res.status(404).json({ error: "Tabela não permitida" });
    return;
  }
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = MetaSchema.safeParse(req.body ?? {});
  if (!parsed.success || (parsed.data.favorito === undefined && parsed.data.titulo === undefined)) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: "Informe favorito e/ou titulo." });
    return;
  }
  const values: Record<string, unknown> = {};
  if (parsed.data.favorito !== undefined && table !== "chat_messages") values.favorito = parsed.data.favorito;
  if (parsed.data.titulo !== undefined && TITLE_COLUMN[table]) values[TITLE_COLUMN[table]] = parsed.data.titulo;
  if (!Object.keys(values).length) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: "Nada a alterar nesta ferramenta." });
    return;
  }
  try {
    sendUpdate(res, await versionedUpdate(table, id, String(userId), values, ifMatch(req)));
  } catch (err) {
    req.log?.error({ error: errMessage(err), table }, "resource:meta:error");
    unavailable(res, "salvar a alteração");
  }
});

/** Exclui. Conversa: as mensagens dela vão junto (nenhuma mensagem órfã). */
router.delete("/resources/:table/:id", async (req: Request, res: Response): Promise<void> => {
  const table = param(req.params.table);
  const id = param(req.params.id);
  if (!tableNameIsAllowed(table)) {
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
      const t = memTable(table);
      const i = t.findIndex((r) => String(r.id) === id && r.user_id === String(userId));
      if (i >= 0) t.splice(i, 1);
      if (table === "conversations" && i >= 0) {
        const m = memTable("chat_messages");
        for (let k = m.length - 1; k >= 0; k -= 1) if (m[k].user_id === String(userId) && m[k].conversation_id === id) m.splice(k, 1);
      }
      res.sendStatus(204);
      return;
    }
    if (table === "conversations") {
      const owned = await findOwned(table, id, String(userId));
      if (owned) {
        const { error: e2 } = await getSupabaseAdmin().from("chat_messages").delete().eq("user_id", userId).eq("conversation_id", id);
        if (e2) throw e2;
      }
    }
    const { error } = await getSupabaseAdmin().from(table).delete().match({ id, user_id: userId });
    if (error && (error as { code?: string }).code !== "22P02") throw error;
    res.sendStatus(204);
  } catch (err) {
    req.log?.error({ error: errMessage(err), table }, "resource:delete:error");
    unavailable(res, "excluir");
  }
});

export default router;
