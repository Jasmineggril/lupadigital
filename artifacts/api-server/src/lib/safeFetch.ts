/**
 * @file lib/safeFetch.ts
 * @description Busca de URLs externas com proteção contra SSRF.
 *
 * Usada por POST /api/edital/extract-url. Antes, o fetch seguia redirecionamentos
 * automaticamente e só o host final era verificado: um redirecionamento
 * intermediário para um IP interno (ex.: 169.254.169.254, metadados da nuvem)
 * passava sem checagem. A resposta também era lida inteira na memória.
 *
 * Agora:
 *   - cada salto de redirecionamento é verificado (até MAX_REDIRECTS);
 *   - IPs literais e nomes resolvidos são checados contra faixas privadas,
 *     loopback, link-local, CGNAT, multicast e reservadas;
 *   - o corpo é lido em streaming com limite de bytes.
 */

import dns from "node:dns/promises";
import net from "node:net";

export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Erro com mensagem segura para mostrar ao usuário. */
export class UnsafeUrlError extends Error {}

export function isPrivateIp(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  // IPv6 com IPv4 embutido (::ffff:a.b.c.d)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1];

  if (net.isIPv4(addr)) {
    const [a, b] = addr.split(".").map(Number);
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / metadados da nuvem
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) || // 192.0.0.0/24 e 192.0.2.0/24
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast e reservado
    );
  }

  if (net.isIPv6(addr)) {
    return (
      addr === "::" ||
      addr === "::1" ||
      addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb") || // fe80::/10
      addr.startsWith("fc") || addr.startsWith("fd") || // fc00::/7
      addr.startsWith("ff") || // multicast
      addr.startsWith("64:ff9b:") // NAT64
    );
  }

  // Não é IP válido: trate como inseguro
  return true;
}

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

export async function assertPublicHost(hostname: string, resolve: Resolver = defaultResolver): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("A URL aponta para um endereço de rede privada ou local, o que não é permitido.");
  }
  let addrs: string[];
  if (net.isIP(host)) {
    addrs = [host];
  } else {
    try {
      addrs = await resolve(host);
    } catch {
      throw new UnsafeUrlError("Não foi possível resolver o hostname da URL.");
    }
  }
  if (addrs.length === 0) throw new UnsafeUrlError("Nenhum endereço IP encontrado para o hostname.");
  for (const ip of addrs) {
    if (isPrivateIp(ip)) {
      throw new UnsafeUrlError("A URL aponta para um endereço de rede privada ou local, o que não é permitido.");
    }
  }
}

function assertHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL inválida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Apenas URLs com protocolo http ou https são aceitas.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs com usuário e senha não são aceitas.");
  }
  return url;
}

/** Lê o corpo em streaming, abortando se passar de maxBytes. */
async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new UnsafeUrlError("A página é grande demais para ser processada (limite de 5 MB).");
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new UnsafeUrlError("A página é grande demais para ser processada (limite de 5 MB).");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
}

export interface SafeFetchResult {
  status: number;
  ok: boolean;
  finalUrl: string;
  contentType: string;
  body: Uint8Array;
}

/**
 * Busca uma URL pública seguindo redirecionamentos manualmente e verificando
 * cada destino antes de conectar.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);

  let url = assertHttpUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(url.hostname, opts.resolve);
    const response = await fetchImpl(url.toString(), {
      headers: opts.headers,
      redirect: "manual",
      signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnsafeUrlError("Redirecionamento sem destino.");
      }
      if (hop >= maxRedirects) {
        throw new UnsafeUrlError("A URL redireciona vezes demais.");
      }
      url = assertHttpUrl(new URL(location, url).toString());
      continue;
    }

    const body = response.ok ? await readLimited(response, maxBytes) : new Uint8Array();
    return {
      status: response.status,
      ok: response.ok,
      finalUrl: url.toString(),
      contentType: response.headers.get("content-type") ?? "",
      body,
    };
  }
}
