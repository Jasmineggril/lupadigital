/**
 * @file lib/pdf/extract.ts
 * @description Extração de texto de PDF isolada em worker_threads, com interrupção REAL.
 *
 *  - tempo-limite: o worker é encerrado (terminate), liberando CPU e memória;
 *  - teto de memória do worker (resourceLimits): estouro derruba o worker, não o servidor;
 *  - simultaneidade limitada (semáforo) e fila curta: excesso recebe "ocupado" em vez de enfileirar sem fim;
 *  - limites de tamanho, páginas e caracteres por página; conteúdo cortado vem marcado (truncated);
 *  - um worker novo por documento (nada fica de um PDF para o outro) e sempre encerrado no fim;
 *  - sem retentativa automática: quem chama decide (a coleta registra o erro e segue).
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export const PDF_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxPages: 120,
  maxCharsPerPage: 12_000,
  timeoutMs: 20_000,
  maxConcurrent: 2,
  maxQueued: 6,
  memoryMb: 256,
};

export type PdfFailure = "timeout" | "memoria" | "protegido" | "invalido" | "ocupado" | "grande_demais" | "indisponivel" | "erro";

export class PdfExtractError extends Error {
  constructor(public kind: PdfFailure, message: string) {
    super(message);
  }
}

export interface PdfText {
  pages: Array<{ page: number; text: string }>;
  total: number;
  /** true = nem tudo foi lido (páginas ou texto acima do limite) */
  truncated: boolean;
}

/** Local do worker: ao lado do bundle (api/_pdf-worker.mjs, dist/pdf-worker.mjs) ou no código-fonte. */
export function resolveWorkerFile(): string | null {
  const candidates = [
    process.env.LUPA_PDF_WORKER,
    fileURLToPath(new URL("./_pdf-worker.mjs", import.meta.url)),
    fileURLToPath(new URL("./pdf-worker.mjs", import.meta.url)),
  ].filter(Boolean) as string[];
  return candidates.find((f) => existsSync(f)) ?? null;
}

// ── Semáforo ──────────────────────────────────────────────────────────────────
let running = 0;
const waiting: Array<() => void> = [];
async function acquire(limits: typeof PDF_LIMITS): Promise<() => void> {
  if (running >= limits.maxConcurrent) {
    if (waiting.length >= limits.maxQueued) throw new PdfExtractError("ocupado", "Muitos PDFs em processamento agora. Tente de novo em instantes.");
    await new Promise<void>((r) => waiting.push(r));
  }
  running++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    running--;
    waiting.shift()?.();
  };
}
export function pdfQueueState() {
  return { running, waiting: waiting.length };
}

export async function extractPdfText(bytes: Uint8Array, overrides: Partial<typeof PDF_LIMITS> & { signal?: AbortSignal } = {}): Promise<PdfText> {
  const limits = { ...PDF_LIMITS, ...overrides };
  if (bytes.byteLength > limits.maxBytes) throw new PdfExtractError("grande_demais", "Arquivo acima do limite de tamanho.");
  const file = resolveWorkerFile();
  if (!file) throw new PdfExtractError("indisponivel", "Leitor de PDF indisponível neste ambiente.");
  const release = await acquire(limits);
  // Cópia própria transferida ao worker (o buffer de quem chamou não é tocado)
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const worker = new Worker(file, {
    resourceLimits: { maxOldGenerationSizeMb: limits.memoryMb, maxYoungGenerationSizeMb: 32 },
    stdout: true,
    stderr: true,
  });
  try {
    return await new Promise<PdfText>((resolve, reject) => {
      const timer = setTimeout(() => reject(new PdfExtractError("timeout", `Leitura do PDF passou de ${Math.round(limits.timeoutMs / 1000)} s e foi interrompida.`)), limits.timeoutMs);
      const onAbort = () => reject(new PdfExtractError("erro", "Leitura cancelada."));
      overrides.signal?.addEventListener("abort", onAbort, { once: true });
      const done = () => {
        clearTimeout(timer);
        overrides.signal?.removeEventListener("abort", onAbort);
      };
      worker.once("message", (msg: { ok: boolean; kind?: PdfFailure; message?: string } & PdfText) => {
        done();
        if (msg.ok) resolve({ pages: msg.pages, total: msg.total, truncated: msg.truncated });
        else reject(new PdfExtractError(msg.kind ?? "erro", msg.message ?? "Falha ao ler o PDF."));
      });
      worker.once("error", (err: Error & { code?: string }) => {
        done();
        reject(
          err.code === "ERR_WORKER_OUT_OF_MEMORY"
            ? new PdfExtractError("memoria", "O PDF exigiu memória demais e a leitura foi interrompida.")
            : new PdfExtractError("erro", "Falha ao ler o PDF."),
        );
      });
      worker.once("exit", (code) => {
        done();
        reject(new PdfExtractError("erro", `Leitor de PDF encerrou inesperadamente (código ${code}).`));
      });
      worker.postMessage({ bytes: data, maxPages: limits.maxPages, maxCharsPerPage: limits.maxCharsPerPage }, [data.buffer]);
    });
  } finally {
    // Sempre encerra: sucesso, erro, tempo-limite ou cancelamento
    await worker.terminate().catch(() => {});
    release();
  }
}
