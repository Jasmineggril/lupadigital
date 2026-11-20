-- Migration: favorito no histórico de análises (agent_results)
-- Data: 2026-11-22
--
-- O histórico de análises do /testar passa a ter uma fonte única: agent_results
-- (guarda o resultado completo, então reabrir mostra exatamente o que foi exibido).
-- Antes, o favorito só existia em edital_analyses, que guardava apenas o texto.
-- Só adiciona coluna. Idempotente.

ALTER TABLE IF EXISTS public.agent_results ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agent_results_user_created ON public.agent_results (user_id, created_at DESC);
