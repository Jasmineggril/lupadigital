/**
 * @file integrations/cron.ts
 * @description Coleta automática diária pelo agendador da Vercel (Vercel Cron).
 *
 * A Vercel chama GET /api/cron/collect no horário de `vercel.json` e envia
 * `Authorization: Bearer <CRON_SECRET>` quando a variável CRON_SECRET existe no projeto.
 *
 * Regras:
 *  - sem CRON_SECRET (ou curto demais) a rota responde 503 e NÃO coleta: nunca fica aberta;
 *  - segredo errado → 401;
 *  - cada fonte ativa só é coletada se a última execução começou há mais tempo que a
 *    frequência cadastrada (com 10 min de folga, para o horário do agendador variar);
 *  - uma execução "running" presa há mais de 30 min (função interrompida) não bloqueia
 *    para sempre: é encerrada como falha antes da nova tentativa.
 */
import { timingSafeEqual } from "node:crypto";
import type { CollectionRun, OpportunitySource } from "../types";

export const CRON_MIN_SECRET = 32;
export const STALE_RUN_MS = 30 * 60_000;
const SLACK_MS = 10 * 60_000;

export function cronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= CRON_MIN_SECRET);
}

export function verifyCronSecret(authorization: string | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < CRON_MIN_SECRET || !authorization?.startsWith("Bearer ")) return false;
  const a = Buffer.from(authorization.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CronDecision = { source_id: string; action: "coletar" | "pular"; motivo: string };

/** Decide, por fonte, se é hora de coletar. `runs` = execuções recentes (qualquer origem). */
export function dueSources(sources: OpportunitySource[], runs: CollectionRun[], now = new Date()): CronDecision[] {
  return sources.map((s) => {
    if (!s.enabled) return { source_id: s.id, action: "pular", motivo: "fonte desativada" };
    const last = runs
      .filter((r) => r.source_id === s.id && r.status !== "failed")
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    if (!last) return { source_id: s.id, action: "coletar", motivo: "nenhuma coleta anterior" };
    const age = now.getTime() - new Date(last.started_at).getTime();
    if (last.status === "running" && age < STALE_RUN_MS) return { source_id: s.id, action: "pular", motivo: "coleta em andamento" };
    const freq = (s.frequency_minutes ?? 1440) * 60_000;
    if (last.status !== "running" && age < freq - SLACK_MS) return { source_id: s.id, action: "pular", motivo: `última coleta há ${Math.round(age / 60_000)} min` };
    return { source_id: s.id, action: "coletar", motivo: last.status === "running" ? "execução anterior presa" : "frequência atingida" };
  });
}
