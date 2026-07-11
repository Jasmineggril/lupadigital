/**
 * Centraliza nomes canônicos de tabelas e mapeamentos para compatibilidade
 * com schemas legados.
 *
 * Por que: manter um único ponto de verdade evita divergências entre
 * frontend e backend e facilita futuras migrações do schema.
 */
export const ALLOWED_TABLES = new Set<string>([
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
 * Mapeamento público -> real (DB) para compatibilidade com schemas antigos.
 * Atualmente não há mapeamentos ativos: a API usa nomes canônicos.
 */
export const TABLE_NAME_MAPPING: Record<string, string> = {};

/**
 * Resolve o nome de recurso vindo da rota para o nome de tabela utilizado
 * internamente pelo backend. Retorna `null` se a tabela não for permitida.
 */
export function resolveResourceTableName(name: string) {
  const raw = String(name).trim().toLowerCase();
  if (!raw) return null;
  if (!ALLOWED_TABLES.has(raw)) return null;
  return TABLE_NAME_MAPPING[raw] ?? raw;
}

export function tableNameIsAllowed(name: string) {
  return resolveResourceTableName(name) !== null;
}

export default {
  ALLOWED_TABLES,
  TABLE_NAME_MAPPING,
  resolveResourceTableName,
  tableNameIsAllowed,
};
