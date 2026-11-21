-- ============================================================================
-- 20261128 — ai_usage_logs: o cliente não grava nem altera registros de consumo
-- Achado (teste de isolamento): as políticas *_insert_own / *_update_own deixavam uma pessoa
-- autenticada, com a chave pública, criar ou mudar registros de consumo de IA dela mesma
-- (forjar uso, apagar rastros). Quem grava é só o servidor (service_role, que ignora RLS).
-- Leitura e exclusão das próprias linhas continuam (transparência e "excluir meus dados").
-- Idempotente; não apaga dados.
-- ============================================================================
DROP POLICY IF EXISTS ai_usage_logs_insert_own ON public.ai_usage_logs;
DROP POLICY IF EXISTS ai_usage_logs_update_own ON public.ai_usage_logs;
