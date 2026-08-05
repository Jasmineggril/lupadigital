-- Migration: Tabelas de recursos do usuário usadas pelo frontend via /api/resources
-- Data: 2026-08-05
-- Cria apenas as 6 tabelas comprovadamente utilizadas (auditoria 2026-08-05).
-- Colunas derivadas dos Zod schemas em artifacts/api-server/src/routes/resources.ts
-- e dos payloads reais em analisesService.ts / páginas (testar, elattes, artigos,
-- projetos, planetario, assistente).
-- Segurança: UUID PK, user_id text NOT NULL (sempre injetado do JWT pelo backend),
-- RLS habilitada com policies restritas ao dono (auth.uid()), sem policy pública.
-- Nenhum DROP, nenhuma alteração nas tabelas legadas.

-- ── edital_analyses ─────────────────────────────────────────────────────────
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

CREATE POLICY IF NOT EXISTS "edital_analyses_select_own" ON public.edital_analyses
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "edital_analyses_insert_own" ON public.edital_analyses
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "edital_analyses_update_own" ON public.edital_analyses
  FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "edital_analyses_delete_own" ON public.edital_analyses
  FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_edital_analyses_user_id    ON public.edital_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_edital_analyses_created_at ON public.edital_analyses (created_at);

-- updated_at é mantido via trigger (o backend faz PUT/UPDATE em edital_analyses)
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

-- ── lattes_profiles ─────────────────────────────────────────────────────────
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

CREATE POLICY IF NOT EXISTS "lattes_profiles_select_own" ON public.lattes_profiles
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "lattes_profiles_insert_own" ON public.lattes_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "lattes_profiles_update_own" ON public.lattes_profiles
  FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "lattes_profiles_delete_own" ON public.lattes_profiles
  FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_lattes_profiles_user_id    ON public.lattes_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_lattes_profiles_created_at ON public.lattes_profiles (created_at);

-- ── article_analyses ────────────────────────────────────────────────────────
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

CREATE POLICY IF NOT EXISTS "article_analyses_select_own" ON public.article_analyses
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "article_analyses_insert_own" ON public.article_analyses
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "article_analyses_update_own" ON public.article_analyses
  FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "article_analyses_delete_own" ON public.article_analyses
  FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_article_analyses_user_id    ON public.article_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_article_analyses_created_at ON public.article_analyses (created_at);

-- ── research_projects ───────────────────────────────────────────────────────
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

CREATE POLICY IF NOT EXISTS "research_projects_select_own" ON public.research_projects
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "research_projects_insert_own" ON public.research_projects
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "research_projects_update_own" ON public.research_projects
  FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "research_projects_delete_own" ON public.research_projects
  FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_research_projects_user_id    ON public.research_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_created_at ON public.research_projects (created_at);

-- ── planetarium_contents ────────────────────────────────────────────────────
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

CREATE POLICY IF NOT EXISTS "planetarium_contents_select_own" ON public.planetarium_contents
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "planetarium_contents_insert_own" ON public.planetarium_contents
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "planetarium_contents_update_own" ON public.planetarium_contents
  FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "planetarium_contents_delete_own" ON public.planetarium_contents
  FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_planetarium_contents_user_id    ON public.planetarium_contents (user_id);
CREATE INDEX IF NOT EXISTS idx_planetarium_contents_created_at ON public.planetarium_contents (created_at);

-- ── chat_messages ───────────────────────────────────────────────────────────
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

CREATE POLICY IF NOT EXISTS "chat_messages_select_own" ON public.chat_messages
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "chat_messages_insert_own" ON public.chat_messages
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "chat_messages_update_own" ON public.chat_messages
  FOR UPDATE USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY IF NOT EXISTS "chat_messages_delete_own" ON public.chat_messages
  FOR DELETE USING (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id    ON public.chat_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages (created_at);

-- End of migration
