import { v4 as uuidv4 } from "uuid";
import type {
  IngestRequest,
  RawDocument,
  ExtractedDocument,
  NormalizedDocument,
  ChunkedDocument,
  IngestResult,
  IngestError,
} from "./types";
import { fetchUrlContent, isPdfBuffer } from "./fetchers";

// Stubs iniciais da interface de ingestão. Implementações específicas (HTML, PDF,
// OCR, chunking, etc.) serão adicionadas posteriormente.

export async function ingest(request: IngestRequest): Promise<IngestResult> {
  try {
    // marcar documento bruto
    const raw: RawDocument = {
      id: request.id ?? uuidv4(),
      sourceType: request.sourceType,
      originalText: request.content,
      metadata: request.meta ?? {},
    };

    // fluxo simplificado: se já tem texto, retorna análise vazia (placeholder)
    if (request.sourceType === "text" && request.content) {
      const extracted: ExtractedDocument = {
        id: raw.id,
        text: request.content,
        title: undefined,
        pages: 1,
      };

        const normalized = await normalizeDocument(extracted);
        const aiChunks = chunkDocument(normalized.canonicalText);
        const chunked: ChunkedDocument = {
          id: normalized.id,
          chunks: aiChunks.map((c) => ({ id: c.chunkId, index: c.index, text: c.text, tokensEstimate: c.estimatedTokens, metadata: { pageStart: c.pageStart, pageEnd: c.pageEnd, sectionTitles: c.sectionTitles } })),
          originalTokensEstimate: normalized.tokensEstimate,
        };

        // Pipeline de IA ainda não implementada — retornamos estrutura de chunking
        return {
          success: false,
          error: { code: "not_implemented", message: "Pipeline de IA ainda não implementada" },
        };
    }

    return { success: false, error: { code: "unsupported", message: "Fonte não suportada ainda" } };
  } catch (err) {
    const e: IngestError = { code: "internal_error", message: (err as Error).message ?? String(err) };
    return { success: false, error: e };
  }
}

export async function extractFromUrl(url: string): Promise<ExtractedDocument> {
  // baixar e detectar HTML vs PDF, extrair texto (implementação mínima)
  const fetched = await fetchUrlContent(url);
  if (fetched.buffer && isPdfBuffer(fetched.buffer)) {
    // delegar a extractFromPdf para tratamento completo
    return extractFromPdf(fetched.buffer);
  }

  // tratar como HTML/text
  return {
    id: uuidv4(),
    text: fetched.text ?? "",
    title: undefined,
    pages: 1,
    metadata: { url: fetched.url, contentType: fetched.contentType },
  };
}

import { extractTextFromPdfBuffer } from "./pdfExtractor";
import { runOcrOnBuffer } from "./ocr";
import { normalizeExtracted } from "./normalizer";

export async function extractFromPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const extracted = await extractTextFromPdfBuffer(buffer);
  // Se o pdf parece escaneado e não há OCR disponível, retornar texto vazio e metadados
  if (extracted.metadata?.scanned && !extracted.metadata?.ocrAvailable) {
    // tentar OCR se disponível
    const ocr = await runOcrOnBuffer(buffer);
    if (ocr.success && ocr.text.trim().length > 0) {
      extracted.text = ocr.text;
      extracted.metadata = { ...(extracted.metadata ?? {}), ocrUsed: true };
    } else {
      extracted.metadata = { ...(extracted.metadata ?? {}), ocrUsed: false, ocrError: ocr.error };
    }
  }

  return extracted;
}


export async function normalizeDocument(extracted: ExtractedDocument): Promise<NormalizedDocument> {
  return normalizeExtracted(extracted);
}
