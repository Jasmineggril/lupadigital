-- ============================================================================
-- LUPA PÚBLICA — APLICAR NO SUPABASE DE PRODUÇÃO
-- ============================================================================
-- Como usar:
--   1. Abra https://supabase.com/dashboard → seu projeto → SQL Editor → New query
--   2. Cole TODO o conteúdo deste arquivo e clique em "Run" (ou Ctrl+Enter)
--   3. Confirme que apareceram as tabelas em Table Editor → public
--      (edital_analyses, lattes_profiles, article_analyses, research_projects,
--       planetarium_contents, chat_messages, ai_usage_logs, documents, ai_analyses)
--
-- Tudo é idempotente (IF NOT EXISTS / DO $$) — pode rodar mais de uma vez
-- sem quebrar nada. Nenhum DROP é executado.
--
-- Origem: consolidação das migrations do repo (fix/ci-typecheck-and-supabase-preview):
--   - 20260805_create_resources_tables.sql
--   - 20260805_create_ai_usage_logs.sql
--   - 20260810_create_documents_ai_analyses.sql
-- ============================================================================

-- Migration: Tabelas de recursos do usuÃ¡rio usadas pelo frontend via /api/resources
-- Data: 2026-08-05
-- Cria apenas as 6 tabelas comprovadamente utilizadas (auditoria 2026-08-05).
-- Colunas derivadas dos Zod schemas em artifacts/api-server/src/routes/resources.ts
-- e dos payloads reais em analisesService.ts / pÃ¡ginas (testar, elattes, artigos,
-- projetos, planetario, assistente).
-- SeguranÃ§a: UUID PK, user_id text NOT NULL (sempre injetado do JWT pelo backend),
-- RLS habilitada com policies restritas ao dono (auth.uid()), sem policy pÃºblica.
-- Nenhum DROP, nenhuma alteraÃ§Ã£o nas tabelas legadas.

-- â”€â”€ edital_analyses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.edital_analyses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text NOT NULL,
  titulo                text,
  conteudo_original     text,
  conteudo_simplificado text,
  categoria             text,
  modo_analise          text,
  indicadores           jsonb,
  timeline              jsonb,
  recomendacoes         jsonb,
  favorito              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz
);

ALTER TABLE public.edital_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'edital_analyses' AND policyname = 'edital_analyses_select_own') THEN
    CREATE POLICY "edital_analyses_select_own" ON public.edital_analyses
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'edital_analyses' AND policyname = 'edital_analyses_insert_own') THEN
    CREATE POLICY "edital_analyses_insert_own" ON public.edital_analyses
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'edital_analyses' AND policyname = 'edital_analyses_update_own') THEN
    CREATE POLICY "edital_analyses_update_own" ON public.edital_analyses
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'edital_analyses' AND policyname = 'edital_analyses_delete_own') THEN
    CREATE POLICY "edital_analyses_delete_own" ON public.edital_analyses
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_edital_analyses_user_id    ON public.edital_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_edital_analyses_created_at ON public.edital_analyses (created_at);

-- updated_at Ã© mantido via trigger (o backend faz PUT/UPDATE em edital_analyses)
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_edital_analyses_updated_at ON public.edital_analyses;
CREATE TRIGGER trg_edital_analyses_updated_at
  BEFORE UPDATE ON public.edital_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- â”€â”€ lattes_profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.lattes_profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  name       text,
  lattes_xml text,
  summary    text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lattes_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lattes_profiles' AND policyname = 'lattes_profiles_select_own') THEN
    CREATE POLICY "lattes_profiles_select_own" ON public.lattes_profiles
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lattes_profiles' AND policyname = 'lattes_profiles_insert_own') THEN
    CREATE POLICY "lattes_profiles_insert_own" ON public.lattes_profiles
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lattes_profiles' AND policyname = 'lattes_profiles_update_own') THEN
    CREATE POLICY "lattes_profiles_update_own" ON public.lattes_profiles
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lattes_profiles' AND policyname = 'lattes_profiles_delete_own') THEN
    CREATE POLICY "lattes_profiles_delete_own" ON public.lattes_profiles
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_lattes_profiles_user_id    ON public.lattes_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_lattes_profiles_created_at ON public.lattes_profiles (created_at);

-- â”€â”€ article_analyses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.article_analyses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  title      text,
  authors    jsonb,
  summary    text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.article_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'article_analyses' AND policyname = 'article_analyses_select_own') THEN
    CREATE POLICY "article_analyses_select_own" ON public.article_analyses
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'article_analyses' AND policyname = 'article_analyses_insert_own') THEN
    CREATE POLICY "article_analyses_insert_own" ON public.article_analyses
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'article_analyses' AND policyname = 'article_analyses_update_own') THEN
    CREATE POLICY "article_analyses_update_own" ON public.article_analyses
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'article_analyses' AND policyname = 'article_analyses_delete_own') THEN
    CREATE POLICY "article_analyses_delete_own" ON public.article_analyses
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_article_analyses_user_id    ON public.article_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_article_analyses_created_at ON public.article_analyses (created_at);

-- â”€â”€ research_projects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.research_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  title       text,
  description text,
  team        jsonb,
  timeline    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_projects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'research_projects' AND policyname = 'research_projects_select_own') THEN
    CREATE POLICY "research_projects_select_own" ON public.research_projects
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'research_projects' AND policyname = 'research_projects_insert_own') THEN
    CREATE POLICY "research_projects_insert_own" ON public.research_projects
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'research_projects' AND policyname = 'research_projects_update_own') THEN
    CREATE POLICY "research_projects_update_own" ON public.research_projects
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'research_projects' AND policyname = 'research_projects_delete_own') THEN
    CREATE POLICY "research_projects_delete_own" ON public.research_projects
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_research_projects_user_id    ON public.research_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_created_at ON public.research_projects (created_at);

-- â”€â”€ planetarium_contents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.planetarium_contents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  title      text,
  content    text,
  audience   text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planetarium_contents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'planetarium_contents' AND policyname = 'planetarium_contents_select_own') THEN
    CREATE POLICY "planetarium_contents_select_own" ON public.planetarium_contents
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'planetarium_contents' AND policyname = 'planetarium_contents_insert_own') THEN
    CREATE POLICY "planetarium_contents_insert_own" ON public.planetarium_contents
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'planetarium_contents' AND policyname = 'planetarium_contents_update_own') THEN
    CREATE POLICY "planetarium_contents_update_own" ON public.planetarium_contents
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'planetarium_contents' AND policyname = 'planetarium_contents_delete_own') THEN
    CREATE POLICY "planetarium_contents_delete_own" ON public.planetarium_contents
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_planetarium_contents_user_id    ON public.planetarium_contents (user_id);
CREATE INDEX IF NOT EXISTS idx_planetarium_contents_created_at ON public.planetarium_contents (created_at);

-- â”€â”€ chat_messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,
  conversation_id text,
  role            text CHECK (role IS NULL OR role IN ('user', 'assistant', 'system')),
  content         text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'chat_messages_select_own') THEN
    CREATE POLICY "chat_messages_select_own" ON public.chat_messages
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'chat_messages_insert_own') THEN
    CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'chat_messages_update_own') THEN
    CREATE POLICY "chat_messages_update_own" ON public.chat_messages
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'chat_messages_delete_own') THEN
    CREATE POLICY "chat_messages_delete_own" ON public.chat_messages
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id    ON public.chat_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages (created_at);

-- End of migration


-- Migration: ai_usage_logs (telemetria de uso da IA) â€” migration separada
-- Data: 2026-08-05
-- OpÃ§Ã£o D.1 adotada: criar ai_usage_logs com schema mÃ­nimo e seguro, derivado
-- exclusivamente do payload de artifacts/api-server/src/lib/aiService.ts
-- (buildUsageLogPayload + persistUsageLog). Sem policies pÃºblicas:
-- apenas o dono (auth.uid()) enxerga/altera os prÃ³prios registros e o backend
-- (service role) continua inserindo normalmente (bypass de RLS do service role).
-- NÃ£o misturada com as tabelas funcionais de resources.
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


-- Migration: documents e ai_analyses (recursos usados pelo frontend via /api/resources)
-- Data: 2026-08-10
-- Tabelas jÃ¡ referenciadas por analisesService.ts (uploadDocument/listDocuments/deleteDocument,
-- saveAiAnalysis/listAiAnalyses) e pelos tipos em supabase-types.ts. NÃ£o existiam em produÃ§Ã£o
-- nem nas migrations â€” criadas agora para fechar o ciclo front/back/dados.
-- SeguranÃ§a: UUID PK, user_id text NOT NULL (injetado do JWT pelo backend), RLS habilitada
-- com policies restritas ao dono (auth.uid()), sem policy pÃºblica.
-- Nenhum DROP.

-- â”€â”€ documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  filename   text,
  mime_type  text,
  size       integer,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_select_own') THEN
    CREATE POLICY "documents_select_own" ON public.documents
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_insert_own') THEN
    CREATE POLICY "documents_insert_own" ON public.documents
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_update_own') THEN
    CREATE POLICY "documents_update_own" ON public.documents
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' AND policyname = 'documents_delete_own') THEN
    CREATE POLICY "documents_delete_own" ON public.documents
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_documents_user_id    ON public.documents (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents (created_at);

-- â”€â”€ ai_analyses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  model      text,
  input      text,
  output     jsonb,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_analyses' AND policyname = 'ai_analyses_select_own') THEN
    CREATE POLICY "ai_analyses_select_own" ON public.ai_analyses
      FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_analyses' AND policyname = 'ai_analyses_insert_own') THEN
    CREATE POLICY "ai_analyses_insert_own" ON public.ai_analyses
      FOR INSERT WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_analyses' AND policyname = 'ai_analyses_update_own') THEN
    CREATE POLICY "ai_analyses_update_own" ON public.ai_analyses
      FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_analyses' AND policyname = 'ai_analyses_delete_own') THEN
    CREATE POLICY "ai_analyses_delete_own" ON public.ai_analyses
      FOR DELETE USING (user_id = auth.uid()::text);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_id    ON public.ai_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON public.ai_analyses (created_at);

-- End of migration
