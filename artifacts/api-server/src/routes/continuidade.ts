/**
 * @file routes/continuidade.ts
 * @description Continuidade do usuário logado.
 *
 *   GET    /me/history                   "Meu histórico": consulta AGREGADA (não copia dados) dos trabalhos
 *                                        de todas as ferramentas — cada item aponta para o registro original
 *   GET    /me/items?kind=…              itens pequenos: progresso do Aprender, termos favoritos, consultas
 *   PUT    /me/items/:kind/:key          grava (idempotente por kind+key; If-Match opcional)
 *   DELETE /me/items/:kind/:key          exclui um
 *   DELETE /me/items?kind=…              limpa um tipo (ex.: consultas recentes)
 *
 * Tudo filtrado pelo usuário do token (nunca por um user_id vindo da tela).
 * Consultas recentes do glossário só são gravadas se a pessoa ATIVOU a opção; guardam no máximo
 * 20 termos por 30 dias.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import getSupabaseAdmin, { getReqUserId, requireAuth } from "../lib/supabase";
import { isMemoryMode, memoryTableForTests } from "../lib/db-http";
import { getStore } from "../lib/lupa/store";
import { getJobStore } from "../lib/longdoc/store";

const router: IRouter = Router();
type Row = Record<string, unknown>;

export const ITEM_KINDS = ["aprendizagem", "glossario_favorito", "glossario_recente", "preferencia"] as const;
export const RECENT_MAX = 20;
export const RECENT_DAYS = 30;
const KindSchema = z.enum(ITEM_KINDS);
const KeySchema = z.string().trim().min(1).max(200);

function fail(req: Request, res: Response, err: unknown, action: string) {
  req.log?.error({ module: "continuidade", error: err instanceof Error ? err.message : String(err) }, `continuidade:${action}`);
  res.status(503).json({ error: `Não foi possível ${action} agora. Nada foi alterado; tente novamente.` });
}

const mem = (t: string) => memoryTableForTests(t) as Row[];

// ── Itens pequenos ───────────────────────────────────────────────────────────

async function listItems(userId: string, kind: string): Promise<Row[]> {
  if (isMemoryMode()) return mem("user_items").filter((r) => r.user_id === userId && r.kind === kind).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const { data, error } = await getSupabaseAdmin().from("user_items").select("key,data,version,created_at,updated_at").eq("user_id", userId).eq("kind", kind).order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return data ?? [];
}

async function getItem(userId: string, kind: string, key: string): Promise<Row | null> {
  if (isMemoryMode()) return mem("user_items").find((r) => r.user_id === userId && r.kind === kind && r.key === key) ?? null;
  const { data, error } = await getSupabaseAdmin().from("user_items").select("*").eq("user_id", userId).eq("kind", kind).eq("key", key).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function deleteItems(userId: string, kind: string, key?: string) {
  if (isMemoryMode()) {
    const t = mem("user_items");
    for (let i = t.length - 1; i >= 0; i -= 1) if (t[i].user_id === userId && t[i].kind === kind && (!key || t[i].key === key)) t.splice(i, 1);
    return;
  }
  let q = getSupabaseAdmin().from("user_items").delete().eq("user_id", userId).eq("kind", kind);
  if (key) q = q.eq("key", key);
  const { error } = await q;
  if (error) throw error;
}

/** Upsert com versão: `expected` (If-Match) diferente da versão atual → conflito. */
async function putItem(userId: string, kind: string, key: string, data: unknown, expected: number | null): Promise<{ status: 200 | 409; row: Row }> {
  const current = await getItem(userId, kind, key);
  const now = new Date().toISOString();
  if (current && expected !== null && Number(current.version) !== expected) return { status: 409, row: current };
  if (isMemoryMode()) {
    if (current) {
      Object.assign(current, { data, version: Number(current.version) + 1, updated_at: now });
      return { status: 200, row: current };
    }
    const row = { id: crypto.randomUUID(), user_id: userId, kind, key, data, version: 1, created_at: now, updated_at: now };
    mem("user_items").push(row);
    return { status: 200, row };
  }
  const db = getSupabaseAdmin();
  if (current) {
    const { data: upd, error } = await db
      .from("user_items")
      .update({ data, version: Number(current.version) + 1, updated_at: now })
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("key", key)
      .eq("version", Number(current.version))
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!upd) return { status: 409, row: (await getItem(userId, kind, key)) ?? current };
    return { status: 200, row: upd };
  }
  const { data: ins, error } = await db.from("user_items").insert({ user_id: userId, kind, key, data }).select().single();
  if (error) {
    // Duas abas criando o mesmo item ao mesmo tempo: a segunda vê a primeira
    if ((error as { code?: string }).code === "23505") return { status: 409, row: (await getItem(userId, kind, key)) as Row };
    throw error;
  }
  return { status: 200, row: ins };
}

const publicItem = (r: Row) => ({ key: r.key, data: r.data, version: r.version, criado_em: r.created_at, atualizado_em: r.updated_at });

router.get("/me/items", requireAuth(), async (req, res) => {
  const kind = KindSchema.safeParse(req.query.kind);
  if (!kind.success) {
    res.status(400).json({ error: "Tipo inválido." });
    return;
  }
  try {
    const userId = getReqUserId(req) as string;
    let rows = await listItems(userId, kind.data);
    if (kind.data === "glossario_recente") rows = rows.filter((r) => Date.now() - new Date(String(r.updated_at)).getTime() < RECENT_DAYS * 86_400_000).slice(0, RECENT_MAX);
    res.json({ items: rows.map(publicItem) });
  } catch (err) {
    fail(req, res, err, "carregar");
  }
});

router.put("/me/items/:kind/:key", requireAuth(), async (req, res) => {
  const kind = KindSchema.safeParse(req.params.kind);
  const key = KeySchema.safeParse(req.params.key);
  const body = z.object({ data: z.unknown() }).strict().safeParse(req.body ?? {});
  if (!kind.success || !key.success || !body.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  if (JSON.stringify(body.data.data ?? null).length > 20_000) {
    res.status(413).json({ error: "Item grande demais." });
    return;
  }
  const userId = getReqUserId(req) as string;
  try {
    if (kind.data === "glossario_recente") {
      // Opcional: só grava se a pessoa ativou "guardar minhas consultas recentes"
      const pref = await getItem(userId, "preferencia", "glossario_recentes");
      if (!(pref?.data as { ativo?: boolean } | undefined)?.ativo) {
        res.status(409).json({ error: "Consultas recentes estão desativadas.", code: "RECENTES_DESATIVADAS" });
        return;
      }
    }
    const h = req.headers["if-match"];
    const expected = h !== undefined && /^\d+$/.test(String(h)) ? Number(h) : null;
    const r = await putItem(userId, kind.data, key.data, body.data.data ?? null, expected);
    if (r.status === 409) {
      res.status(409).json({ error: "Alterado em outra aba ou aparelho. Nada foi sobrescrito.", code: "CONFLITO", atual: publicItem(r.row) });
      return;
    }
    if (kind.data === "glossario_recente") {
      // Retenção: no máximo 20, e nada com mais de 30 dias
      const all = await listItems(userId, "glossario_recente");
      for (const old of all.filter((x, i) => i >= RECENT_MAX || Date.now() - new Date(String(x.updated_at)).getTime() >= RECENT_DAYS * 86_400_000)) await deleteItems(userId, "glossario_recente", String(old.key));
    }
    if (kind.data === "preferencia" && key.data === "glossario_recentes" && !(body.data.data as { ativo?: boolean } | null)?.ativo) {
      await deleteItems(userId, "glossario_recente"); // desativar apaga o que havia
    }
    res.json(publicItem(r.row));
  } catch (err) {
    fail(req, res, err, "salvar");
  }
});

router.delete("/me/items/:kind/:key", requireAuth(), async (req, res) => {
  const kind = KindSchema.safeParse(req.params.kind);
  const key = KeySchema.safeParse(req.params.key);
  if (!kind.success || !key.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  try {
    await deleteItems(getReqUserId(req) as string, kind.data, key.data);
    res.sendStatus(204);
  } catch (err) {
    fail(req, res, err, "excluir");
  }
});

router.delete("/me/items", requireAuth(), async (req, res) => {
  const kind = KindSchema.safeParse(req.query.kind);
  if (!kind.success) {
    res.status(400).json({ error: "Tipo inválido." });
    return;
  }
  try {
    await deleteItems(getReqUserId(req) as string, kind.data);
    res.sendStatus(204);
  } catch (err) {
    fail(req, res, err, "limpar");
  }
});

// ── Meu histórico ───────────────────────────────────────────────────────────

export type Ferramenta = "editais" | "analise_longa" | "elattes" | "artigos" | "projetos" | "planetario" | "assistente" | "participacoes";
export type Situacao = "concluido" | "parcial" | "rascunho" | "em_andamento" | "falha";

export interface HistoryItem {
  ferramenta: Ferramenta;
  id: string;
  titulo: string;
  situacao: Situacao;
  criado_em: string;
  atualizado_em: string;
  favorito: boolean;
  /** Onde continuar: a MESMA ferramenta, abrindo o MESMO registro */
  link: string;
  vinculos?: { projeto_id?: string | null; participacao_id?: string | null; analise_id?: string | null };
}

const SOURCES: Record<string, { table: string; cols: string; ferramenta: Ferramenta; titleCol: string }> = {
  agent_results: { table: "agent_results", cols: "id,title,agent_id,status,favorito,created_at,updated_at,processing:result_json->processing", ferramenta: "editais", titleCol: "title" },
  lattes_profiles: { table: "lattes_profiles", cols: "id,name,favorito,created_at,updated_at", ferramenta: "elattes", titleCol: "name" },
  article_analyses: { table: "article_analyses", cols: "id,title,favorito,created_at,updated_at,leitura:metadata->leitura", ferramenta: "artigos", titleCol: "title" },
  research_projects: { table: "research_projects", cols: "id,title,favorito,manual,created_at,updated_at", ferramenta: "projetos", titleCol: "title" },
  planetarium_contents: { table: "planetarium_contents", cols: "id,title,favorito,created_at,updated_at", ferramenta: "planetario", titleCol: "title" },
  conversations: { table: "conversations", cols: "id,title,favorito,created_at,updated_at", ferramenta: "assistente", titleCol: "title" },
};

async function lightRows(src: (typeof SOURCES)[string], userId: string): Promise<Row[]> {
  if (isMemoryMode()) {
    return mem(src.table)
      .filter((r) => String(r.user_id) === userId)
      .map((r) => ({
        ...r,
        processing: (r.result_json as Row | undefined)?.processing,
        leitura: (r.metadata as Row | undefined)?.leitura,
      }));
  }
  const { data, error } = await getSupabaseAdmin().from(src.table).select(src.cols).eq("user_id", userId).order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

const LINKS: Record<Ferramenta, (id: string) => string> = {
  editais: (id) => `/testar?analise=${id}`,
  analise_longa: (id) => `/testar?tarefa=${id}`,
  elattes: (id) => `/niasci/elattes?item=${id}`,
  artigos: (id) => `/niasci/artigos?item=${id}`,
  projetos: (id) => `/niasci/projetos?projeto=${id}`,
  planetario: (id) => `/niasci/planetario?item=${id}`,
  assistente: (id) => `/niasci/assistente?c=${id}`,
  participacoes: (id) => `/participar/${id}`,
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function collectHistory(userId: string): Promise<{ items: HistoryItem[]; falhas: string[] }> {
  const items: HistoryItem[] = [];
  const falhas: string[] = [];
  const at = (r: Row) => String(r.updated_at ?? r.created_at);
  await Promise.all(
    Object.values(SOURCES).map(async (src) => {
      try {
        for (const r of await lightRows(src, userId)) {
          const id = String(r.id);
          let situacao: Situacao = "concluido";
          if (src.ferramenta === "editais") situacao = r.status === "parcial" || (r.processing as Row | undefined)?.complete === false ? "parcial" : "concluido";
          if (src.ferramenta === "artigos" && (r.leitura as Row | undefined)?.integral === false) situacao = "parcial";
          if (src.ferramenta === "projetos" && r.manual) situacao = "rascunho";
          items.push({
            ferramenta: src.ferramenta,
            id,
            titulo: String(r[src.titleCol] ?? "").trim() || "Sem título",
            situacao,
            criado_em: String(r.created_at),
            atualizado_em: at(r),
            favorito: Boolean(r.favorito),
            link: LINKS[src.ferramenta](id),
          });
        }
      } catch {
        falhas.push(src.ferramenta); // uma ferramenta indisponível não esconde as outras — e é informada
      }
    }),
  );
  try {
    for (const p of await getStore().listParticipations(userId)) {
      items.push({
        ferramenta: "participacoes",
        id: p.id,
        titulo: p.titulo,
        situacao: p.situacao === "enviada" || p.situacao === "desisti" ? "concluido" : "em_andamento",
        criado_em: p.created_at,
        atualizado_em: p.updated_at,
        favorito: false,
        link: LINKS.participacoes(p.id),
        vinculos: { projeto_id: (p as { project_id?: string | null }).project_id ?? null, analise_id: p.agent_result_id != null ? String(p.agent_result_id) : null },
      });
    }
  } catch {
    falhas.push("participacoes");
  }
  try {
    // Análises longas ainda em andamento, parciais ou com falha (as concluídas já estão em "editais")
    for (const j of await getJobStore().listJobs(userId, 50)) {
      if (j.status === "concluida" || j.status === "cancelada") continue;
      items.push({
        ferramenta: "analise_longa",
        id: j.id,
        titulo: `Documento longo (${j.chars.toLocaleString("pt-BR")} caracteres) — ${j.done_chunks} de ${j.total_chunks} partes`,
        situacao: j.status === "parcial" ? "parcial" : j.status === "falhou" ? "falha" : "em_andamento",
        criado_em: j.created_at,
        atualizado_em: j.updated_at,
        favorito: false,
        link: LINKS.analise_longa(j.id),
      });
    }
  } catch {
    falhas.push("analise_longa");
  }
  // Vínculo projeto ↔ participação, para agrupar no histórico
  const partByProject = new Map(items.filter((i) => i.ferramenta === "participacoes" && i.vinculos?.projeto_id).map((i) => [String(i.vinculos!.projeto_id), i.id]));
  for (const i of items) if (i.ferramenta === "projetos" && partByProject.has(i.id)) i.vinculos = { participacao_id: partByProject.get(i.id) };
  return { items, falhas };
}

const HistoryQuery = z.object({
  ferramenta: z.enum(["editais", "analise_longa", "elattes", "artigos", "projetos", "planetario", "assistente", "participacoes"]).optional(),
  situacao: z.enum(["concluido", "parcial", "rascunho", "em_andamento", "falha"]).optional(),
  q: z.string().max(100).optional(),
  favoritos: z.enum(["1"]).optional(),
  ordem: z.enum(["atualizacao", "criacao", "titulo"]).default("atualizacao"),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/me/history", requireAuth(), async (req, res) => {
  const p = HistoryQuery.safeParse(req.query ?? {});
  if (!p.success) {
    res.status(400).json({ error: "Filtro inválido." });
    return;
  }
  const userId = getReqUserId(req) as string;
  try {
    const { items, falhas } = await collectHistory(userId);
    const q = p.data.q ? fold(p.data.q.trim()) : "";
    let list = items.filter(
      (i) => (!p.data.ferramenta || i.ferramenta === p.data.ferramenta) && (!p.data.situacao || i.situacao === p.data.situacao) && (!p.data.favoritos || i.favorito) && (!q || fold(i.titulo).includes(q)),
    );
    const key = p.data.ordem === "criacao" ? "criado_em" : "atualizado_em";
    list = list.sort((a, b) => (p.data.ordem === "titulo" ? a.titulo.localeCompare(b.titulo, "pt-BR") : b[key].localeCompare(a[key])));
    // Fixados (favoritos) primeiro, mantendo a ordem escolhida dentro de cada grupo
    list = [...list.filter((i) => i.favorito), ...list.filter((i) => !i.favorito)];
    const total = list.length;
    const start = (p.data.pagina - 1) * p.data.por_pagina;
    const contagem: Record<string, number> = {};
    for (const i of items) contagem[i.ferramenta] = (contagem[i.ferramenta] ?? 0) + 1;
    // Resumos que NÃO entram na lista de trabalhos (não a dominam)
    let aprendizagem: unknown = null;
    let glossario: { favoritos: number; recentes_ativos: boolean } | null = null;
    try {
      aprendizagem = (await getItem(userId, "aprendizagem", "ler-edital"))?.data ?? null;
      const favs = await listItems(userId, "glossario_favorito");
      const pref = await getItem(userId, "preferencia", "glossario_recentes");
      glossario = { favoritos: favs.length, recentes_ativos: Boolean((pref?.data as { ativo?: boolean } | undefined)?.ativo) };
    } catch {
      falhas.push("aprendizagem");
    }
    res.json({ itens: list.slice(start, start + p.data.por_pagina), total, pagina: p.data.pagina, por_pagina: p.data.por_pagina, contagem, falhas, resumos: { aprendizagem, glossario } });
  } catch (err) {
    fail(req, res, err, "carregar o histórico");
  }
});

export default router;
