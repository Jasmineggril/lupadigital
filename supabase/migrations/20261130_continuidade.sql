-- ============================================================================
-- 20261130 — Continuidade do usuário e "Meu histórico"
--
-- Só ADICIONA colunas (com valor padrão), índices, uma tabela e políticas. Nada é apagado;
-- linhas antigas continuam válidas (version = 1, favorito = false, updated_at = created_at).
-- Idempotente.
--
-- Em todas as tabelas de trabalho do usuário:
--   updated_at  última alteração confirmada pelo servidor (ordenação do histórico)
--   version     controle de concorrência: uma gravação com versão antiga recebe 409
--               (outra aba/aparelho alterou antes) em vez de sobrescrever em silêncio
--   client_id   chave de idempotência enviada pelo navegador: repetir o mesmo envio
--               (clique duplo, nova tentativa após falha de rede) não duplica o registro
--   favorito    fixar/favoritar no histórico
--
-- user_items: itens pequenos por pessoa e por tipo (progresso do "Aprender", termos
-- favoritos do glossário, consultas recentes OPCIONAIS). Chave única (user_id, kind, key).
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_results','lattes_profiles','article_analyses','planetarium_contents','research_projects','conversations','chat_messages'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz', t);
    EXECUTE format('UPDATE public.%I SET updated_at = created_at WHERE updated_at IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS client_id uuid', t);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (user_id, client_id) WHERE client_id IS NOT NULL', 'uq_' || t || '_client', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id, updated_at DESC)', 'idx_' || t || '_user_updated', t);
    IF t <> 'chat_messages' THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false', t);
    END IF;
  END LOOP;
END $$;

-- Editais: estado de trabalho da análise (checklist marcado, anotações, perguntas do chat)
-- e situação (concluída / parcial). O resultado da IA continua em result_json, intocado.
ALTER TABLE public.agent_results ADD COLUMN IF NOT EXISTS estado jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_results ADD COLUMN IF NOT EXISTS status text;

-- Conversas do Assistente: a tabela antiga (id inteiro) é reaproveitada; as mensagens ficam em
-- chat_messages.conversation_id (texto = id da conversa).
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages (user_id, conversation_id, created_at);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversations' AND policyname='conversations_select_own') THEN
    CREATE POLICY "conversations_select_own" ON public.conversations FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
END $$;

-- Itens pequenos por pessoa
CREATE TABLE IF NOT EXISTS public.user_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('aprendizagem','glossario_favorito','glossario_recente','preferencia')),
  key         text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, key)
);
CREATE INDEX IF NOT EXISTS idx_user_items_user_kind ON public.user_items (user_id, kind, updated_at DESC);
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_items' AND policyname='user_items_select_own') THEN
    CREATE POLICY "user_items_select_own" ON public.user_items FOR SELECT USING (user_id = auth.uid()::text);
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.user_items FROM anon, authenticated;
REVOKE ALL ON public.user_items FROM anon;

-- Permissão explícita do servidor (no Supabase ela já vem por padrão; aqui não depende disso)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_items TO service_role;
DO $$
BEGIN
  IF to_regclass('public.analysis_jobs') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_jobs, public.analysis_job_chunks TO service_role;
  END IF;
END $$;
