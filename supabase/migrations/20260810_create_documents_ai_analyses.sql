-- Migration: documents e ai_analyses (recursos usados pelo frontend via /api/resources)
-- Data: 2026-08-10
-- Tabelas já referenciadas por analisesService.ts (uploadDocument/listDocuments/deleteDocument,
-- saveAiAnalysis/listAiAnalyses) e pelos tipos em supabase-types.ts. Não existiam em produção
-- nem nas migrations — criadas agora para fechar o ciclo front/back/dados.
-- Segurança: UUID PK, user_id text NOT NULL (injetado do JWT pelo backend), RLS habilitada
-- com policies restritas ao dono (auth.uid()), sem policy pública.
-- Nenhum DROP.

-- ── documents ────────────────────────────────────────────────────────────────
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

-- ── ai_analyses ──────────────────────────────────────────────────────────────
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
