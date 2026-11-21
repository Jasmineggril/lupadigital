/**
 * @file integrations/hermes.ts
 * @description Contrato de integração do agendador Hermes com a coleta.
 *
 * Situação: a interface real do Hermes não está disponível. A coleta é separada do
 * agendamento; o que fica preparado é um endpoint de gatilho que o Hermes poderá chamar:
 *
 *   POST /api/integrations/hermes/collect
 *   Authorization: Bearer <HERMES_TRIGGER_SECRET>
 *   { "source_id": "fapdf", "request_id": "<id do Hermes>" }
 *   → 202 { run_id, status } | 409 coleta já em andamento | 401 segredo inválido
 *   | 503 integração não configurada (sem HERMES_TRIGGER_SECRET)
 *
 * Enquanto o Hermes não estiver integrado, a busca periódica é feita pelo agendador da
 * Vercel (integrations/cron.ts, GET /api/cron/collect), além da execução manual.
 */

import { timingSafeEqual } from "node:crypto";

export function hermesConfigured(): boolean {
  return Boolean(process.env.HERMES_TRIGGER_SECRET && process.env.HERMES_TRIGGER_SECRET.length >= 32);
}

export function verifyHermesSecret(authorization: string | undefined): boolean {
  const expected = process.env.HERMES_TRIGGER_SECRET;
  if (!expected || expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const a = Buffer.from(authorization.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const HERMES_STATUS = {
  integrated: false,
  note: "Contrato preparado (POST /api/integrations/hermes/collect). Aguardando a interface real do Hermes para configurar e verificar a busca periódica.",
} as const;
