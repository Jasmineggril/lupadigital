/**
 * Utilitários de formatação de datas reutilizados em múltiplas páginas.
 * Centralizar aqui evita duplicação e garante formato consistente em todo o app.
 */

/**
 * Formata uma string ISO como data e hora abreviadas (dd/mm/aaaa hh:mm).
 * Usado no Dashboard para registros com carimbo de tempo completo.
 *
 * @param d - String ISO 8601 (ex: "2026-07-13T19:00:00Z")
 * @returns Data formatada em pt-BR, ex: "13/07/2026, 19:00"
 */
export function formatDatetime(d: string): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formata uma string ISO como data curta (dd de mês abreviado de aaaa).
 * Usado na Timeline onde o mês por extenso melhora a leitura visual.
 *
 * @param d - String ISO 8601 (ex: "2026-07-13T19:00:00Z")
 * @returns Data formatada em pt-BR, ex: "13 de jul. de 2026"
 */
export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
