-- Migration: Adiciona user_id às tabelas conversations e shared_results
-- Data: 2026-07-13
-- Motivo: rastreabilidade de ownership por usuário (Drizzle schema sync)
--
-- Ambas as colunas são nullable para compatibilidade com registros legados
-- criados antes desta migration. Novos registros sempre devem incluir user_id.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id text;

ALTER TABLE shared_results
  ADD COLUMN IF NOT EXISTS user_id text;

-- Índices para acelerar queries de listagem por usuário
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_results_user_id ON shared_results(user_id);
