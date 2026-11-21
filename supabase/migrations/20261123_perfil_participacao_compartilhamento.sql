-- ============================================================================
-- 20261123 — Perfil progressivo, "Quero participar" e compartilhamento revogável
--
-- Só ADICIONA colunas, uma tabela e políticas. Nenhum dado existente é apagado.
-- Idempotente (pode rodar mais de uma vez).
--
-- 1. teacher_profiles: perfil essencial (vínculos, formação, objetivos, objetivo
--    atual, localização, modalidade). Vínculos NÃO concedem permissão: o papel de
--    administração continua vindo só de app_metadata (controlado no servidor).
-- 2. participations: espaço de trabalho por edital (dono = user_id).
-- 3. shared_results: validade (expires_at) e revogação (revoked_at).
--    Links antigos sem validade ganham validade de 30 dias a partir desta migração
--    (não somem agora; deixam de ser eternos).
-- ============================================================================

-- 1. Perfil essencial -------------------------------------------------------
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS vinculos text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS formacao_situacao text;
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS formacao_curso text;
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS objetivos text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS objetivo_atual text;
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS localizacao text;
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS modalidade text;

-- 2. Quero participar --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.participations (
  id                   uuid PRIMARY KEY,
  user_id              text NOT NULL,
  titulo               text NOT NULL,
  tipo                 text NOT NULL DEFAULT 'outro',
  situacao             text NOT NULL DEFAULT 'interesse',
  opportunity_id       uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  opportunity_version  integer,
  agent_result_id      integer,
  fields_snapshot      jsonb,
  exige_projeto        boolean NOT NULL DEFAULT false,
  checklist            jsonb NOT NULL DEFAULT '[]'::jsonb,
  prazos               jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposta             jsonb NOT NULL DEFAULT '{}'::jsonb,
  versoes              jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas                text,
  version              integer NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_participations_user ON public.participations (user_id, updated_at DESC);
ALTER TABLE public.participations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'participations' AND policyname = 'participations_own') THEN
    CREATE POLICY "participations_own" ON public.participations FOR ALL
      USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
END $$;

-- 3. Compartilhamento com validade e revogação -------------------------------
ALTER TABLE IF EXISTS public.shared_results ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE IF EXISTS public.shared_results ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_shared_results_user ON public.shared_results (user_id);
UPDATE public.shared_results SET expires_at = now() + interval '30 days' WHERE expires_at IS NULL;
