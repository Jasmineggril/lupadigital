/**
 * @file safe-redirect.ts
 * @description Valida o destino de retorno após login (?next=) para evitar
 * redirecionamento para sites externos (open redirect).
 *
 * Aceita apenas caminhos internos: começam com "/" e não com "//" ou "/\",
 * sem esquema, sem caracteres de controle e sem apontar de volta para telas de auth.
 */

const AUTH_PAGES = ["/login", "/cadastro", "/esqueci-senha", "/redefinir-senha"];

export const DEFAULT_AFTER_LOGIN = "/inicio";

export function safeNext(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!raw || typeof raw !== "string") return fallback;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;
  try {
    const url = new URL(value, "https://lupa.invalid");
    if (url.origin !== "https://lupa.invalid") return fallback;
    if (AUTH_PAGES.includes(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export function loginUrlFor(path: string): string {
  return `/login?next=${encodeURIComponent(safeNext(path))}`;
}
