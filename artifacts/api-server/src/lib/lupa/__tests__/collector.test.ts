/**
 * Coletor: classificação, limites, deduplicação, vínculo de retificações.
 * Usa FIXTURES CONTROLADAS (fictícias) — ver fixtures.ts.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore, defaultSources } from "../store";
import { crawlSource, persistCrawl, runCollection } from "../collector/crawler";
import { classifyPage, extractFields, findEditalNumbers, inferStatus, parseHtml } from "../collector/parse";
import { normalizeUrl } from "../collector/urls";
import { FIXTURE_PAGES, fixtureFetcher } from "./fixtures";

const BASE = "https://www.fap.df.gov.br";
const noSleep = async () => {};
const source = () => ({ ...defaultSources()[0], start_urls: [`${BASE}/editais/`] });

describe("URLs", () => {
  it("normaliza barra final, fragmento e rastreamento (evita ciclos e duplicatas)", () => {
    expect(normalizeUrl(`${BASE}/editais/edital-01-2026/?utm_source=x#topo`)).toBe(`${BASE}/editais/edital-01-2026`);
    expect(normalizeUrl("javascript:void(0)")).toBeNull();
  });
});

describe("classificação", () => {
  it("página de categoria (vários editais) não é edital", () => {
    expect(classifyPage(parseHtml(`${BASE}/editais`, FIXTURE_PAGES[`${BASE}/editais`]))).toBe("categoria");
    expect(classifyPage(parseHtml(`${BASE}/editais/arquivo-2025`, FIXTURE_PAGES[`${BASE}/editais/arquivo-2025`]))).toBe("categoria");
  });
  it("página dedicada a um edital é oportunidade", () => {
    expect(classifyPage(parseHtml(`${BASE}/editais/edital-01-2026`, FIXTURE_PAGES[`${BASE}/editais/edital-01-2026`]))).toBe("oportunidade");
  });
  it("normaliza números de edital", () => {
    expect(findEditalNumbers("EDITAL N° 5/2026 e Chamada Pública nº 12-2025")).toEqual(["05/2026", "12/2025"]);
  });
});

describe("extração", () => {
  it("extrai campos com evidência e marca ausentes como pendentes", () => {
    const p = parseHtml(`${BASE}/editais/edital-01-2026`, FIXTURE_PAGES[`${BASE}/editais/edital-01-2026`]);
    const { fields, missing } = extractFields(p);
    expect(fields.objeto?.evidence).toMatch(/inteligência artificial/);
    expect(fields.objeto?.source_url).toBe(`${BASE}/editais/edital-01-2026`);
    expect(fields.areas?.value).toContain("aprendizado de máquina");
    expect(fields.elegibilidade?.[0].evidence).toMatch(/título de doutor/);
    expect(fields.valores?.[0].evidence).toMatch(/R\$ 150\.000/);
    expect(fields.restricoes?.[0].evidence).toMatch(/vedada/);
    expect(fields.datas?.some((d) => d.iso === "2099-06-30" && d.label === "inscrições")).toBe(true);
    expect(fields.documentos?.[0].evidence).toMatch(/currículo Lattes/);
    expect(fields.criterios_avaliacao?.[0].evidence).toMatch(/mérito científico/);
    expect(fields.canal_inscricao?.[0].evidence).toMatch(/sistema SEI/);
    expect(fields.contrapartidas?.[0].evidence).toMatch(/10%/);
    expect(missing).toEqual([]);
    expect(inferStatus(fields, p.text, new Date("2026-11-20"))).toBe("aberta");
  });
  it("informação insuficiente: campos ausentes listados, situação desconhecida", () => {
    const p = parseHtml(`${BASE}/editais/edital-02-2026`, FIXTURE_PAGES[`${BASE}/editais/edital-02-2026`]);
    const { fields, missing } = extractFields(p);
    expect(missing).toEqual(expect.arrayContaining(["elegibilidade", "valores", "datas"]));
    expect(inferStatus(fields, p.text)).toBe("desconhecida");
  });
});

describe("situação da chamada", () => {
  const f = { datas: [{ label: "inscrições", value: "", evidence: "", source_url: "", iso: "2099-01-01" }] };
  it("suspensão/cancelamento exigem frase sobre o edital", () => {
    expect(inferStatus(f, "O Edital nº 01/2026 foi suspenso por decisão judicial.")).toBe("suspensa");
    expect(inferStatus(f, "Fica tornado público o cancelamento do edital.")).toBe("cancelada");
  });
  it("palavra solta não muda a situação; retificação/prorrogação são eventos", () => {
    expect(inferStatus(f, "Pagamentos suspensos no feriado. Inscrições cancelam a anterior.")).toBe("aberta");
    expect(inferStatus(f, "1ª Retificação do edital. Prorrogação do prazo de inscrições.")).toBe("aberta");
  });
});

describe("coleta", () => {
  it("só cadastra editais individuais, sem categorias, sem sair do domínio, sem baixar PDFs", async () => {
    const store = new MemoryStore();
    const { fetcher, calls } = fixtureFetcher();
    const run = await runCollection(store, "fapdf", { fetcher, sleep: noSleep, trigger: "manual", triggeredBy: "admin-1" });
    const titles = (await store.listOpportunities()).map((o) => o.edital_number).sort();
    expect(titles).toEqual(["01/2026", "02/2026", "03/2026"]);
    expect(run.status).toBe("succeeded");
    expect(run.stats.categorias).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.includes("outro-site.example"))).toBe(false);
    expect(calls.some((c) => c.endsWith(".pdf") || c.endsWith(".docx"))).toBe(false);
    // utm_ removido: a mesma página não é visitada duas vezes
    expect(calls.filter((c) => c.includes("edital-01-2026") && !c.endsWith(".pdf")).length).toBe(1);
  });

  it("reexecução não duplica e não cria versão nova sem mudança", async () => {
    const store = new MemoryStore();
    const { fetcher } = fixtureFetcher();
    await runCollection(store, "fapdf", { fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
    const second = await runCollection(store, "fapdf", { fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
    expect((await store.listOpportunities()).length).toBe(3);
    expect(second.stats.criadas).toBe(0);
    expect(second.stats.inalteradas).toBe(3);
    expect(store.versions.length).toBe(3);
  });

  it("mudança no edital gera nova versão e volta para revisão", async () => {
    const store = new MemoryStore();
    const pages = { ...FIXTURE_PAGES };
    await runCollection(store, "fapdf", { fetcher: fixtureFetcher(pages).fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
    const before = (await store.listOpportunities()).find((o) => o.edital_number === "01/2026")!;
    await store.reviewOpportunity(before.id, "revisado", "admin-1");
    pages[`${BASE}/editais/edital-01-2026`] = pages[`${BASE}/editais/edital-01-2026`].replace("R$ 150.000,00", "R$ 180.000,00");
    const run = await runCollection(store, "fapdf", { fetcher: fixtureFetcher(pages).fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
    const after = (await store.getOpportunity(before.id))!;
    expect(run.stats.atualizadas).toBe(1);
    expect(after.version).toBe(2);
    expect(after.review_status).toBe("pendente");
  });

  it("retificações: vincula a da própria página e a solta que cita o mesmo número; ignora a genérica", async () => {
    const store = new MemoryStore();
    const run = await runCollection(store, "fapdf", { fetcher: fixtureFetcher().fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
    const all = await store.listOpportunities();
    const e1 = all.find((o) => o.edital_number === "01/2026")!;
    const e2 = all.find((o) => o.edital_number === "02/2026")!;
    const e3 = all.find((o) => o.edital_number === "03/2026")!;
    expect(e1.documents.filter((d) => d.kind === "retificacao").map((d) => d.url)).toEqual([`${BASE}/arquivos/retificacao-01-edital-01-2026.pdf`]);
    expect(e1.documents.find((d) => d.url.endsWith(".docx"))?.kind).toBe("anexo");
    expect(e1.documents.find((d) => d.url.endsWith("edital-01-2026.pdf"))?.kind).toBe("edital");
    expect(e2.documents.filter((d) => d.kind === "retificacao").map((d) => d.url)).toEqual([`${BASE}/arquivos/retificacao-edital-02-2026.pdf`]);
    expect(e3.documents.some((d) => d.kind === "retificacao")).toBe(false);
    // "Retificação" genérica (sem número) e a palavra no menu/rodapé não viram vínculo
    expect(all.flatMap((o) => o.documents).some((d) => d.url.endsWith("retificacao-geral.pdf"))).toBe(false);
    expect(run.stats.retificacoes_sem_vinculo).toBe(1);
    // Evento separado da situação
    expect(e1.events.map((e) => e.kind)).toContain("retificacao");
    expect(e1.status).toBe("aberta");
    expect(e3.status).toBe("encerrada");
  });

  it("respeita limite de páginas e registra execução parcial", async () => {
    const store = new MemoryStore();
    await store.updateSource("fapdf", { max_pages: 2 });
    const run = await runCollection(store, "fapdf", { fetcher: fixtureFetcher().fetcher, sleep: noSleep, trigger: "manual", triggeredBy: null });
    expect(run.status).toBe("partial");
    expect(run.stats.paginas).toBe(2);
    expect(run.stats.limite_atingido).toBe(1);
  });

  it("respeita profundidade e intervalo entre requisições", async () => {
    const delays: number[] = [];
    const crawl = await crawlSource({ ...source(), max_depth: 0 }, { fetcher: fixtureFetcher().fetcher, sleep: async (ms) => void delays.push(ms) });
    expect(crawl.pagesFetched).toBe(1);
    const crawl2 = await crawlSource(source(), { fetcher: fixtureFetcher().fetcher, sleep: async (ms) => void delays.push(ms) });
    expect(delays.every((d) => d === source().request_delay_ms)).toBe(true);
    expect(crawl2.pagesFetched).toBeGreaterThan(1);
  });

  it("falhas ficam registradas e a execução não quebra", async () => {
    const store = new MemoryStore();
    const failing = async (url: string) => {
      if (url.endsWith("edital-02-2026")) throw new Error("timeout");
      return fixtureFetcher().fetcher(url);
    };
    const run = await runCollection(store, "fapdf", { fetcher: failing, sleep: noSleep, trigger: "manual", triggeredBy: null });
    expect(run.status).toBe("partial");
    expect(run.errors.some((e) => e.url.endsWith("edital-02-2026") && e.message === "timeout")).toBe(true);
    expect((await store.listOpportunities()).length).toBe(2);
  });

  it("impede execução concorrente da mesma fonte", async () => {
    const store = new MemoryStore();
    await store.startRun("fapdf", "manual", "admin-1");
    await expect(runCollection(store, "fapdf", { fetcher: fixtureFetcher().fetcher, sleep: noSleep, trigger: "hermes", triggeredBy: null })).rejects.toThrow(
      /em andamento/,
    );
  });

  it("persistCrawl é idempotente para a mesma coleta", async () => {
    const store = new MemoryStore();
    const crawl = await crawlSource(source(), { fetcher: fixtureFetcher().fetcher, sleep: noSleep });
    await persistCrawl(store, source(), crawl);
    const stats = await persistCrawl(store, source(), crawl);
    expect(stats.criadas).toBe(0);
    expect((await store.listOpportunities()).length).toBe(3);
  });
});
