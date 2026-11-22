/**
 * Leitura COMPLETA de documentos longos: divisão sem perda, tarefa durável, falha e retomada,
 * cota do provedor, cancelamento, reserva concorrente e isolamento entre pessoas.
 * A IA é simulada (fixtures.ts): nenhum provedor externo é chamado.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildLongEdital, fakeFacts, mainPart, MARKERS } from "./fixtures";
import { assertCoverage, normalizeLongText, planChunks } from "../plan";
import { MemoryJobStore, setJobStoreForTests, type JobStore } from "../store";
import {
  advanceLongDocJob,
  cancelLongDocJob,
  createLongDocJob,
  getJobForUser,
  retryAfterMsFrom,
  retryFailedChunks,
  setLongDocAnalyzerForTests,
} from "../jobs";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SIZES = { acimaDoAntigo: 562_045, umMilhao: 1_000_000 };

let store: JobStore;
let calls: Map<number, number>;
let failPlan: (part: number, attempt: number) => Error | null;

beforeAll(() => {
  process.env.GROQ_API_KEY = "test-key-longdoc"; // "test-": sem espera de cota por minuto simulada
  process.env.LONGDOC_MAX_PER_DAY = "100";
});

beforeEach(() => {
  store = new MemoryJobStore();
  setJobStoreForTests(store);
  calls = new Map();
  failPlan = () => null;
  setLongDocAnalyzerForTests(async (_agent, promptText, _profile, opts) => {
    const part = Number(opts.chunkId.replace("parte-", ""));
    const n = (calls.get(part) ?? 0) + 1;
    calls.set(part, n);
    const e = failPlan(part, n);
    if (e) throw e;
    return { facts: fakeFacts(promptText), tokens: Math.ceil(mainPart(promptText).length / 4) };
  });
});
afterEach(() => {
  setLongDocAnalyzerForTests(null);
  setJobStoreForTests(null);
});

async function runToEnd(id: string, user = USER, maxSteps = 500) {
  let v = await advanceLongDocJob(id, { userId: user }, { budgetMs: 600_000 });
  for (let i = 0; i < maxSteps && ["pendente", "processando"].includes(v.status); i += 1) v = await advanceLongDocJob(id, { userId: user }, { budgetMs: 600_000 });
  return v;
}

describe("divisão em partes sem perda", () => {
  for (const [nome, size] of Object.entries(SIZES)) {
    it(`${nome}: ${size.toLocaleString("pt-BR")} caracteres cobertos 100%, com páginas e marcadores em uma parte cada`, () => {
      const text = normalizeLongText(buildLongEdital(size));
      expect(text.length).toBeGreaterThanOrEqual(size);
      const plan = planChunks(text);
      assertCoverage(text, plan);
      expect(plan.map((c) => text.slice(c.start, c.end)).join("")).toBe(text); // nada perdido, nada duplicado
      for (const c of plan) {
        expect(c.chars).toBeLessThanOrEqual(14_000 * 1.15);
        expect(c.hash).toBe(createHash("sha256").update(text.slice(c.start, c.end)).digest("hex"));
      }
      for (const m of [...MARKERS.inicio, ...MARKERS.meio, MARKERS.excecao, ...MARKERS.fim, MARKERS.final]) {
        const holders = plan.filter((c) => text.slice(c.start, c.end).includes(m));
        expect(holders.length, m).toBe(1);
      }
      const last = plan[plan.length - 1];
      expect(last.pageStart).toBeGreaterThan(size / 4_000);
      expect(plan.some((c) => c.section && /DISPOSI|ANEXO|GESTÃO|EXCE/.test(c.section))).toBe(true);
    });
  }

  it("linha gigante sem quebras (tabela colada) também é coberta", () => {
    const text = "x".repeat(50_000) + " fim";
    const plan = planChunks(text);
    assertCoverage(text, plan);
    expect(plan.length).toBeGreaterThan(3);
  });

  it("linhas curtas e repetidas (células de tabela) não são removidas", () => {
    const raw = "| 1 |\n| 1 |\nX\nX\nfim do texto de teste";
    expect(normalizeLongText(raw)).toBe(raw);
  });
});

describe("tarefa durável — leitura completa", () => {
  it("≈1 milhão de caracteres: todas as partes lidas uma vez, fatos do início/meio/fim, exceção, retificação e prazo prorrogado", async () => {
    const text = buildLongEdital(SIZES.umMilhao);
    const t0 = Date.now();
    const job = await createLongDocJob({ userId: USER, agentId: "documentacao", text });
    const v = await runToEnd(job.id);
    const ms = Date.now() - t0;
    expect(v.status).toBe("concluida");
    expect(v.partes.concluidas).toBe(v.partes.total);
    expect(v.cobertura.completa).toBe(true);
    expect(v.cobertura.caracteres_analisados).toBe(v.cobertura.caracteres_totais);
    expect([...calls.values()].every((n) => n === 1)).toBe(true); // cada parte uma única vez
    expect(calls.size).toBe(v.partes.total);

    const r = v.resultado as Record<string, any>;
    expect(r.processing).toMatchObject({ mode: "durable", complete: true, processedChunks: v.partes.total, failedChunks: 0 });
    const docs = JSON.stringify(r.checklist) + JSON.stringify(r.documentosExigidos);
    for (const m of ["TAI-INICIO", "PGD-MEIO", "DCE-FIM"]) expect(docs, m).toContain(m);
    const reqs = JSON.stringify(r.documento_longo.requisitos);
    expect(reqs).toContain("REQ-INICIO");
    expect(reqs).toContain("REQ-FIM");
    // A exceção do item 3.1 (lida na parte ~70%) aparece como alteração, com a parte
    const exc = r.documento_longo.alteracoes.find((a: any) => a.trecho.includes("EXC-TAI"));
    expect(exc).toBeTruthy();
    expect(["excecao", "dispensa"]).toContain(exc.tipo);
    // Datas diferentes de inscrição em partes diferentes = conflito explícito, não escolha silenciosa
    const conf = r.documento_longo.conflitos.find((c: any) => /inscri/.test(c.chave));
    expect(conf.versoes.map((x: any) => x.valor).sort()).toEqual(["30/04/2027", "31/03/2027"]);
    expect(r.documento_longo.alteracoes.some((a: any) => a.tipo === "prorrogacao" || a.tipo === "retificacao")).toBe(true);
    // Prazo oficial (determinístico, no texto INTEIRO): a prorrogação do último anexo vale
    expect(r.fatos.prazo_inscricao).toMatchObject({ iso: "2027-04-30", prorrogado: true });
    expect(r.cronograma).toBeTruthy();
    // Sem o texto original dentro do resultado; documento apagado ao concluir (retenção)
    expect(JSON.stringify(r)).not.toContain(MARKERS.final + "\n");
    expect(r.originalText).toBeUndefined();
    expect((await store.getJob(job.id))!.document_text).toBeNull();
    console.info(`[medição] ${text.length.toLocaleString("pt-BR")} caracteres · ${v.partes.total} partes · ${v.consumo.tokens.toLocaleString("pt-BR")} tokens (simulados) · ${ms} ms de processamento local (IA simulada) · resultado ${Math.round(JSON.stringify(r).length / 1024)} KB`);
  }, 120_000);

  it("acima do antigo limite (562.045): concluída e com o fim do documento", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(SIZES.acimaDoAntigo) });
    const v = await runToEnd(job.id);
    expect(v.status).toBe("concluida");
    expect(JSON.stringify(v.resultado)).toContain("DCE-FIM");
  }, 120_000);
});

describe("falha, retomada e cota", () => {
  it("falha numa parte → resultado PARCIAL (nunca completo), páginas não lidas informadas; reprocessa só a parte que falhou", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "documentacao", text: buildLongEdital(300_000) });
    const bad = 12;
    failPlan = (part, attempt) => (part === bad && attempt <= 3 ? Object.assign(new Error("500 Internal Server Error"), { status: 500 }) : null);
    let v = await runToEnd(job.id);
    // as novas tentativas da parte ruim têm espera crescente: força o tempo a passar
    for (let i = 0; i < 5 && v.status === "processando"; i += 1) {
      const chunks = await store.listChunks(job.id);
      for (const c of chunks) if (c.next_attempt_at) await store.updateChunk(job.id, c.idx, { next_attempt_at: new Date(0).toISOString() });
      await store.updateJob(job.id, { next_attempt_at: null });
      v = await runToEnd(job.id);
    }
    expect(v.status).toBe("parcial");
    const r = v.resultado as Record<string, any>;
    expect(r.processing.complete).toBe(false);
    expect(r.processing.userMessage).toMatch(/1 de \d+ partes não foram analisadas/);
    expect(v.cobertura.nao_analisados).toHaveLength(1);
    expect(v.cobertura.nao_analisados[0]).toMatchObject({ parte: bad });
    expect(v.cobertura.nao_analisados[0].paginas).toBeTruthy();
    expect(calls.get(bad)).toBe(3);
    // "não localizado" passa a dizer que pode estar nas partes não lidas
    expect(JSON.stringify(r.fatos.campos)).toMatch(/não foram lidas pela IA/);
    expect((await store.getJob(job.id))!.document_text).not.toBeNull(); // guardado para reprocessar

    const before = new Map(calls);
    await retryFailedChunks(job.id, USER);
    v = await runToEnd(job.id);
    expect(v.status).toBe("concluida");
    expect((v.resultado as any).processing.complete).toBe(true);
    for (const [part, n] of calls) expect(n, `parte ${part}`).toBe(part === bad ? 4 : before.get(part));
  }, 120_000);

  it("cota diária do provedor: aguarda o tempo indicado sem gastar tentativa e continua depois", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(120_000) });
    failPlan = (part, attempt) =>
      part === 3 && attempt === 1 ? Object.assign(new Error("429 Rate limit reached for model on tokens per day (TPD): Limit 200000, Used 199000. Please try again in 7m12.5s."), { status: 429 }) : null;
    let v = await advanceLongDocJob(job.id, { userId: USER }, { budgetMs: 600_000 });
    expect(v.status).toBe("aguardando_cota");
    expect(v.erro).toMatch(/Cota diária/);
    const wait = new Date(v.proxima_tentativa!).getTime() - Date.now();
    expect(wait).toBeGreaterThan(7 * 60_000);
    expect(v.partes.lista[2]).toMatchObject({ situacao: "pendente", tentativas: 0 });
    // antes da hora: nada acontece
    v = await advanceLongDocJob(job.id, { userId: USER });
    expect(calls.get(3)).toBe(1);
    // a cota liberou
    await store.updateChunk(job.id, 2, { next_attempt_at: new Date(0).toISOString() });
    await store.updateJob(job.id, { next_attempt_at: null });
    v = await runToEnd(job.id);
    expect(v.status).toBe("concluida");
    expect(calls.get(3)).toBe(2);
  }, 60_000);

  it("função encerrada no meio (reserva vencida, parte presa em 'processando'): outro processador retoma", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(100_000) });
    await store.claim(job.id, "funcao-que-morreu", 300);
    await store.updateChunk(job.id, 0, { status: "processando", attempts: 1 });
    // reserva ainda válida: ninguém mais processa
    let v = await advanceLongDocJob(job.id, { userId: USER });
    expect(calls.size).toBe(0);
    // reserva venceu
    await store.updateJob(job.id, { lease_until: new Date(Date.now() - 1000).toISOString() });
    v = await runToEnd(job.id);
    expect(v.status).toBe("concluida");
    expect(calls.get(1)).toBe(1);
  }, 60_000);

  it("dois processadores ao mesmo tempo (duas abas): nenhuma parte é lida duas vezes", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(100_000) });
    await Promise.all([runToEnd(job.id), runToEnd(job.id), runToEnd(job.id)]);
    expect([...calls.values()].every((n) => n === 1)).toBe(true);
    expect((await getJobForUser(job.id, USER)).job.status).toBe("concluida");
  }, 60_000);

  it("cancelar apaga o documento e interrompe", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(100_000) });
    await advanceLongDocJob(job.id, { userId: USER }, { budgetMs: 1 });
    const v = await cancelLongDocJob(job.id, USER);
    expect(v.status).toBe("cancelada");
    expect((await store.getJob(job.id))!.document_text).toBeNull();
    const after = await advanceLongDocJob(job.id, { userId: USER });
    expect(after.status).toBe("cancelada");
  });
});

describe("limites e autorização", () => {
  it("outra pessoa não vê nem avança a tarefa (404); limite de tamanho e de tarefas simultâneas", async () => {
    const job = await createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(60_000) });
    await expect(getJobForUser(job.id, OTHER)).rejects.toMatchObject({ status: 404 });
    await expect(advanceLongDocJob(job.id, { userId: OTHER })).rejects.toMatchObject({ status: 404 });
    await expect(createLongDocJob({ userId: USER, agentId: "simples", text: buildLongEdital(60_000) })).rejects.toMatchObject({ status: 409 });
    await expect(createLongDocJob({ userId: OTHER, agentId: "simples", text: "a ".repeat(700_000) })).rejects.toMatchObject({ status: 413 });
    await expect(createLongDocJob({ userId: OTHER, agentId: "inexistente", text: "texto suficiente para análise" })).rejects.toMatchObject({ status: 400 });
  });

  it("lê o tempo de espera das mensagens do provedor", () => {
    expect(retryAfterMsFrom("Please try again in 7m12.5s.")).toBe(432_500);
    expect(retryAfterMsFrom("Please try again in 950ms")).toBe(950);
    expect(retryAfterMsFrom("try again in 1h2m3s")).toBe(3_723_000);
    expect(retryAfterMsFrom("nada")).toBeNull();
  });
});
