/**
 * @file collector/parse.ts
 * @description Classificação de páginas e extração estruturada de editais.
 *
 * Regras de classificação:
 *   - documento:    link para arquivo (.pdf, .docx…). Não é baixado; vira anexo do edital
 *                   da página onde foi encontrado, com tipo (edital/anexo/retificação/resultado).
 *   - oportunidade: página dedicada a UMA chamada: o título traz um número de edital
 *                   (ex.: "Edital nº 05/2026") e o corpo não lista vários editais diferentes.
 *   - categoria:    páginas agregadoras/listas (vários números de edital, ou nenhum).
 *                   NUNCA viram edital no catálogo; só servem para descobrir links.
 *
 * Extração: cada campo encontrado guarda o valor, o trecho (evidência) e a URL.
 * O que não for encontrado entra em missing_fields ("não encontrado / pendente de verificação").
 */

import { officialSubmissionDeadline, parseDateMentions, type DeadlineCandidate } from "../deadlines";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { DocumentKind, EventKind, Evidenced, OpportunityFields, OpportunityStatus } from "../types";
import { EXTRACTED_FIELD_KEYS, OPTIONAL_FIELD_KEYS } from "../types";
import { isDocumentUrl, normalizeUrl } from "./urls";

export type PageKind = "categoria" | "oportunidade";

export interface PageLink {
  url: string;
  text: string;
}

export interface ParsedPage {
  url: string;
  title: string;
  text: string;
  links: PageLink[];
}

/** "Edital nº 05/2026", "EDITAL N° 5/2026", "Chamada Pública 03/2025" → "05/2026" */
const EDITAL_NUMBER = /\b(?:edital|chamada(?:\s+p[úu]blica)?)\s*(?:n[º°o.]*\s*)?(\d{1,3})\s*[/-]\s*(\d{4})\b/gi;

export function normalizeEditalNumber(n: string, year: string): string {
  return `${n.padStart(2, "0")}/${year}`;
}

export function findEditalNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(EDITAL_NUMBER)) found.add(normalizeEditalNumber(m[1], m[2]));
  return [...found];
}

export function parseHtml(url: string, html: string): ParsedPage {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();
  const links: PageLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const abs = normalizeUrl(href, url);
    if (!abs) return;
    const text = $(el).text().replace(/\s+/g, " ").trim() || ($(el).attr("title") ?? "").trim();
    links.push({ url: abs, text });
  });
  // Conteúdo principal, sem menus/rodapé, para não confundir a classificação
  $("nav, header, footer, aside, [role='navigation'], .menu, #menu, .breadcrumb, .sidebar").remove();
  const main = $("main, article, [role='main'], .entry-content, .content, #content").first();
  const scope = main.length ? main : $("body");
  const title = ($("h1").first().text() || $("title").text() || "").replace(/\s+/g, " ").trim();
  const text = scope
    .find("p, li, td, th, h1, h2, h3, h4, dd, dt, div")
    .toArray()
    .filter((el) => $(el).children("p, li, div, table, ul, ol").length === 0)
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { url, title, text: text || scope.text().replace(/\s+/g, " ").trim(), links };
}

export function classifyPage(page: ParsedPage): PageKind {
  const titleNumbers = findEditalNumbers(page.title);
  if (titleNumbers.length !== 1) return "categoria";
  // Página que lista vários editais diferentes (além do próprio) é agregadora
  const bodyNumbers = findEditalNumbers(page.text).filter((n) => n !== titleNumbers[0]);
  const linkedOpportunityPages = page.links.filter(
    (l) => !isDocumentUrl(l.url) && findEditalNumbers(l.text).some((n) => n !== titleNumbers[0]),
  );
  if (bodyNumbers.length >= 3 || linkedOpportunityPages.length >= 3) return "categoria";
  return "oportunidade";
}

export function classifyDocument(link: PageLink): DocumentKind {
  const s = `${link.text} ${decodeURIComponent(new URL(link.url).pathname)}`.toLowerCase();
  if (/retifica|errata/.test(s)) return "retificacao";
  if (/resultado|homologa|classifica[cç][aã]o|aprovad/.test(s)) return "resultado";
  if (/anexo|formul[aá]rio|modelo|declara[cç][aã]o|planilha/.test(s)) return "anexo";
  if (/edital|chamada/.test(s)) return "edital";
  return "outro";
}

// ── Extração ─────────────────────────────────────────────────────────────────

function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 600);
}

function grab(lines: string[], re: RegExp, url: string, limit = 6): Evidenced[] {
  const out: Evidenced[] = [];
  const seen = new Set<string>();
  for (const s of lines) {
    if (!re.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push({ value: s, evidence: s, source_url: url });
    if (out.length >= limit) break;
  }
  return out;
}


function extractDates(lines: string[], url: string) {
  // Regra única (deadlines.ts): só datas reais; rótulo do trecho anterior; horário/fuso só se informados
  const out: NonNullable<OpportunityFields["datas"]> = [];
  for (const s of lines) {
    for (const d of parseDateMentions(s)) {
      out.push({ label: d.rotulo, value: s, evidence: s, source_url: url, iso: d.iso, ...(d.hora ? { hora: d.hora } : {}), ...(d.fuso ? { fuso: d.fuso } : {}) });
      if (out.length >= 16) return out;
    }
  }
  return out;
}

/** Datas do edital no formato da regra única de prazos. */
export function datesAsCandidates(fields: OpportunityFields): DeadlineCandidate[] {
  return (fields.datas ?? []).map((d) => ({ rotulo: d.label, data: d.iso, hora: d.hora ?? null, fuso: d.fuso ?? null, origem: "edital" as const, evidencia: d.evidence }));
}

/**
 * Situação da chamada. Só usa o texto da PRÓPRIA página da oportunidade (o crawler
 * nunca chama isto em página de categoria). Suspensão/cancelamento exigem frase
 * que se refira ao edital/chamada — a palavra solta não basta.
 * Encontrar "retificação" ou "prorrogação" NÃO muda a situação: são eventos.
 */
export function inferStatus(fields: OpportunityFields, text: string, now = new Date()): OpportunityStatus {
  if (/\b(edital|chamada|processo seletivo)\b[^.\n]{0,40}\b(cancelad[oa]|revogad[oa]|anulad[oa])\b|\b(cancelamento|revoga[cç][aã]o|anula[cç][aã]o)\s+d[oa]\s+(edital|chamada)\b/i.test(text)) return "cancelada";
  if (/\b(edital|chamada|processo seletivo)\b[^.\n]{0,40}\bsuspens[oa]\b|\bsuspens[aã]o\s+d[oa]\s+(edital|chamada)\b/i.test(text)) return "suspensa";
  if (/\b(edital|chamada)\s+(encerrad[oa]|finalizad[oa])\b|inscri[cç][õo]es\s+encerradas/i.test(text)) return "encerrada";
  const official = officialSubmissionDeadline(datesAsCandidates(fields), now.toISOString().slice(0, 10));
  if (!official) return "desconhecida";
  return official.situacao;
}

export function extractFields(page: ParsedPage): { fields: OpportunityFields; missing: string[] } {
  const lines = sentences(page.text);
  const url = page.url;
  const fields: OpportunityFields = {};

  const objeto = lines.find((s) => /\bobjeto\b|tem por (objetivo|finalidade)|tem como objetivo/i.test(s));
  if (objeto) fields.objeto = { value: objeto, evidence: objeto, source_url: url };

  const areaLine = lines.find((s) => /[áa]reas?\s+(do conhecimento|tem[áa]ticas?|priorit[áa]rias?|de atua[cç][aã]o)|linhas? tem[áa]ticas?/i.test(s));
  if (areaLine) {
    const after = areaLine.split(/:\s*/).slice(1).join(": ") || areaLine;
    const items = after
      .split(/[;,]|\s+e\s+/)
      .map((x) => x.replace(/[.]$/, "").trim())
      .filter((x) => x.length >= 3 && x.length <= 80);
    if (items.length) fields.areas = { value: items, evidence: areaLine, source_url: url };
  }

  const eleg = grab(lines, /poder[aã]o\s+(participar|concorrer|submeter)|eleg[ií]ve|\bproponente\b.*\b(dever[áa]|deve)\b|t[ií]tulo de (doutor|mestre)|v[ií]nculo (empregat[ií]cio|funcional|institucional|efetivo)|sediad[ao]s?\s+no\s+(distrito federal|df)/i, url);
  if (eleg.length) fields.elegibilidade = eleg;

  const req = grab(lines, /\brequisitos?\b|\bexig[eê]ncias?\b|\bdever[aá]\s+(apresentar|possuir|comprovar)/i, url);
  if (req.length) fields.requisitos = req;

  const valores = grab(lines, /R\$\s?\d/i, url);
  if (valores.length) fields.valores = valores;

  const docs = grab(lines, /documentos?\s+(necess[aá]rios|exigidos|obrigat[oó]rios)|dever[aá]\s+anexar|curr[ií]culo lattes|plano de trabalho/i, url);
  if (docs.length) fields.documentos = docs;

  const datas = extractDates(lines, url);
  if (datas.length) fields.datas = datas;

  const restr = grab(lines, /\bvedad[oa]s?\b|n[aã]o\s+poder[aã]o|[ée]\s+proibid|n[aã]o\s+ser[aã]o\s+aceit/i, url);
  if (restr.length) fields.restricoes = restr;

  const contra = grab(lines, /\bcontrapartida/i, url);
  if (contra.length) fields.contrapartidas = contra;

  const parc = grab(lines, /\bparceri|\bcoopera[cç][aã]o\s+(com|entre)|\bconsórcio|\binstitui[cç][aã]o\s+parceira|\bco-?executora/i, url);
  if (parc.length) fields.parcerias = parc;

  const crit = grab(lines, /crit[eé]rios?\s+(de\s+)?(avalia[cç][aã]o|julgamento|sele[cç][aã]o|classifica[cç][aã]o)|\bpontua[cç][aã]o\b|\bnota\s+(m[ií]nima|final)/i, url);
  if (crit.length) fields.criterios_avaliacao = crit;

  const canal = grab(lines, /(inscri[cç][õo]es|propostas|submiss[aã]o)\s+(ser[aã]o|dever[aã]o ser)\s+(realizad|feit|enviad|submetid)|\bsistema\s+[A-Z]|\bplataforma\b|\bformul[aá]rio\s+eletr[oô]nico|\bpor\s+meio\s+do\s+(site|sistema|endere[cç]o)/i, url, 3);
  if (canal.length) fields.canal_inscricao = canal;

  const missing = EXTRACTED_FIELD_KEYS.filter((k) => fields[k] === undefined && !OPTIONAL_FIELD_KEYS.has(k));
  return { fields, missing };
}

export function eventsFromDocuments(docs: Array<{ url: string; kind: DocumentKind; title: string }>, text: string, url: string) {
  const events: Array<{ kind: EventKind; title: string; url: string | null; event_date: string | null; evidence: string }> = [];
  for (const d of docs) {
    if (d.kind === "retificacao") events.push({ kind: "retificacao", title: d.title, url: d.url, event_date: null, evidence: d.title });
    if (d.kind === "resultado") events.push({ kind: "resultado", title: d.title, url: d.url, event_date: null, evidence: d.title });
  }
  for (const s of sentences(text)) {
    if (/prorroga/i.test(s)) {
      events.push({ kind: "prorrogacao", title: s.slice(0, 160), url, event_date: null, evidence: s });
      break;
    }
  }
  return events;
}

export function contentHash(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
