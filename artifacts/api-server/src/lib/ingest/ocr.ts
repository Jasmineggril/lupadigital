// OCR opcional via import dinâmico de `tesseract.js`.
// Não adicionamos dependência fixa para não inflar o bundle; se presente, será usada.
import type { ExtractedDocument } from "./types";

export async function runOcrOnBuffer(buffer: Buffer): Promise<{ text: string; success: boolean; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tesseract = await import("tesseract.js");
    const { createWorker } = tesseract;
    const worker = createWorker();
    await worker.load();
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    // tesseract.js aceita URL ou ImageData; tentar passar Buffer como blob URL não trivial
    // Aqui usamos a API recognize que aceita Buffer in node via node-canvas if disponível.
    const { data } = await worker.recognize(buffer as any);
    await worker.terminate();
    return { text: data?.text ?? "", success: true };
  } catch (err) {
    return { text: "", success: false, error: (err as Error).message };
  }
}
