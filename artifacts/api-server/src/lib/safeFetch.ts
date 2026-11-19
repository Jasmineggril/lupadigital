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
 *   - o corpo é lido em streaming com limite de bytes;
 *   - a conexão usa o MESMO IP que foi verificado (pinnedFetch), fechando a
 *     brecha de DNS rebinding: antes, o DNS era consultado na checagem e de novo
 *     pelo fetch, e um atacante podia responder um IP público na primeira vez e
 *     um IP interno na segunda.
 */

import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

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

/**
 * Função `lookup` para http/https: resolve o nome, recusa se QUALQUER endereço
 * for privado e entrega à conexão apenas endereços já verificados. Como a
 * verificação acontece dentro da própria conexão, não há janela para o DNS
 * mudar entre a checagem e o connect.
 */
export function createSafeLookup(resolve: Resolver = defaultResolver, isBlocked: (ip: string) => boolean = isPrivateIp) {
  return (
    hostname: string,
    options: { all?: boolean; family?: number | string } | number | undefined,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    const wantAll = typeof options === "object" && options !== null && options.all === true;
    (async () => {
      const host = hostname.replace(/^\[|\]$/g, "");
      if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
        throw new UnsafeUrlError("A URL aponta para um endereço de rede privada ou local, o que não é permitido.");
      }
      let addrs: string[];
      try {
        addrs = net.isIP(host) ? [host] : await resolve(host);
      } catch {
        throw new UnsafeUrlError("Não foi possível resolver o hostname da URL.");
      }
      // Esta é a resolução usada na conexão: se qualquer IP for interno, recusa
      if (addrs.length === 0 || addrs.some((ip) => isBlocked(ip))) {
        throw new UnsafeUrlError("A URL aponta para um endereço de rede privada ou local, o que não é permitido.");
      }
      return addrs.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }));
    })()
      .then((list) => {
        if (wantAll) callback(null, list);
        else callback(null, list[0].address, list[0].family);
      })
      .catch((err: NodeJS.ErrnoException) => {
        if (!err.code) err.code = "ENOTFOUND";
        callback(err, wantAll ? [] : "", 4);
      });
  };
}

/**
 * fetch mínimo sobre node:http/https que conecta somente a IPs verificados.
 * Não segue redirecionamentos (safeFetch faz isso salto a salto).
 */
export function createPinnedFetch(
  resolve: Resolver = defaultResolver,
  isBlocked: (ip: string) => boolean = isPrivateIp,
): typeof fetch {
  const lookup = createSafeLookup(resolve, isBlocked);
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const mod = url.protocol === "https:" ? https : http;
    const headers: Record<string, string> = { "accept-encoding": "gzip, deflate, br" };
    for (const [k, v] of Object.entries((init?.headers as Record<string, string> | undefined) ?? {})) {
      headers[k.toLowerCase()] = v;
    }
    return await new Promise<Response>((resolvePromise, reject) => {
      const req = mod.request(
        url,
        { method: init?.method ?? "GET", headers, lookup: lookup as never, signal: init?.signal ?? undefined },
        (res) => {
          const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
          let stream: Readable = res;
          if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
          else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
          else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
          const outHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined || k === "content-encoding" || k === "content-length") continue;
            outHeaders.set(k, Array.isArray(v) ? v.join(", ") : String(v));
          }
          if (!encoding && res.headers["content-length"]) outHeaders.set("content-length", String(res.headers["content-length"]));
          const status = res.statusCode ?? 502;
          const nullBody = status === 204 || status === 304 || (status >= 300 && status < 400);
          if (nullBody) res.resume();
          resolvePromise(
            new Response(nullBody ? null : (Readable.toWeb(stream) as ReadableStream<Uint8Array>), {
              status,
              headers: outHeaders,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  }) as typeof fetch;
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
  // Por padrão conecta só a IPs verificados (proteção contra DNS rebinding)
  const fetchImpl = opts.fetchImpl ?? createPinnedFetch(opts.resolve);
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
