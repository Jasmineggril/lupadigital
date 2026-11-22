/**
 * @file routes/analysisJobs.ts
 * @description Análise de documentos longos em segundo plano (lib/longdoc).
 *
 *   GET  /edital/limits                 limites efetivos (o navegador decide o fluxo por eles)
 *   POST /edital/jobs                   cria a tarefa (login obrigatório)
 *   GET  /edital/jobs                   tarefas recentes da pessoa (retomar depois de atualizar a página)
 *   GET  /edital/jobs/:id               andamento real (partes concluídas, falhas, cobertura) e resultado
 *   POST /edital/jobs/:id/advance       processa partes dentro do tempo desta requisição
 *   POST /edital/jobs/:id/cancel        cancela e apaga o documento
 *   POST /edital/jobs/:id/retry-failed  volta SÓ as partes com falha para a fila
 *   POST /cron/analysis-jobs            agendador externo (Authorization: Bearer CRON_SECRET)
 *
 * Autorização: só a dona ou o dono vê e mexe na tarefa (outra pessoa recebe 404). Custo: as
 * chamadas que usam IA passam pelo costGuard (cotas compartilhadas) — ver app.ts.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { getReqUserId, requireAuth } from "../lib/supabase";
import { cronConfigured, verifyCronSecret } from "../lib/lupa/integrations/cron";
import { platformBudgetMs } from "../lib/aiService";
import {
  LongDocError,
  advanceLongDocJob,
  cancelLongDocJob,
  createLongDocJob,
  getJobForUser,
  jobView,
  longDocLimits,
  retryFailedChunks,
  tickLongDocJobs,
} from "../lib/longdoc/jobs";
import { getJobStore } from "../lib/longdoc/store";
import { MAX_ANALYZE_CHARS } from "./edital";

const router: IRouter = Router();

const CreateSchema = z.object({
  agentId: z.string().min(1).max(40),
  text: z.string().min(1),
  profile: z.unknown().optional(),
});

function fail(req: Request, res: Response, err: unknown) {
  if (err instanceof LongDocError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  req.log?.error({ module: "longdoc", error: err instanceof Error ? err.message : String(err) }, "longdoc:error");
  res.status(503).json({ error: "Não foi possível acessar a análise agora. O andamento salvo não se perde; tente de novo.", code: "INDISPONIVEL" });
}

router.get("/edital/limits", (_req, res) => {
  const l = longDocLimits();
  res.json({
    analise_direta_max_caracteres: l.syncMaxChars,
    analise_direta_limite_rigido: MAX_ANALYZE_CHARS,
    documento_max_caracteres: l.maxChars,
    tarefa_max_tokens: l.maxJobTokens,
    parte_caracteres: l.chunkChars,
    sobreposicao_caracteres: l.overlapChars,
    tarefas_simultaneas_por_pessoa: l.maxActivePerUser,
    tarefas_por_dia: l.maxJobsPerDay,
    tempo_por_etapa_ms: l.stepBudgetMs,
    teto_da_funcao_ms: platformBudgetMs(),
    retencao_dias: l.retentionDays,
    requer_login: true,
    // Avança com a página fechada só se houver agendador externo ou servidor próprio com laço ligado
    processa_sem_pagina_aberta: process.env.LONGDOC_WORKER === "1" || process.env.LONGDOC_SCHEDULER === "1",
  });
});

router.post("/edital/jobs", requireAuth(), async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos.", code: "DADOS_INVALIDOS" });
    return;
  }
  try {
    const job = await createLongDocJob({ userId: getReqUserId(req) as string, ...parsed.data });
    const { chunks } = await getJobForUser(job.id, job.user_id);
    res.status(201).json(jobView(job, chunks));
  } catch (err) {
    fail(req, res, err);
  }
});

router.get("/edital/jobs", requireAuth(), async (req, res) => {
  try {
    const jobs = await getJobStore().listJobs(getReqUserId(req) as string, 10);
    res.json({
      jobs: jobs.map((j) => ({ id: j.id, agentId: j.agent_id, status: j.status, caracteres: j.chars, partes: j.total_chunks, concluidas: j.done_chunks, com_falha: j.failed_chunks, criada_em: j.created_at, atualizada_em: j.updated_at })),
    });
  } catch (err) {
    fail(req, res, err);
  }
});

router.get("/edital/jobs/:id", requireAuth(), async (req, res) => {
  try {
    const { job, chunks } = await getJobForUser(String(req.params.id), getReqUserId(req) as string);
    res.json(jobView(job, chunks, true));
  } catch (err) {
    fail(req, res, err);
  }
});

router.post("/edital/jobs/:id/advance", requireAuth(), async (req, res) => {
  try {
    res.json(await advanceLongDocJob(String(req.params.id), { userId: getReqUserId(req) }));
  } catch (err) {
    fail(req, res, err);
  }
});

router.post("/edital/jobs/:id/cancel", requireAuth(), async (req, res) => {
  try {
    res.json(await cancelLongDocJob(String(req.params.id), getReqUserId(req) as string));
  } catch (err) {
    fail(req, res, err);
  }
});

router.post("/edital/jobs/:id/retry-failed", requireAuth(), async (req, res) => {
  try {
    res.json(await retryFailedChunks(String(req.params.id), getReqUserId(req) as string));
  } catch (err) {
    fail(req, res, err);
  }
});

// Agendador externo (ex.: pg_cron + pg_net no Supabase, ou outro serviço) — mesma credencial da coleta
router.post("/cron/analysis-jobs", async (req, res) => {
  if (!cronConfigured()) {
    res.status(503).json({ error: "Agendador não configurado (CRON_SECRET ausente)." });
    return;
  }
  if (!verifyCronSecret(req.headers.authorization)) {
    res.status(401).json({ error: "Credencial do agendador inválida." });
    return;
  }
  try {
    res.json({ avancadas: await tickLongDocJobs(Math.max(30_000, platformBudgetMs() - 30_000)) });
  } catch (err) {
    fail(req, res, err);
  }
});

export default router;
