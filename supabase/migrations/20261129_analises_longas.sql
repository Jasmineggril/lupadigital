-- ============================================================================
-- 20261129 — Análise de documentos longos em segundo plano (execução durável)
--
-- Só CRIA tabelas, função e políticas. Nada existente é alterado. Idempotente.
--
-- analysis_jobs        uma análise longa por linha (dono = user_id). O texto do documento fica
--                      aqui apenas enquanto é necessário: o servidor apaga `document_text` ao
--                      concluir, ao cancelar e ao vencer `expires_at` (retenção de 7 dias).
-- analysis_job_chunks  uma linha por parte: intervalo de caracteres, páginas, seção, situação,
--                      tentativas, fatos extraídos e erro. O andamento sobrevive ao fim da
--                      função serverless e à atualização da página.
--
-- O navegador só LÊ as próprias tarefas (RLS); toda escrita passa pelo servidor (service role),
-- que aplica limites de tamanho, de custo e de concorrência.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id                uuid PRIMARY KEY,
  user_id           text NOT NULL,
  agent_id          text NOT NULL,
  status            text NOT NULL CHECK (status IN ('pendente','processando','aguardando_cota','concluida','parcial','falhou','cancelada')),
  document_hash     text NOT NULL,
  document_text     text,
  chars             integer NOT NULL,
  pages             integer,
  total_chunks      integer NOT NULL,
  done_chunks       integer NOT NULL DEFAULT 0,
  failed_chunks     integer NOT NULL DEFAULT 0,
  profile           jsonb,
  result            jsonb,
  error             text,
  tokens_used       integer NOT NULL DEFAULT 0,
  ai_calls          integer NOT NULL DEFAULT 0,
  estimated_tokens  integer NOT NULL DEFAULT 0,
  lease_owner       text,
  lease_until       timestamptz,
  next_attempt_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user ON public.analysis_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_active ON public.analysis_jobs (status, next_attempt_at) WHERE status IN ('pendente','processando','aguardando_cota');
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_expires ON public.analysis_jobs (expires_at);
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analysis_job_chunks (
  job_id           uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  idx              integer NOT NULL,
  start_offset     integer NOT NULL,
  end_offset       integer NOT NULL,
  ctx_start        integer NOT NULL,
  page_start       integer,
  page_end         integer,
  section          text,
  content_hash     text NOT NULL,
  status           text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','concluida','falhou')),
  attempts         integer NOT NULL DEFAULT 0,
  facts            jsonb,
  error            text,
  tokens           integer,
  next_attempt_at  timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, idx)
);
ALTER TABLE public.analysis_job_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analysis_jobs' AND policyname = 'analysis_jobs_select_own') THEN
    CREATE POLICY "analysis_jobs_select_own" ON public.analysis_jobs FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analysis_job_chunks' AND policyname = 'analysis_job_chunks_select_own') THEN
    CREATE POLICY "analysis_job_chunks_select_own" ON public.analysis_job_chunks FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.analysis_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()::text));
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.analysis_jobs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.analysis_job_chunks FROM anon, authenticated;
REVOKE ALL ON public.analysis_jobs FROM anon;
REVOKE ALL ON public.analysis_job_chunks FROM anon;

-- Reserva ATÔMICA da tarefa por quem vai processá-la (navegador, agendador ou servidor próprio).
-- Só um processador por vez; uma reserva vencida (função encerrada no meio) pode ser retomada.
CREATE OR REPLACE FUNCTION public.analysis_job_claim(p_id uuid, p_owner text, p_lease_seconds integer)
RETURNS SETOF public.analysis_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.analysis_jobs
     SET lease_owner = p_owner,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         status = CASE WHEN status = 'pendente' THEN 'processando' ELSE status END,
         updated_at = now()
   WHERE id = p_id
     AND status IN ('pendente','processando','aguardando_cota','parcial')
     AND (lease_until IS NULL OR lease_until < now() OR lease_owner = p_owner)
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.analysis_job_claim(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analysis_job_claim(uuid, text, integer) TO service_role;
