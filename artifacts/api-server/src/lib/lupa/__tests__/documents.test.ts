/**
 * Coleta dos DOCUMENTOS oficiais (PDF), em ambiente controlado (fixtures fictícias, sem rede):
 * HTML mínimo com regras no PDF; PDF trocado na mesma URL; retificação com prorrogação;
 * arquivo inválido; PDF sem texto (OCR indisponível); reexecução sem duplicar.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../store";
import { runCollection } from "../collector/crawler";
import { fixtureFetcher } from "./fixtures";
import { fixtureDocumentFetcher, makePdf } from "./pdfFixtures";
import { submissionDeadline } from "../../../routes/lupa";

const BASE = "https://www.fap.df.gov.br";
const MAIN = `${BASE}/arquivos/edital-04-2026.pdf`;
const RET = `${BASE}/arquivos/retificacao-01-edital-04-2026.pdf`;
const page = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const PAGES = (withRet = false) => ({
  [`${BASE}/editais`]: page("Editais abertos", `<ul><li><a href="${BASE}/editais/edital-04-2026">Edital nº 04/2026 – Pesquisa em dados abertos</a></li><li><a href="${BASE}/editais/edital-05-2026">Edital nº 05/2026 – Eventos</a></li></ul>`),
  [`${BASE}/editais/edital-04-2026`]: page(
    "Edital nº 04/2026 – Pesquisa em dados abertos",
    `<p>Leia o edital completo no PDF.</p><p><a href="${MAIN}">Edital nº 04/2026 (PDF)</a></p>${withRet ? `<p><a href="${RET}">Retificação nº 01 do Edital nº 04/2026</a></p>` : ""}`,
  ),
});
const PDF_V1 = makePdf([
  "EDITAL Nº 04/2026 (FICTÍCIO)\n1. DO OBJETO. O presente edital tem por objeto apoiar projetos de pesquisa em dados abertos.",
  "3. DA ELEGIBILIDADE. Poderão participar pesquisadores com título de mestre ou doutor.\n4. Valor: até R$ 80.000,00 por projeto.\n5. Inscrições até 10/12/2099.",
]);
const PDF_V2 = makePdf([
  "EDITAL Nº 04/2026 (FICTÍCIO)\n1. DO OBJETO. O presente edital tem por objeto apoiar projetos de pesquisa em dados abertos.",
  "3. DA ELEGIBILIDADE. Poderão participar pesquisadores com título de doutor.\n4. Valor: até R$ 60.000,00 por projeto.\n5. Inscrições até 10/12/2099.",
]);
const noSleep = async () => {};
let store: MemoryStore;
const run = (docs: Record<string, Uint8Array | Error>, withRet = false) =>
  runCollection(store, "fapdf", { fetcher: fixtureFetcher(PAGES(withRet)).fetcher, documentFetcher: fixtureDocumentFetcher(docs).fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
const edital04 = async () => (await store.listOpportunities()).find((o) => o.edital_number === "04/2026")!;

beforeEach(async () => {
  store = new MemoryStore();
  await store.updateSource("fapdf", { request_delay_ms: 0, start_urls: [`${BASE}/editais`] });
});

describe("leitura dos documentos oficiais", () => {
  it("HTML mínimo + regras no PDF: campos vêm do PDF com a página na evidência", async () => {
    const r = await run({ [MAIN]: PDF_V1 });
    expect(r.stats.documentos_lidos).toBe(1);
    const o = await edital04();
    const doc = o.documents.find((d) => d.url === MAIN)!;
    expect(doc).toMatchObject({ text_status: "extraido", page_count: 2 });
    expect(doc.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(o.fields.valores?.[0].evidence).toContain("80.000,00");
    expect(o.fields.valores?.[0].source_url).toBe(`${MAIN}#page=2`);
    expect(o.fields.elegibilidade?.[0].evidence).toContain("mestre ou doutor");
    expect(submissionDeadline(o, "2099-01-01")).toBe("2099-12-10");
    expect(o.missing_fields.join(" ")).not.toContain("documento_oficial");
  });

  it("PDF trocado na MESMA URL: novo hash → nova versão, com a mudança rastreável", async () => {
    await run({ [MAIN]: PDF_V1 });
    const v1 = await edital04();
    await run({ [MAIN]: PDF_V2 });
    const v2 = await edital04();
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.documents[0].content_hash).not.toBe(v1.documents[0].content_hash);
    expect(v2.fields.valores?.[0].evidence).toContain("60.000,00");
  });

  it("reexecução sem mudança: reaproveita a leitura e não duplica", async () => {
    await run({ [MAIN]: PDF_V1 });
    const second = await run({ [MAIN]: PDF_V1 });
    expect(second.stats.documentos_reaproveitados).toBe(1);
    expect(second.stats.inalteradas).toBeGreaterThanOrEqual(1);
    expect((await store.listOpportunities()).filter((o) => o.edital_number === "04/2026")).toHaveLength(1);
    expect((await edital04()).version).toBe(1);
  });

  it("retificação com prorrogação: a nova data vale como prazo oficial", async () => {
    await run({ [MAIN]: PDF_V1, [RET]: makePdf(["RETIFICAÇÃO Nº 01 DO EDITAL Nº 04/2026 (FICTÍCIA)\nO prazo de inscrições fica prorrogado até 20/01/2100."]) }, true);
    const o = await edital04();
    expect(o.documents.find((d) => d.url === RET)?.text_status).toBe("extraido");
    expect(o.events.some((e) => e.kind === "retificacao")).toBe(true);
    expect(submissionDeadline(o, "2099-01-01")).toBe("2100-01-20");
  });

  it("arquivo inválido (não é PDF): marcado e o edital NÃO é dado como completo", async () => {
    const r = await run({ [MAIN]: new TextEncoder().encode("<html>erro 500</html>") });
    expect(r.stats.documentos_com_falha).toBe(1);
    const o = await edital04();
    expect(o.documents[0]).toMatchObject({ text_status: "invalido" });
    expect(o.missing_fields.some((m) => m.startsWith("documento_oficial"))).toBe(true);
  });

  it("PDF sem texto (escaneado) com OCR indisponível: limitação sinalizada, nada inventado", async () => {
    await run({ [MAIN]: makePdf(["", ""]) });
    const o = await edital04();
    expect(o.documents[0].text_status).toBe("sem_texto");
    expect(o.documents[0].error).toContain("OCR");
    expect(o.fields.valores).toBeUndefined();
    expect(o.missing_fields.some((m) => m.startsWith("documento_oficial"))).toBe(true);
  });

  it("falha de rede no download: registrada como erro do documento, coleta continua", async () => {
    const r = await run({ [MAIN]: new Error("tempo esgotado") });
    expect(r.status).not.toBe("failed");
    expect((await edital04()).documents[0]).toMatchObject({ text_status: "erro", error: "tempo esgotado" });
  });
});
