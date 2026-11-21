/**
 * @file lib/db-http.ts
 * @description Helper de CRUD via Supabase HTTP (PostgREST) para substituir
 * o driver pg que não funciona em redes corporativas com firewall bloqueando
 * portas TCP (5432/6543). O HTTPS (443) sempre funciona.
 *
 * PostgREST retorna colunas em snake_case (ex: agent_id, created_at).
 * Este helper converte automaticamente para camelCase (agentId, createdAt)
 * para manter compatibilidade com o frontend.
 */

import getSupabaseAdmin from "./supabase";

// ── Modo memória (SÓ desenvolvimento/testes) ───────────────────────────────
// Ativado apenas com LUPA_STORE=memory e recusado com NODE_ENV=production, como o
// MemoryStore do fluxo docente. Permite exercitar histórico/salvar/reabrir em testes
// de ponta a ponta sem um Supabase. Os dados somem ao reiniciar o processo.
type Row = Record<string, unknown>;
const memoryTables = new Map<string, Row[]>();
let memorySeq = 0;

function memoryMode(): boolean {
  if (process.env.LUPA_STORE !== "memory") return false;
  if (process.env.NODE_ENV === "production") throw new Error("LUPA_STORE=memory não é permitido em produção.");
  return true;
}
function memTable(table: string): Row[] {
  const t = memoryTables.get(table) ?? [];
  memoryTables.set(table, t);
  return t;
}
function memMatch(row: Row, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([k, v]) => v === undefined || v === null || String(row[k]) === String(v));
}
function memSort(rows: Row[], opts?: { order?: string; ascending?: boolean; limit?: number }) {
  let out = [...rows];
  if (opts?.order) {
    const k = opts.order;
    out.sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (opts.ascending ? 1 : -1) || (Number(b.id) - Number(a.id)) * (opts.ascending ? -1 : 1));
  }
  if (opts?.limit) out = out.slice(0, opts.limit);
  return out.map((r) => mapKeys(structuredClone(r)));
}
/** Só para testes. */
export function resetMemoryTables() {
  memoryTables.clear();
  memorySeq = 0;
}

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function mapKeys<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(mapKeys) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[toCamelCase(k)] = v;
  }
  return out as T;
}

/**
 * SELECT com WHERE, ORDER BY e LIMIT via Supabase REST.
 * Resultados são convertidos de snake_case para camelCase.
 */
export async function httpSelect<T = Record<string, unknown>>(
  table: string,
  filters: Record<string, unknown>,
  opts?: { order?: string; ascending?: boolean; limit?: number },
): Promise<T[]> {
  if (memoryMode()) return memSort(memTable(table).filter((r) => memMatch(r, filters)), opts) as T[];
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*");
  for (const [col, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null) {
      query = query.eq(col, val);
    }
  }
  if (opts?.order) {
    query = query.order(opts.order, { ascending: opts.ascending ?? false });
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapKeys) as T[];
}

/**
 * SELECT com WHERE duplo (eq + eq) via Supabase REST.
 */
export async function httpSelectTwoFilters<T = Record<string, unknown>>(
  table: string,
  col1: string,
  val1: unknown,
  col2: string,
  val2: unknown,
  opts?: { order?: string; ascending?: boolean; limit?: number },
): Promise<T[]> {
  if (memoryMode()) return memSort(memTable(table).filter((r) => memMatch(r, { [col1]: val1, [col2]: val2 })), opts) as T[];
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*").eq(col1, val1).eq(col2, val2);
  if (opts?.order) {
    query = query.order(opts.order, { ascending: opts.ascending ?? false });
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapKeys) as T[];
}

/**
 * INSERT + RETURNING (via .select()) via Supabase REST.
 * Resultado é convertido de snake_case para camelCase.
 */
function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function unmapKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[toSnakeCase(k)] = v;
  }
  return out;
}

export async function httpInsert<T = Record<string, unknown>>(
  table: string,
  values: Record<string, unknown>,
): Promise<T> {
  if (memoryMode()) {
    const row: Row = { id: ++memorySeq, created_at: new Date().toISOString(), favorito: false, ...structuredClone(unmapKeys(values)) };
    memTable(table).push(row);
    return mapKeys(structuredClone(row)) as T;
  }
  const supabase = getSupabaseAdmin();
  const snakeValues = unmapKeys(values);
  const { data, error } = await supabase
    .from(table)
    .insert(snakeValues)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapKeys(data) as T;
}

/**
 * DELETE com duplo WHERE (id + user_id) via Supabase REST.
 * Retorna true se um registro foi deletado.
 */
export async function httpDelete(
  table: string,
  col1: string,
  val1: unknown,
  col2: string,
  val2: unknown,
): Promise<boolean> {
  if (memoryMode()) {
    const t = memTable(table);
    const i = t.findIndex((r) => memMatch(r, { [col1]: val1, [col2]: val2 }));
    if (i < 0) return false;
    t.splice(i, 1);
    return true;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq(col1, val1)
    .eq(col2, val2)
    .select();
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * COUNT(*) com WHERE via Supabase REST.
 */
export async function httpCount(
  table: string,
  filters: Record<string, unknown>,
): Promise<number> {
  if (memoryMode()) return memTable(table).filter((r) => memMatch(r, filters)).length;
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null) {
      query = query.eq(col, val);
    }
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * UPDATE com duplo WHERE (id + user_id) via Supabase REST. Retorna a linha
 * atualizada (camelCase) ou null se nenhuma linha do usuário corresponder.
 */
export async function httpUpdate<T = Record<string, unknown>>(
  table: string,
  values: Record<string, unknown>,
  col1: string,
  val1: unknown,
  col2: string,
  val2: unknown,
): Promise<T | null> {
  if (memoryMode()) {
    const row = memTable(table).find((r) => memMatch(r, { [col1]: val1, [col2]: val2 }));
    if (!row) return null;
    Object.assign(row, unmapKeys(values));
    return mapKeys(structuredClone(row)) as T;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(table).update(unmapKeys(values)).eq(col1, val1).eq(col2, val2).select();
  if (error) throw new Error(error.message);
  return data && data.length ? (mapKeys(data[0]) as T) : null;
}

/**
 * Apaga TODAS as linhas de um usuário em uma tabela (exclusão de dados a pedido do titular).
 * Retorna quantas linhas saíram.
 */
export async function httpDeleteAllForUser(table: string, userId: string): Promise<number> {
  if (memoryMode()) {
    const t = memTable(table);
    const before = t.length;
    for (let i = t.length - 1; i >= 0; i -= 1) if (memMatch(t[i], { user_id: userId })) t.splice(i, 1);
    return before - t.length;
  }
  const { data, error } = await getSupabaseAdmin().from(table).delete().eq("user_id", userId).select("user_id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Desassocia o usuário das linhas (registros que precisam ficar, como logs de consumo). */
export async function httpDetachUser(table: string, userId: string): Promise<number> {
  if (memoryMode()) {
    let n = 0;
    for (const r of memTable(table)) if (memMatch(r, { user_id: userId })) { r.user_id = null; n += 1; }
    return n;
  }
  const { data, error } = await getSupabaseAdmin().from(table).update({ user_id: null }).eq("user_id", userId).select("user_id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
