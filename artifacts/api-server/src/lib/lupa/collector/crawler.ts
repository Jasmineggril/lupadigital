/**
 * @file collector/crawler.ts
 * @description Coleta de uma fonte oficial com limites e registro da execução.
 *
 * Limites: profundidade, número de páginas, tempo total, tamanho de resposta
 * (via safeFetch, 5 MB) e intervalo entre requisições. Só segue hosts da fonte.
 * Ciclos e duplicatas são evitados pela URL normalizada.
 *
 * A coleta é separada do agendador: runCollection() é chamada pela rota
 * administrativa (manual) ou pelo contrato do Hermes (lib/lupa/integrations/hermes.ts).
 */

import { safeFetch, UnsafeUrlError } from "../../safeFetch";
import type { LupaStore } from "../store";
import { ConcurrentRunError } from "../store";
import type { CollectionRun, OpportunityDocument, OpportunitySource } from "../types";
import { isAllowedHost, isDocumentUrl, normalizeUrl } from "./urls";
import {
  classifyDocument,
  classifyPage,
  contentHash,
  eventsFromDocuments,
  extractFields,
  findEditalNumbers,
  inferStatus,
  parseHtml,
  type ParsedPage,
} from "./parse";

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

export const USER_AGENT = "LUPA-Digital-Coletor/1.0 (+https://github.com/Jasmineggril/lupadigital; NIASci/UnDF)";

export function createSafeFetcher(allowedHosts: string[]): PageFetcher {
  return async (url) => {
    if (!isAllowedHost(url, allowedHosts)) throw new UnsafeUrlError(`Host fora da fonte: ${url}`);
    const res = await safeFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      timeoutMs: 20_000,
    });
    if (!isAllowedHost(res.finalUrl, allowedHosts)) throw new UnsafeUrlError(`Redirecionou para fora da fonte: ${res.finalUrl}`);
    return { url: res.finalUrl, status: res.status, contentType: res.contentType, body: new TextDecoder().decode(res.body) };
  };
}

export interface CrawlOptions {
  fetcher: PageFetcher;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface CrawlResult {
  opportunityPages: ParsedPage[];
  categoryPages: ParsedPage[];
  /** Documentos achados em páginas de categoria (podem ser retificações soltas). */
  looseDocuments: Array<{ url: string; text: string; foundOn: string }>;
  errors: Array<{ url: string; message: string }>;
  pagesFetched: number;
  stoppedBy: "concluido" | "limite_paginas" | "limite_tempo";
}

export async function crawlSource(source: OpportunitySource, opts: CrawlOptions): Promise<CrawlResult> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const started = now();
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];
  for (const s of source.start_urls) {
    const u = normalizeUrl(s);
    if (u) queue.push({ url: u, depth: 0 });
  }
  const result: CrawlResult = {
    opportunityPages: [],
    categoryPages: [],
    looseDocuments: [],
    errors: [],
    pagesFetched: 0,
    stoppedBy: "concluido",
  };

  while (queue.length > 0) {
    if (result.pagesFetched >= source.max_pages) {
      result.stoppedBy = "limite_paginas";
      break;
    }
    if (now() - started > source.time_budget_ms) {
      result.stoppedBy = "limite_tempo";
      break;
    }
    const { url, depth } = queue.shift() as { url: string; depth: number };
    if (visited.has(url)) continue;
    visited.add(url);
    if (!isAllowedHost(url, source.allowed_hosts)) continue;

    if (result.pagesFetched > 0) await sleep(source.request_delay_ms);
    let fetched: FetchedPage;
    try {
      fetched = await opts.fetcher(url);
      result.pagesFetched++;
    } catch (err) {
      result.pagesFetched++;
      result.errors.push({ url, message: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const finalUrl = normalizeUrl(fetched.url) ?? url;
    visited.add(finalUrl);
    if (fetched.status >= 400) {
      result.errors.push({ url, message: `HTTP ${fetched.status}` });
      continue;
    }
    if (!/html/i.test(fetched.contentType)) continue;

    const page = parseHtml(finalUrl, fetched.body);
    const kind = classifyPage(page);
    if (kind === "oportunidade") result.opportunityPages.push(page);
    else {
      result.categoryPages.push(page);
      for (const l of page.links) {
        if (isDocumentUrl(l.url) && isAllowedHost(l.url, source.allowed_hosts)) {
          result.looseDocuments.push({ url: l.url, text: l.text, foundOn: finalUrl });
        }
      }
    }

    if (depth >= source.max_depth) continue;
    for (const link of page.links) {
      if (isDocumentUrl(link.url)) continue; // documentos não são baixados
      if (!isAllowedHost(link.url, source.allowed_hosts) || visited.has(link.url)) continue;
      queue.push({ url: link.url, depth: depth + 1 });
    }
  }
  return result;
}

export interface CollectionStats {
  paginas: number;
  categorias: number;
  oportunidades: number;
  criadas: number;
  atualizadas: number;
  inalteradas: number;
  documentos: number;
  retificacoes_vinculadas: number;
  retificacoes_sem_vinculo: number;
  erros: number;
  [key: string]: number;
}

/** Monta e grava as oportunidades a partir do resultado da coleta. Idempotente. */
export async function persistCrawl(store: LupaStore, source: OpportunitySource, crawl: CrawlResult, now = new Date()) {
  const stats: CollectionStats = {
    paginas: crawl.pagesFetched,
    categorias: crawl.categoryPages.length,
    oportunidades: 0,
    criadas: 0,
    atualizadas: 0,
    inalteradas: 0,
    documentos: 0,
    retificacoes_vinculadas: 0,
    retificacoes_sem_vinculo: 0,
    erros: crawl.errors.length,
  };

  // Uma página de oportunidade pode aparecer por URLs equivalentes; agrupar por número
  const byNumber = new Map<string, ParsedPage>();
  for (const page of crawl.opportunityPages) {
    const number = findEditalNumbers(page.title)[0];
    if (!byNumber.has(number)) byNumber.set(number, page);
  }

  for (const [number, page] of byNumber) {
    const docs = new Map<string, OpportunityDocument>();
    for (const l of page.links) {
      if (!isDocumentUrl(l.url) || !isAllowedHost(l.url, source.allowed_hosts)) continue;
      docs.set(l.url, { url: l.url, kind: classifyDocument(l), title: l.text || l.url.split("/").pop() || "documento" });
    }
    // Retificação solta (em página de categoria) só é vinculada se citar o MESMO número
    for (const loose of crawl.looseDocuments) {
      const kind = classifyDocument({ url: loose.url, text: loose.text });
      if (kind !== "retificacao") continue;
      if (findEditalNumbers(`${loose.text} ${decodeURIComponent(loose.url)}`).includes(number) && !docs.has(loose.url)) {
        docs.set(loose.url, { url: loose.url, kind, title: loose.text || "Retificação" });
      }
    }
    const documents = [...docs.values()].sort((a, b) => a.url.localeCompare(b.url));
    const { fields, missing } = extractFields(page);
    const events = eventsFromDocuments(documents, page.text, page.url).sort((a, b) => `${a.kind}${a.title}`.localeCompare(`${b.kind}${b.title}`));
    const status = inferStatus(fields, page.text, now);
    const hashInput = { title: page.title, text: page.text };
    const outcome = await store.upsertOpportunity({
      source_id: source.id,
      canonical_url: page.url,
      edital_number: number,
      title: page.title,
      status,
      fields,
      missing_fields: missing,
      content_hash: contentHash(hashInput),
      documents,
      events,
    });
    stats.oportunidades++;
    stats.documentos += documents.length;
    stats.retificacoes_vinculadas += documents.filter((d) => d.kind === "retificacao").length;
    if (outcome.created) stats.criadas++;
    else if (outcome.changed) stats.atualizadas++;
    else stats.inalteradas++;
  }

  const linkedUrls = new Set<string>();
  for (const page of byNumber.values()) for (const l of page.links) linkedUrls.add(l.url);
  for (const loose of crawl.looseDocuments) {
    if (classifyDocument({ url: loose.url, text: loose.text }) !== "retificacao") continue;
    const numbers = findEditalNumbers(`${loose.text} ${decodeURIComponent(loose.url)}`);
    if (!numbers.some((n) => byNumber.has(n)) && !linkedUrls.has(loose.url)) stats.retificacoes_sem_vinculo++;
  }
  return stats;
}

export interface RunOptions extends CrawlOptions {
  trigger: CollectionRun["trigger"];
  triggeredBy: string | null;
}

/** Executa a coleta com registro de início/fim e trava contra execução concorrente. */
export async function runCollection(store: LupaStore, sourceId: string, opts: RunOptions): Promise<CollectionRun> {
  const source = await store.getSource(sourceId);
  if (!source) throw new Error(`Fonte desconhecida: ${sourceId}`);
  if (!source.enabled) throw new Error(`Fonte desativada: ${sourceId}`);
  const run = await store.startRun(sourceId, opts.trigger, opts.triggeredBy); // lança ConcurrentRunError
  try {
    const crawl = await crawlSource(source, opts);
    const stats = await persistCrawl(store, source, crawl);
    const status: CollectionRun["status"] =
      crawl.pagesFetched > 0 && crawl.errors.length >= crawl.pagesFetched ? "failed" : crawl.errors.length > 0 || crawl.stoppedBy !== "concluido" ? "partial" : "succeeded";
    return await store.finishRun(run.id, {
      status,
      stats: { ...stats, limite_atingido: crawl.stoppedBy === "concluido" ? 0 : 1 },
      errors: crawl.errors.slice(0, 50),
    });
  } catch (err) {
    return store.finishRun(run.id, {
      status: "failed",
      stats: {},
      errors: [{ url: source.base_url, message: err instanceof Error ? err.message : String(err) }],
    });
  }
}

export { ConcurrentRunError };
