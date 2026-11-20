-- Migration: refinamentos do fluxo docente
-- Data: 2026-11-21
--
-- Só adiciona colunas e tabelas (IF NOT EXISTS); nenhum dado existente é apagado.
-- Idempotente.
--
--   * Perfil: ORCID, interesses temporários e disponibilidade para coordenar/colaborar.
--   * Oportunidade: situações "suspensa" e "cancelada" (separadas dos eventos).
--   * Fonte: instituição responsável e tipo de fonte.
--   * Salvos: "demonstrar interesse" e versão do edital vista ao salvar.
--   * Central interna de avisos (sem envio externo), com deduplicação por versão.

-- ── Perfil ──────────────────────────────────────────────────────────────────
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS orcid text;
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS temporary_interests text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.teacher_profiles ADD COLUMN IF NOT EXISTS collaboration_role text;

-- ── Situação da oportunidade ───────────────────────────────────────────────
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.opportunities'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%' AND pg_get_constraintdef(oid) NOT LIKE '%review_status%'
     AND pg_get_constraintdef(oid) NOT LIKE '%suspensa%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.opportunities DROP CONSTRAINT %I', c);
    ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_status_check
      CHECK (status IN ('aberta', 'encerrada', 'suspensa', 'cancelada', 'desconhecida'));
  END IF;
END $$;

-- ── Fontes ──────────────────────────────────────────────────────────────────
ALTER TABLE public.opportunity_sources ADD COLUMN IF NOT EXISTS institution text;
ALTER TABLE public.opportunity_sources ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'portal_editais';
UPDATE public.opportunity_sources
   SET institution = 'Fundação de Apoio à Pesquisa do Distrito Federal'
 WHERE id = 'fapdf' AND institution IS NULL;

-- ── Salvos / interesse ──────────────────────────────────────────────────────
ALTER TABLE public.saved_opportunities ADD COLUMN IF NOT EXISTS interested boolean NOT NULL DEFAULT false;
ALTER TABLE public.saved_opportunities ADD COLUMN IF NOT EXISTS seen_version integer;

-- ── Central de avisos (interna) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              text NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('recomendacao', 'mudanca_salvo')),
  opportunity_id       uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  opportunity_version  integer NOT NULL,
  title                text NOT NULL,
  body                 text NOT NULL,
  read_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, opportunity_id, opportunity_version)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_own') THEN
    CREATE POLICY "notifications_own" ON public.notifications FOR ALL
      USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
END $$;
