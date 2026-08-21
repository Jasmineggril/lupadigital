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
