/**
 * @file collector/documents.ts
 * @description Processamento dos DOCUMENTOS oficiais (PDF) achados na coleta.
 *
 * Antes: o coletor só registrava os links; as regras que estão no PDF (requisitos, valores,
 * prazos) nunca eram lidas, e um PDF trocado na mesma URL passava despercebido.
 *
 * Agora, para cada documento (edital, anexo, retificação, resultado):
 *  - baixa com a mesma proteção de URL da coleta (hosts permitidos, SSRF, timeout, tamanho);
 *  - valida que é PDF (assinatura %PDF-);
 *  - calcula o hash do CONTEÚDO (detecta substituição na mesma URL);
 *  - extrai o texto POR PÁGINA (a evidência cita a página);
 *  - se não houver texto (escaneado), marca "sem_texto" — o OCR no servidor depende de
 *    configuração e NÃO é simulado;
 *  - reaproveita o que já foi lido quando o hash não mudou (reprocessa só o necessário).
 */
import { createHash } from "node:crypto";
// pdf.js 2.0.550 (o que vem no pdf-parse), importado pelo caminho FIXO para o bundle incluir.
// O padrão do pdf-parse (1.10.100) falha em alguns PDFs válidos ("bad XRef entry") e escolhe a
// versão com require dinâmico, que não funciona dentro do bundle da Vercel.
// @ts-expect-error — build UMD sem tipos
import * as PDFJS from "pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js";

interface PdfTextItem {
  str: string;
  transform?: number[];
}
interface PdfPage {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
}
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
}
const pdfjs = ((PDFJS as { default?: unknown }).default ?? PDFJS) as { disableWorker?: boolean; getDocument: (src: unknown) => { promise: Promise<PdfDoc> } };
pdfjs.disableWorker = true;
import type { OpportunityDocument } from "../types";

export interface FetchedDocument {
  url: string;
  status: number;
  contentType: string;
  bytes: Uint8Array;
}
export type DocumentFetcher = (url: string) => Promise<FetchedDocument>;

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_RUN = 40;
export const MAX_PAGES_STORED = 120;
const MAX_TEXT_PER_PAGE = 12_000;

export interface PageText {
  page: number;
  text: string;
}

export type ProcessedDocument = OpportunityDocument;

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

export function documentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Texto por página (quebra de linha quando muda a posição vertical). */
export async function pdfPages(bytes: Uint8Array): Promise<{ pages: PageText[]; total: number }> {
  // Cópia com memória própria (o pdf.js pode reter/transferir o buffer)
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const pages: PageText[] = [];
    const last = Math.min(doc.numPages, MAX_PAGES_STORED);
    for (let n = 1; n <= last; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let prevY: number | null = null;
      let text = "";
      for (const it of content.items) {
        const y = it.transform?.[5] ?? null;
        text += prevY !== null && y !== null && Math.abs(y - prevY) > 2 ? `\n${it.str}` : it.str;
        prevY = y;
      }
      pages.push({ page: n, text: text.replace(/[ \t]+/g, " ").trim().slice(0, MAX_TEXT_PER_PAGE) });
    }
    return { pages, total: doc.numPages };
  } finally {
    await doc.destroy().catch(() => {});
  }
}

/**
 * Baixa e lê um documento. `previous` = mesmo documento numa coleta anterior: se o hash do
 * conteúdo não mudou, reaproveita a leitura (não reprocessa).
 */
export async function processDocument(doc: OpportunityDocument, fetchDoc: DocumentFetcher, previous?: ProcessedDocument | null, now = new Date()): Promise<ProcessedDocument> {
  const base: ProcessedDocument = { url: doc.url, kind: doc.kind, title: doc.title, fetched_at: now.toISOString() };
  let fetched: FetchedDocument;
  try {
    fetched = await fetchDoc(doc.url);
  } catch (err) {
    return { ...base, text_status: "erro", error: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
  }
  if (fetched.status >= 400) return { ...base, text_status: "erro", error: `HTTP ${fetched.status}` };
  if (fetched.bytes.length > MAX_DOCUMENT_BYTES) return { ...base, text_status: "invalido", error: "Arquivo acima do limite de tamanho." };
  if (!isPdf(fetched.bytes)) return { ...base, text_status: "invalido", size_bytes: fetched.bytes.length, error: "Não é um PDF válido." };
  const hash = documentHash(fetched.bytes);
  if (previous?.content_hash === hash && previous.text_status && previous.text_status !== "erro") {
    return { ...previous, fetched_at: base.fetched_at, reused: true };
  }
  try {
    const { pages, total } = await pdfPages(fetched.bytes);
    const hasText = pages.some((p) => p.text.length >= 30);
    return {
      ...base,
      content_hash: hash,
      size_bytes: fetched.bytes.length,
      page_count: total,
      text_status: hasText ? (total > MAX_PAGES_STORED ? "parcial" : "extraido") : "sem_texto",
      ...(hasText ? {} : { error: "PDF sem camada de texto (provavelmente escaneado). OCR no servidor não configurado; confira o documento oficial." }),
      pages: hasText ? pages : [],
    };
  } catch (err) {
    return { ...base, content_hash: hash, size_bytes: fetched.bytes.length, text_status: "invalido", error: `PDF corrompido ou protegido: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` };
  }
}
