/**
 * @file collector/urls.ts
 * @description Normalização de URLs para evitar ciclos e registros duplicados.
 */

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|_ga$|ref$|share$|replytocom$|amp$)/i;

/** Resolve relativo à base, remove fragmento e parâmetros de rastreamento, normaliza host. */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  // /pagina e /pagina/ são a mesma página
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function isAllowedHost(url: string, allowedHosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedHosts.map((h) => h.toLowerCase()).includes(host);
  } catch {
    return false;
  }
}

const DOCUMENT_EXT = /\.(pdf|docx?|odt|xlsx?|ods|zip|rar)$/i;

export function isDocumentUrl(url: string): boolean {
  try {
    return DOCUMENT_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
