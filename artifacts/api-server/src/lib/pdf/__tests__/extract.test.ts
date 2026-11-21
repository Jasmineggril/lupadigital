/**
 * Extração de PDF isolada em worker: interrupção REAL (terminate), teto de memória,
 * simultaneidade, limites e limpeza. PDFs gerados no teste (fictícios), sem rede.
 */
import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { makePdf } from "../../lupa/__tests__/pdfFixtures";
import { PdfExtractError, extractPdfText, pdfQueueState } from "../extract";

const here = (f: string) => fileURLToPath(new URL(f, import.meta.url));

afterEach(() => {
  delete process.env.LUPA_PDF_WORKER;
});

describe("extractPdfText (worker isolado)", () => {
  it("extrai texto por página", async () => {
    const out = await extractPdfText(makePdf(["Pagina um: inscricoes ate 30/06/2099.", "Pagina dois: requisitos do edital."]));
    expect(out.total).toBe(2);
    expect(out.truncated).toBe(false);
    expect(out.pages[0].text).toContain("30/06/2099");
    expect(out.pages[1].text).toContain("requisitos");
  });

  it("excesso de páginas: lê até o limite e marca como parcial", async () => {
    const out = await extractPdfText(makePdf(["a página 1 tem texto suficiente", "b página 2", "c página 3", "d página 4"]), { maxPages: 2 });
    expect(out.total).toBe(4);
    expect(out.pages).toHaveLength(2);
    expect(out.truncated).toBe(true);
  });

  it("texto acima do limite por página é cortado e marcado como parcial", async () => {
    const out = await extractPdfText(makePdf(["x".repeat(400)]), { maxCharsPerPage: 50 });
    expect(out.pages[0].text.length).toBe(50);
    expect(out.truncated).toBe(true);
  });

  it("arquivo inválido é recusado sem derrubar o processo", async () => {
    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nisto não é um pdf de verdade"))).rejects.toBeInstanceOf(PdfExtractError);
  });

  it("arquivo acima do limite de bytes é recusado antes de abrir o worker", async () => {
    await expect(extractPdfText(new Uint8Array(2048), { maxBytes: 1024 })).rejects.toMatchObject({ kind: "grande_demais" });
  });

  it("extração travada é INTERROMPIDA no tempo-limite (o worker é encerrado)", async () => {
    process.env.LUPA_PDF_WORKER = here("./worker-travado.mjs");
    const t0 = Date.now();
    await expect(extractPdfText(makePdf(["qualquer"]), { timeoutMs: 300 })).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - t0).toBeLessThan(5000);
    // Se o laço continuasse rodando, o próximo teste com worker real ficaria sem vaga/CPU
    expect(pdfQueueState()).toEqual({ running: 0, waiting: 0 });
  });

  it("estouro de memória derruba só o worker", async () => {
    process.env.LUPA_PDF_WORKER = here("./worker-memoria.mjs");
    await expect(extractPdfText(makePdf(["x"]), { memoryMb: 32, timeoutMs: 20_000 })).rejects.toMatchObject({ kind: "memoria" });
    expect(pdfQueueState().running).toBe(0);
  }, 30_000);

  it("cancelamento interrompe e libera a vaga", async () => {
    process.env.LUPA_PDF_WORKER = here("./worker-travado.mjs");
    const ac = new AbortController();
    const p = extractPdfText(makePdf(["x"]), { timeoutMs: 10_000, signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    await expect(p).rejects.toBeInstanceOf(PdfExtractError);
    expect(pdfQueueState()).toEqual({ running: 0, waiting: 0 });
  });

  it("múltiplas extrações: no máximo N simultâneas, fila limitada, todas limpas no fim", async () => {
    const pdf = makePdf(["Documento fictício com texto suficiente para leitura."]);
    let peak = 0;
    const timer = setInterval(() => (peak = Math.max(peak, pdfQueueState().running)), 5);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => extractPdfText(pdf, { maxConcurrent: 2, maxQueued: 3 })));
    clearInterval(timer);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const busy = results.filter((r) => r.status === "rejected" && (r.reason as PdfExtractError).kind === "ocupado").length;
    expect(peak).toBeLessThanOrEqual(2);
    expect(ok).toBe(5); // 2 rodando + 3 na fila
    expect(busy).toBe(5);
    expect(pdfQueueState()).toEqual({ running: 0, waiting: 0 });
  });

  it("worker que não carrega: falha com erro conhecido e libera a vaga (nunca lê no processo principal)", async () => {
    process.env.LUPA_PDF_WORKER = here("./extract.test.ts"); // existe, mas não é um worker válido
    await expect(extractPdfText(makePdf(["x"]), { timeoutMs: 5000 })).rejects.toBeInstanceOf(PdfExtractError);
    expect(pdfQueueState()).toEqual({ running: 0, waiting: 0 });
  });
});
