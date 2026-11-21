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
// Leitura isolada em worker (pdf.js 6.5, tempo-limite com encerramento real, teto de memória)
import { PDF_LIMITS, PdfExtractError, extractPdfText } from "../../pdf/extract";
import type { OpportunityDocument } from "../types";

export interface FetchedDocument {
  url: string;
  status: number;
  contentType: string;
  bytes: Uint8Array;
}
export type DocumentFetcher = (url: string) => Promise<FetchedDocument>;

export const MAX_DOCUMENT_BYTES = PDF_LIMITS.maxBytes;
export const MAX_DOCUMENTS_PER_RUN = 40;
export const MAX_PAGES_STORED = PDF_LIMITS.maxPages;

export interface PageText {
  page: number;
  text: string;
}

export type ProcessedDocument = OpportunityDocument;

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

export function documentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Texto por página, lido no worker isolado. `truncated` = páginas ou texto acima do limite. */
export async function pdfPages(bytes: Uint8Array): Promise<{ pages: PageText[]; total: number; truncated: boolean }> {
  return extractPdfText(bytes);
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
    const { pages, total, truncated } = await pdfPages(fetched.bytes);
    const hasText = pages.some((p) => p.text.length >= 30);
    return {
      ...base,
      content_hash: hash,
      size_bytes: fetched.bytes.length,
      page_count: total,
      // Nunca "extraido" se algo ficou de fora: parcial é sinalizado
      text_status: hasText ? (truncated ? "parcial" : "extraido") : "sem_texto",
      ...(hasText
        ? truncated
          ? { error: `Leitura parcial: limite de ${MAX_PAGES_STORED} páginas ou de texto por página atingido. Confira o documento oficial.` }
          : {}
        : { error: "PDF sem camada de texto (provavelmente escaneado). OCR no servidor não configurado; confira o documento oficial." }),
      pages: hasText ? pages : [],
    };
  } catch (err) {
    const kind = err instanceof PdfExtractError ? err.kind : "erro";
    const message =
      kind === "protegido"
        ? "PDF protegido por senha; não foi possível ler."
        : kind === "timeout" || kind === "memoria"
          ? `Leitura interrompida (${kind === "timeout" ? "tempo-limite" : "memória"}). Confira o documento oficial.`
          : kind === "ocupado"
            ? "Leitor de PDF ocupado; será tentado na próxima coleta."
            : `PDF corrompido ou ilegível: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`;
    // Falha temporária (tempo, memória, ocupado) fica como "erro" para ser tentada de novo na próxima coleta
    const status = kind === "protegido" || kind === "invalido" ? "invalido" : "erro";
    return { ...base, content_hash: hash, size_bytes: fetched.bytes.length, text_status: status, error: message };
  }
}
