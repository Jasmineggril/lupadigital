import type { ExtractedDocument } from "./types";

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<ExtractedDocument> {
  // Tenta usar pdfjs-dist para extrair texto de PDFs digitais.
  try {
    // import dynamic para não falhar se a dependência não estiver instalada
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const doc = await loadingTask.promise;
    const numPages = doc.numPages || 0;
    let fullText = "";
    for (let i = 1; i <= numPages; i++) {
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(i);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      const pageText = content.items.map((it: any) => it.str).join(" ");
      fullText += (pageText + "\n\n");
    }

    return {
      id: `pdf-${Date.now()}`,
      text: fullText,
      title: undefined,
      pages: numPages,
      metadata: { extractedWith: "pdfjs", scanned: fullText.trim().length === 0 },
    };
  } catch (err) {
    // Se pdfjs não estiver disponível ou falhar, sinalizar que OCR é necessário
    return {
      id: `pdf-${Date.now()}`,
      text: "",
      title: undefined,
      pages: 0,
      metadata: { extractedWith: "none", scanned: true, ocrAvailable: false, error: (err as Error).message },
    };
  }
}
