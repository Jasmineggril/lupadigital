/**
 * @file lib/longdoc/jobs.ts
 * @description Análise de documentos longos em segundo plano, com estado persistido.
 *
 * Fluxo:
 *   criar  → valida limites, divide o documento (plan.ts) e grava a tarefa e as partes;
 *   avançar → reserva a tarefa (um processador por vez), lê partes até acabar o orçamento de tempo
 *             DESTA chamada, gravando cada parte concluída na hora; quando todas terminam, consolida;
 *   consultar / cancelar / reprocessar falhas.
 *
 * Quem chama "avançar": a página aberta (a cada resposta, chama de novo), o agendador
 * (/api/cron/analysis-jobs, com segredo) ou o laço do servidor próprio (LONGDOC_WORKER=1).
 * Se a função for encerrada no meio, perde-se no máximo a parte em andamento: a reserva vence e
 * outro processador retoma de onde parou. Nada depende da memória da função.
 */
import { createHash, randomUUID } from "node:crypto";
import { logger } from "../logger";
import { classifyAiError } from "../processingErrors";
import { recordAiTokens } from "../limits/shared";
import {
  analyzeLongDocChunk,
  estimateTokens,
  finalizeLongDocAnalysis,
  longDocChunkReservation,
  longDocTpmWaitMs,
  platformBudgetMs,
  type AgentId,
  type ChunkAnalysisFacts,
} from "../aiService";
import { withDocumentBase } from "../analysisEnrich";
import { chunkPromptText, documentLandmarks, normalizeLongText, planChunks, type LongDocChunk } from "./plan";
import { consolidateJobChunks, coverageOf, mergeWithSources } from "./consolidate";
import { ACTIVE_STATUSES, getJobStore, type AnalysisJob, type JobChunk } from "./store";

const num = (name: string, def: number) => {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : def;
};

/** Limites efetivos (todos configuráveis por variável de ambiente). */
export function longDocLimits() {
  const platform = platformBudgetMs();
  return {
    /** Texto extraído aceito numa tarefa (limite de ENTRADA; nunca enviado de uma vez à IA) */
    maxChars: num("LONGDOC_MAX_CHARS", 1_200_000),
    /** Acima disto o navegador usa a tarefa em segundo plano em vez da análise numa requisição */
    syncMaxChars: num("LONGDOC_SYNC_MAX_CHARS", 45_000),
    /** Tokens estimados por tarefa (custo) */
    maxJobTokens: num("LONGDOC_MAX_JOB_TOKENS", 700_000),
    maxActivePerUser: num("LONGDOC_MAX_ACTIVE_PER_USER", 1),
    maxJobsPerDay: num("LONGDOC_MAX_PER_DAY", 5),
    attempts: num("LONGDOC_ATTEMPTS", 3),
    concurrency: Math.min(4, num("LONGDOC_CONCURRENCY", 1)),
    chunkChars: num("LONGDOC_CHUNK_CHARS", 14_000),
    overlapChars: num("LONGDOC_OVERLAP_CHARS", 1_200),
    /** Tempo de UMA chamada de avanço (cabe no teto da função com folga para gravar) */
    stepBudgetMs: Math.min(num("LONGDOC_STEP_BUDGET_MS", 200_000), Math.max(20_000, platform - 40_000)),
    chunkTimeoutMs: num("LONGDOC_CHUNK_TIMEOUT_MS", 90_000),
    leaseSeconds: num("LONGDOC_LEASE_SECONDS", 300),
    retentionDays: num("LONGDOC_RETENTION_DAYS", 7),
  };
}

export class LongDocError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const AGENTS: AgentId[] = ["simples", "analista", "estrategica", "acompanhamento", "documentacao", "elegibilidade"];
const nowIso = () => new Date().toISOString();

export async function createLongDocJob(input: { userId: string; agentId: string; text: string; profile?: unknown }): Promise<AnalysisJob> {
  const lim = longDocLimits();
  if (!AGENTS.includes(input.agentId as AgentId)) throw new LongDocError(400, "AGENTE_INVALIDO", "Agente desconhecido.");
  const text = normalizeLongText(input.text ?? "");
  if (text.length < 20) throw new LongDocError(422, "TEXTO_CURTO", "Não há texto legível suficiente para analisar.");
  if (text.length > lim.maxChars) {
    throw new LongDocError(
      413,
      "DOCUMENTO_ACIMA_DO_LIMITE",
      `O documento tem ${text.length.toLocaleString("pt-BR")} caracteres; o limite atual é ${lim.maxChars.toLocaleString("pt-BR")}.`,
    );
  }
  const estimated = estimateTokens(text);
  if (estimated > lim.maxJobTokens) {
    throw new LongDocError(413, "ORCAMENTO_DA_TAREFA", `O documento exigiria cerca de ${estimated.toLocaleString("pt-BR")} tokens; o limite por análise é ${lim.maxJobTokens.toLocaleString("pt-BR")}.`);
  }
  const store = getJobStore();
  await store.purgeExpired(nowIso()).catch(() => 0);
  const recent = await store.listJobs(input.userId, 50);
  if (recent.filter((j) => ACTIVE_STATUSES.includes(j.status)).length >= lim.maxActivePerUser) {
    throw new LongDocError(409, "TAREFA_EM_ANDAMENTO", "Você já tem uma análise longa em andamento. Aguarde terminar ou cancele-a.");
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  if ((await store.countJobsSince(input.userId, since)) >= lim.maxJobsPerDay) {
    throw new LongDocError(429, "LIMITE_DIARIO", `Limite de ${lim.maxJobsPerDay} análises longas por dia atingido.`);
  }

  const plan = planChunks(text, { targetChars: lim.chunkChars, overlapChars: lim.overlapChars });
  const pages = new Set(documentLandmarks(text).pages.map((p) => p.page)).size || null;
  const id = randomUUID();
  const t = nowIso();
  const job: AnalysisJob = {
    id,
    user_id: input.userId,
    agent_id: input.agentId,
    status: "pendente",
    document_hash: createHash("sha256").update(text).digest("hex"),
    document_text: text,
    chars: text.length,
    pages,
    total_chunks: plan.length,
    done_chunks: 0,
    failed_chunks: 0,
    profile: input.profile ?? null,
    result: null,
    error: null,
    tokens_used: 0,
    ai_calls: 0,
    estimated_tokens: estimated,
    lease_owner: null,
    lease_until: null,
    next_attempt_at: null,
    created_at: t,
    updated_at: t,
    finished_at: null,
    expires_at: new Date(Date.now() + lim.retentionDays * 86_400_000).toISOString(),
  };
  const chunks: JobChunk[] = plan.map((c) => ({
    job_id: id,
    idx: c.index,
    start_offset: c.start,
    end_offset: c.end,
    ctx_start: c.ctxStart,
    page_start: c.pageStart,
    page_end: c.pageEnd,
    section: c.section,
    content_hash: c.hash,
    status: "pendente",
    attempts: 0,
    facts: null,
    error: null,
    tokens: null,
    next_attempt_at: null,
    updated_at: t,
  }));
  await store.createJob(job, chunks);
  logger.info({ module: "longdoc", step: "job_created", jobId: id, chars: text.length, chunks: plan.length, estimatedTokens: estimated }, "Análise longa criada");
  return job;
}

/** Visão pública da tarefa (sem o texto do documento). */
export function jobView(job: AnalysisJob, chunks: JobChunk[], withResult = false) {
  const coverage = coverageOf(chunks, job.chars);
  return {
    id: job.id,
    agentId: job.agent_id,
    status: job.status,
    documento: { caracteres: job.chars, paginas: job.pages, hash: job.document_hash, texto_retido: job.document_text !== null },
    partes: {
      total: job.total_chunks,
      concluidas: chunks.filter((c) => c.status === "concluida").length,
      com_falha: chunks.filter((c) => c.status === "falhou").length,
      pendentes: chunks.filter((c) => c.status === "pendente" || c.status === "processando").length,
      lista: chunks.map((c) => ({
        n: c.idx + 1,
        situacao: c.status,
        paginas: c.page_start == null ? null : c.page_end != null && c.page_end !== c.page_start ? `${c.page_start}–${c.page_end}` : String(c.page_start),
        secao: c.section,
        inicio: c.start_offset,
        fim: c.end_offset,
        tentativas: c.attempts,
        erro: c.error,
      })),
    },
    cobertura: coverage,
    consumo: { tokens: job.tokens_used, chamadas_ia: job.ai_calls, tokens_estimados: job.estimated_tokens },
    proxima_tentativa: job.next_attempt_at,
    erro: job.error,
    criada_em: job.created_at,
    atualizada_em: job.updated_at,
    concluida_em: job.finished_at,
    expira_em: job.expires_at,
    ...(withResult && job.result ? { resultado: job.result } : {}),
  };
}

export async function getJobForUser(id: string, userId: string) {
  const store = getJobStore();
  const job = await store.getJob(id);
  // Tarefa de outra pessoa = inexistente (não revela que existe)
  if (!job || job.user_id !== userId) throw new LongDocError(404, "NAO_ENCONTRADA", "Análise não encontrada.");
  return { job, chunks: await store.listChunks(id) };
}

type Analyzer = typeof analyzeLongDocChunk;
let analyzer: Analyzer = analyzeLongDocChunk;
/** Testes: troca a chamada à IA por uma simulada (nenhum provedor real é chamado). */
export function setLongDocAnalyzerForTests(a: Analyzer | null) {
  analyzer = a ?? analyzeLongDocChunk;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Please try again in 7m12.5s" / "try again in 950ms" / Retry-After em segundos. */
export function retryAfterMsFrom(message: string): number | null {
  const m = message.match(/try again in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?\s*(?:([\d.]+)ms)?/i);
  if (m && (m[1] || m[2] || m[3] || m[4])) return Math.ceil((Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000 + Number(m[4] ?? 0));
  const ra = message.match(/retry[- ]after[:= ]+(\d+)/i);
  return ra ? Number(ra[1]) * 1000 : null;
}

function classifyChunkError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const c = classifyAiError(message);
  const status = (err as { status?: number })?.status ?? c.status;
  const quota = status === 429 || c.reason === "rate_limit" || /rate limit|quota|tokens per (minute|day)|\bTPM\b|\bTPD\b|\bRPD\b/i.test(message);
  const daily = /per day|\bTPD\b|\bRPD\b|daily/i.test(message);
  const fatal = status === 401 || status === 403 || c.reason === "ai_not_configured";
  return {
    quota,
    daily,
    fatal,
    retryAfterMs: retryAfterMsFrom(message) ?? (quota ? (daily ? 3_600_000 : 60_000) : null),
    // Mensagem curta e sem detalhes técnicos do provedor
    userMessage: quota ? (daily ? "Cota diária do provedor de IA esgotada" : "Limite por minuto do provedor de IA") : fatal ? "Provedor de IA recusou a credencial" : c.userMessage?.slice(0, 160) || "Falha ao ler esta parte",
  };
}

export async function advanceLongDocJob(
  id: string,
  actor: { userId: string | null; system?: boolean },
  opts: { budgetMs?: number } = {},
): Promise<ReturnType<typeof jobView>> {
  const lim = longDocLimits();
  const store = getJobStore();
  const started = Date.now();
  const deadline = started + (opts.budgetMs ?? lim.stepBudgetMs);
  let job = await store.getJob(id);
  if (!job || (!actor.system && job.user_id !== actor.userId)) throw new LongDocError(404, "NAO_ENCONTRADA", "Análise não encontrada.");
  if (!ACTIVE_STATUSES.includes(job.status)) return jobView(job, await store.listChunks(id), true);
  if (job.next_attempt_at && job.next_attempt_at > nowIso()) return jobView(job, await store.listChunks(id));

  const owner = randomUUID();
  const claimed = await store.claim(id, owner, lim.leaseSeconds);
  if (!claimed) return jobView(job, await store.listChunks(id)); // outro processador está trabalhando nela
  job = claimed;
  const text = job.document_text;
  if (text === null) {
    await store.updateJob(id, { status: "falhou", error: "O texto do documento não está mais disponível (prazo de retenção).", lease_owner: null, lease_until: null });
    return jobView((await store.getJob(id))!, await store.listChunks(id));
  }

  let chunks = await store.listChunks(id);
  const plan: LongDocChunk[] = chunks.map((c) => ({
    index: c.idx,
    start: c.start_offset,
    end: c.end_offset,
    ctxStart: c.ctx_start,
    pageStart: c.page_start,
    pageEnd: c.page_end,
    section: c.section,
    hash: c.content_hash,
    chars: c.end_offset - c.start_offset,
  }));
  let waitingQuota: string | null = null;
  let quotaUntil: string | null = null;
  let fatalError: string | null = null;
  let tokens = 0;
  let calls = 0;

  for (;;) {
    // Cancelada por outra requisição enquanto processávamos?
    const fresh = await store.getJob(id);
    if (!fresh || fresh.status === "cancelada") return jobView(fresh ?? job, await store.listChunks(id));

    const t = nowIso();
    const ready = chunks
      .filter((c) => (c.status === "pendente" || c.status === "processando") && (!c.next_attempt_at || c.next_attempt_at <= t))
      .slice(0, lim.concurrency);
    if (!ready.length) break;

    // O lote cabe no tempo desta chamada (incluindo a espera do limite por minuto)?
    const prompts = ready.map((c) => chunkPromptText(text, plan[c.idx], plan.length));
    const tpmWait = Math.max(...prompts.map(longDocTpmWaitMs));
    const remaining = deadline - Date.now();
    if (tpmWait + 20_000 > remaining) {
      if (tpmWait > 0) await store.updateJob(id, { next_attempt_at: new Date(Date.now() + Math.min(tpmWait, remaining)).toISOString() });
      break;
    }
    if (tpmWait > 0) await sleep(tpmWait);

    await Promise.all(
      ready.map(async (c, i) => {
        await store.updateChunk(id, c.idx, { status: "processando", attempts: c.attempts + 1 });
        try {
          const timeoutMs = Math.max(10_000, Math.min(lim.chunkTimeoutMs, deadline - Date.now() - 5_000));
          const r = await analyzer(job!.agent_id as AgentId, prompts[i], job!.profile, { userId: job!.user_id, chunkId: `parte-${c.idx + 1}`, timeoutMs });
          tokens += r.tokens;
          calls += 1;
          await recordAiTokens(r.tokens);
          await store.updateChunk(id, c.idx, { status: "concluida", facts: r.facts, tokens: r.tokens, error: null, next_attempt_at: null });
        } catch (err) {
          calls += 1;
          const e = classifyChunkError(err);
          logger.warn({ module: "longdoc", step: "chunk_failed", jobId: id, chunk: c.idx + 1, quota: e.quota, fatal: e.fatal }, "Parte não lida");
          if (e.quota) {
            // Cota do provedor: a parte volta para a fila SEM gastar tentativa
            const next = new Date(Date.now() + (e.retryAfterMs ?? 60_000)).toISOString();
            waitingQuota = e.userMessage;
            if (!quotaUntil || next > quotaUntil) quotaUntil = next;
            await store.updateChunk(id, c.idx, { status: "pendente", attempts: c.attempts, error: e.userMessage, next_attempt_at: next });
          } else if (e.fatal) {
            fatalError = e.userMessage;
            await store.updateChunk(id, c.idx, { status: "pendente", attempts: c.attempts, error: e.userMessage });
          } else if (c.attempts + 1 >= lim.attempts) {
            await store.updateChunk(id, c.idx, { status: "falhou", error: e.userMessage, next_attempt_at: null });
          } else {
            const backoff = 5_000 * 2 ** c.attempts;
            await store.updateChunk(id, c.idx, { status: "pendente", error: e.userMessage, next_attempt_at: new Date(Date.now() + backoff).toISOString() });
          }
        }
      }),
    );
    chunks = await store.listChunks(id);
    await store.updateJob(id, {
      done_chunks: chunks.filter((x) => x.status === "concluida").length,
      failed_chunks: chunks.filter((x) => x.status === "falhou").length,
      tokens_used: (job.tokens_used ?? 0) + tokens,
      ai_calls: (job.ai_calls ?? 0) + calls,
    });
    if (waitingQuota || fatalError) break;
  }

  chunks = await store.listChunks(id);
  const remainingChunks = chunks.filter((c) => c.status === "pendente" || c.status === "processando");
  const counters = {
    done_chunks: chunks.filter((x) => x.status === "concluida").length,
    failed_chunks: chunks.filter((x) => x.status === "falhou").length,
    tokens_used: (job.tokens_used ?? 0) + tokens,
    ai_calls: (job.ai_calls ?? 0) + calls,
  };

  if (fatalError) {
    await store.updateJob(id, { ...counters, status: "falhou", error: fatalError, lease_owner: null, lease_until: null });
  } else if (remainingChunks.length === 0) {
    // Todas as partes tiveram desfecho: consolida (completa ou parcial, nunca parcial como completa)
    const result = await consolidateJob({ ...job, ...counters }, chunks, text);
    const complete = counters.failed_chunks === 0;
    await store.updateJob(id, {
      ...counters,
      status: complete ? "concluida" : "parcial",
      result,
      error: complete ? null : `${counters.failed_chunks} de ${chunks.length} partes não foram analisadas.`,
      finished_at: nowIso(),
      next_attempt_at: null,
      lease_owner: null,
      lease_until: null,
      // Retenção: completa → o texto é apagado na hora; parcial → fica até expirar, para reprocessar
      ...(complete ? { document_text: null } : {}),
    });
  } else {
    // Cota do provedor vale para a tarefa inteira (todas as partes usam o mesmo provedor)
    const nextAt = remainingChunks.map((c) => c.next_attempt_at).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
    const readyNow = remainingChunks.some((c) => !c.next_attempt_at || c.next_attempt_at <= nowIso());
    const current = (await store.getJob(id))?.next_attempt_at ?? null;
    await store.updateJob(id, {
      ...counters,
      status: waitingQuota ? "aguardando_cota" : "processando",
      error: waitingQuota ? `${waitingQuota}. A análise continua sozinha quando a cota liberar; nada do que já foi lido se perde.` : null,
      next_attempt_at: waitingQuota ? quotaUntil : readyNow ? (current && current > nowIso() ? current : null) : nextAt,
      lease_owner: null,
      lease_until: null,
    });
  }
  const final = (await store.getJob(id))!;
  logger.info({ module: "longdoc", step: "job_advanced", jobId: id, status: final.status, done: final.done_chunks, total: final.total_chunks, ms: Date.now() - started }, "Análise longa avançou");
  return jobView(final, await store.listChunks(id), true);
}

async function consolidateJob(job: AnalysisJob, chunks: JobChunk[], text: string): Promise<Record<string, unknown>> {
  const { chunkResults, conflicts, modifiers, coverage } = consolidateJobChunks(chunks, text.length);
  const failed = coverage.nao_analisados;
  const processing: Record<string, unknown> = {
    mode: "durable",
    totalChunks: chunks.length,
    processedChunks: coverage.partes_analisadas,
    failedChunks: coverage.partes_com_falha,
    complete: coverage.completa,
    jobId: job.id,
    cobertura: coverage,
    ...(coverage.completa
      ? {}
      : {
          reason: "partes_com_falha",
          retryable: true,
          userMessage: `${failed.length} de ${chunks.length} partes não foram analisadas pela IA (${failed
            .slice(0, 6)
            .map((f) => (f.paginas ? `p. ${f.paginas}` : `parte ${f.parte}`))
            .join(", ")}${failed.length > 6 ? "…" : ""}). Use "Reprocessar partes com falha".`,
        }),
  };
  const analysis = finalizeLongDocAnalysis(job.agent_id as AgentId, chunkResults, text, job.profile, processing);
  const enriched = (await withDocumentBase(analysis, text, job.user_id)) as Record<string, unknown>;
  const allFacts = chunkResults.map((r) => r.facts as ChunkAnalysisFacts);
  enriched.documento_longo = {
    versao: 1,
    jobId: job.id,
    documento_hash: job.document_hash,
    cobertura: coverage,
    conflitos: conflicts,
    alteracoes: modifiers,
    // Cada exigência/documento com TODAS as partes e páginas em que aparece
    requisitos: mergeWithSources(allFacts.flatMap((f) => f.requirements as Array<Record<string, unknown>>), "requirement"),
    documentos: mergeWithSources(allFacts.flatMap((f) => f.documents as Array<Record<string, unknown>>), "document"),
    partes: chunks.map((c) => ({ n: c.idx + 1, inicio: c.start_offset, fim: c.end_offset, paginas: c.page_start, secao: c.section, hash: c.content_hash, situacao: c.status })),
  };
  // Análise parcial: "não localizado" vale só para o que foi lido
  if (!coverage.completa) {
    const fatos = enriched.fatos as { campos?: Array<{ estado: string; observacao: string }> } | undefined;
    for (const c of fatos?.campos ?? []) {
      if (c.estado === "nao_localizado" || c.estado === "incerto") c.observacao += ` Atenção: ${failed.length} parte(s) do documento não foram lidas pela IA; o item pode estar nelas.`;
    }
  }
  return enriched;
}

export async function cancelLongDocJob(id: string, userId: string) {
  const { job } = await getJobForUser(id, userId);
  if (!ACTIVE_STATUSES.includes(job.status) && job.status !== "parcial") throw new LongDocError(409, "NAO_CANCELAVEL", "Esta análise já terminou.");
  const store = getJobStore();
  // Cancelar apaga o documento na hora (retenção mínima)
  await store.updateJob(id, { status: "cancelada", document_text: null, finished_at: nowIso(), lease_owner: null, lease_until: null, error: "Cancelada pela pessoa." });
  return jobView((await store.getJob(id))!, await store.listChunks(id));
}

/** Volta SÓ as partes com falha para a fila; as concluídas não são lidas de novo. */
export async function retryFailedChunks(id: string, userId: string) {
  const { job, chunks } = await getJobForUser(id, userId);
  if (job.document_text === null) throw new LongDocError(410, "TEXTO_REMOVIDO", "O documento já foi apagado (prazo de retenção). Envie de novo.");
  const failed = chunks.filter((c) => c.status === "falhou");
  if (!failed.length) throw new LongDocError(409, "SEM_FALHAS", "Não há partes com falha para reprocessar.");
  const store = getJobStore();
  for (const c of failed) await store.updateChunk(id, c.idx, { status: "pendente", attempts: 0, error: null, next_attempt_at: null });
  await store.updateJob(id, { status: "processando", failed_chunks: 0, result: null, finished_at: null, error: null, next_attempt_at: null });
  return jobView((await store.getJob(id))!, await store.listChunks(id));
}

/** Agendador / servidor próprio: avança as tarefas prontas, uma por vez, dentro do orçamento. */
export async function tickLongDocJobs(budgetMs: number) {
  const store = getJobStore();
  const started = Date.now();
  await store.purgeExpired(nowIso()).catch(() => 0);
  const out: Array<{ id: string; status: string }> = [];
  for (const j of await store.listRunnable(nowIso(), 5)) {
    const left = budgetMs - (Date.now() - started);
    if (left < 30_000) break;
    try {
      const v = await advanceLongDocJob(j.id, { userId: null, system: true }, { budgetMs: left - 10_000 });
      out.push({ id: v.id, status: v.status });
    } catch (err) {
      logger.warn({ module: "longdoc", jobId: j.id, error: err instanceof Error ? err.message : String(err) }, "tick: falha ao avançar");
    }
  }
  return out;
}

export { longDocChunkReservation };
