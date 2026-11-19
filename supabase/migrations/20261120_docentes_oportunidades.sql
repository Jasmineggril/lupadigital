-- Migration: perfis docentes, catálogo de oportunidades, coleta e recomendações
-- Data: 2026-11-20
--
-- Fluxo: fonte oficial → edital estruturado → perfil docente → recomendação explicada.
--
-- Princípios:
--   * Só cria objetos novos (IF NOT EXISTS). Nenhum DROP, nenhum dado existente alterado.
--   * RLS em todas as tabelas. O backend usa a service role (ignora RLS); as policies
--     abaixo valem para acesso direto com a chave anon/authenticated.
--   * Papel de administrador NÃO fica em tabela editável pelo usuário: vem de
--     auth.users.raw_app_meta_data->>'role' (só a service role altera) e é lido
--     pelo backend no JWT (app_metadata.role).
--
-- Idempotente.

-- ── Perfil docente ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_profiles (
  user_id             text PRIMARY KEY,
  display_name        text,
  institution         text,
  unit                text,
  areas               text[] NOT NULL DEFAULT '{}',
  competencies        text[] NOT NULL DEFAULT '{}',
  research_topics     text[] NOT NULL DEFAULT '{}',
  keywords            text[] NOT NULL DEFAULT '{}',
  current_projects    text,
  opportunity_types   text[] NOT NULL DEFAULT '{}',
  lattes_id           text,
  lattes_url          text,
  -- Títulos/vínculos autodeclarados: nunca são comprovação automática
  declared_degree     text,
  declared_bond       text,
  notification_prefs  jsonb NOT NULL DEFAULT '{"email": false, "frequency": "semanal"}'::jsonb,
  -- Origem e data de atualização de cada campo: {campo: {source, updated_at}}
  field_sources       jsonb NOT NULL DEFAULT '{}'::jsonb,
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- ── Fontes de coleta ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunity_sources (
  id                 text PRIMARY KEY,           -- ex.: 'fapdf'
  name               text NOT NULL,
  base_url           text NOT NULL,
  start_urls         text[] NOT NULL,
  allowed_hosts      text[] NOT NULL,
  max_depth          integer NOT NULL DEFAULT 2,
  max_pages          integer NOT NULL DEFAULT 60,
  time_budget_ms     integer NOT NULL DEFAULT 120000,
  request_delay_ms   integer NOT NULL DEFAULT 1500,
  frequency_minutes  integer NOT NULL DEFAULT 1440,
  enabled            boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opportunity_sources ENABLE ROW LEVEL SECURITY;

INSERT INTO public.opportunity_sources (id, name, base_url, start_urls, allowed_hosts)
VALUES (
  'fapdf',
  'FAPDF — Fundação de Apoio à Pesquisa do Distrito Federal',
  'https://www.fap.df.gov.br',
  ARRAY['https://www.fap.df.gov.br/editais/'],
  ARRAY['www.fap.df.gov.br', 'fap.df.gov.br']
)
ON CONFLICT (id) DO NOTHING;

-- ── Catálogo ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        text NOT NULL REFERENCES public.opportunity_sources(id),
  canonical_url    text NOT NULL UNIQUE,
  edital_number    text,
  title            text NOT NULL,
  status           text NOT NULL DEFAULT 'desconhecida'
                   CHECK (status IN ('aberta', 'encerrada', 'desconhecida')),
  fields           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- campos extraídos com evidências
  missing_fields   text[] NOT NULL DEFAULT '{}',
  content_hash     text NOT NULL,
  version          integer NOT NULL DEFAULT 1,
  review_status    text NOT NULL DEFAULT 'pendente'
                   CHECK (review_status IN ('pendente', 'revisado', 'rejeitado')),
  reviewed_by      text,
  reviewed_at      timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  captured_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opportunities_source ON public.opportunities (source_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.opportunities (status);
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.opportunity_versions (
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  content_hash    text NOT NULL,
  snapshot        jsonb NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, version)
);
ALTER TABLE public.opportunity_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.opportunity_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  url             text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('edital', 'anexo', 'retificacao', 'resultado', 'outro')),
  title           text NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, url)
);
ALTER TABLE public.opportunity_documents ENABLE ROW LEVEL SECURITY;

-- Eventos (retificação, prorrogação, resultado) separados da situação da oportunidade
CREATE TABLE IF NOT EXISTS public.opportunity_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('retificacao', 'prorrogacao', 'resultado')),
  title           text NOT NULL,
  url             text,
  event_date      text,
  evidence        text,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, kind, title)
);
ALTER TABLE public.opportunity_events ENABLE ROW LEVEL SECURITY;

-- ── Execuções da coleta ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collection_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     text NOT NULL REFERENCES public.opportunity_sources(id),
  trigger       text NOT NULL CHECK (trigger IN ('manual', 'hermes')),
  triggered_by  text,
  status        text NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  stats         jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors        jsonb NOT NULL DEFAULT '[]'::jsonb
);
-- Impede duas execuções simultâneas da mesma fonte
CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_runs_running
  ON public.collection_runs (source_id) WHERE status = 'running';
ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;

-- ── Recomendações, feedback e salvos ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recommendations (
  user_id              text NOT NULL,
  opportunity_id       uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  opportunity_version  integer NOT NULL,
  profile_version      integer NOT NULL,
  result               jsonb NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.recommendation_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  relevant        boolean NOT NULL,
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id)
);
ALTER TABLE public.recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.saved_opportunities (
  user_id         text NOT NULL,
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);
ALTER TABLE public.saved_opportunities ENABLE ROW LEVEL SECURITY;

-- ── Policies (acesso direto com anon/authenticated) ─────────────────────────
DO $$
BEGIN
  -- Perfil: só o dono lê e altera. Sem policy de DELETE/INSERT para outros.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teacher_profiles' AND policyname='teacher_profiles_select_own') THEN
    CREATE POLICY "teacher_profiles_select_own" ON public.teacher_profiles FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teacher_profiles' AND policyname='teacher_profiles_insert_own') THEN
    CREATE POLICY "teacher_profiles_insert_own" ON public.teacher_profiles FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='teacher_profiles' AND policyname='teacher_profiles_update_own') THEN
    CREATE POLICY "teacher_profiles_update_own" ON public.teacher_profiles FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;

  -- Catálogo: leitura para usuários autenticados; escrita só pelo backend
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='opportunities' AND policyname='opportunities_select_authenticated') THEN
    CREATE POLICY "opportunities_select_authenticated" ON public.opportunities FOR SELECT TO authenticated USING (review_status <> 'rejeitado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='opportunity_documents' AND policyname='opportunity_documents_select_authenticated') THEN
    CREATE POLICY "opportunity_documents_select_authenticated" ON public.opportunity_documents FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='opportunity_events' AND policyname='opportunity_events_select_authenticated') THEN
    CREATE POLICY "opportunity_events_select_authenticated" ON public.opportunity_events FOR SELECT TO authenticated USING (true);
  END IF;

  -- Dados por usuário
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recommendations' AND policyname='recommendations_select_own') THEN
    CREATE POLICY "recommendations_select_own" ON public.recommendations FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recommendation_feedback' AND policyname='recommendation_feedback_own') THEN
    CREATE POLICY "recommendation_feedback_own" ON public.recommendation_feedback FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_opportunities' AND policyname='saved_opportunities_own') THEN
    CREATE POLICY "saved_opportunities_own" ON public.saved_opportunities FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  -- opportunity_sources, opportunity_versions e collection_runs: sem policy (só backend/admin)
END;
$$;
