-- Migration: ai_usage_logs (telemetria de uso da IA) — migration separada
-- Data: 2026-08-05
-- Opção D.1 adotada: criar ai_usage_logs com schema mínimo e seguro, derivado
-- exclusivamente do payload de artifacts/api-server/src/lib/aiService.ts
-- (buildUsageLogPayload + persistUsageLog). Sem policies públicas:
-- apenas o dono (auth.uid()) enxerga/altera os próprios registros e o backend
-- (service role) continua inserindo normalmente (bypass de RLS do service role).
-- Não misturada com as tabelas funcionais de resources.
-- Nenhum DROP.

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text,
  document_id   text,
  module        text NOT NULL,
  model         text NOT NULL,
  latency_ms    integer,
  input_tokens  integer,
  output_tokens integer,
  total_tokens  integer,
  success       boolean NOT NULL DEFAULT false,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_usage_logs' AND policyname = 'ai_usage_logs_select_own') THEN
    CREATE POLICY "ai_usage_logs_select_own" ON public.ai_usage_logs
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_usage_logs' AND policyname = 'ai_usage_logs_insert_own') THEN
    CREATE POLICY "ai_usage_logs_insert_own" ON public.ai_usage_logs
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_usage_logs' AND policyname = 'ai_usage_logs_update_own') THEN
    CREATE POLICY "ai_usage_logs_update_own" ON public.ai_usage_logs
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_usage_logs' AND policyname = 'ai_usage_logs_delete_own') THEN
    CREATE POLICY "ai_usage_logs_delete_own" ON public.ai_usage_logs
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id    ON public.ai_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs (created_at);

-- End of migration
