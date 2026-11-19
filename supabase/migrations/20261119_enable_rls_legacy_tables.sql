-- Migration: Habilita RLS nas tabelas legadas (criadas em 20260710_create_lupa_tables.sql)
-- Data: 2026-11-19
--
-- Problema: conversations, messages, saved_editals, agent_results e shared_results
-- foram criadas SEM Row Level Security. No Supabase, uma tabela do schema public sem
-- RLS fica acessível pela API REST (PostgREST) com a chave anon — que é pública e
-- vai no bundle do frontend. Ou seja: qualquer pessoa podia ler (e gravar) os
-- editais, análises e links compartilhados de todos os usuários.
--
-- Correção: habilitar RLS. O backend usa a service role, que ignora RLS, então as
-- rotas da API continuam funcionando sem alteração. O frontend não acessa essas
-- tabelas diretamente (só via /api).
--
-- Policies:
--   - agent_results / saved_editals: o dono (auth.uid()) pode ler e apagar os seus.
--   - conversations / messages / shared_results / _migrations: nenhuma policy para
--     anon/authenticated (acesso apenas pelo backend). shared_results continua
--     público via GET /api/edital/share/:token, que exige conhecer o token.
--
-- Idempotente: pode ser executada mais de uma vez.

ALTER TABLE IF EXISTS public.conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saved_editals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shared_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public._migrations    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.agent_results') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_results' AND policyname = 'agent_results_select_own') THEN
      CREATE POLICY "agent_results_select_own" ON public.agent_results
        FOR SELECT USING (user_id = auth.uid()::text);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_results' AND policyname = 'agent_results_delete_own') THEN
      CREATE POLICY "agent_results_delete_own" ON public.agent_results
        FOR DELETE USING (user_id = auth.uid()::text);
    END IF;
  END IF;

  IF to_regclass('public.saved_editals') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'saved_editals' AND policyname = 'saved_editals_select_own') THEN
      CREATE POLICY "saved_editals_select_own" ON public.saved_editals
        FOR SELECT USING (user_id = auth.uid()::text);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'saved_editals' AND policyname = 'saved_editals_delete_own') THEN
      CREATE POLICY "saved_editals_delete_own" ON public.saved_editals
        FOR DELETE USING (user_id = auth.uid()::text);
    END IF;
  END IF;
END;
$$;

-- A função exec_sql (usada pelo executor de migrations do backend) executa SQL
-- arbitrário. Se existir, só a service role pode chamá-la.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'exec_sql'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END;
$$;

-- Índice para a busca de links compartilhados por token já existe (UNIQUE).
-- Índice para limpeza/ordenação por data:
CREATE INDEX IF NOT EXISTS idx_shared_results_created_at ON public.shared_results (created_at);
