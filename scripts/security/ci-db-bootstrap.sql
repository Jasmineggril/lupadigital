-- Prepara um Postgres VAZIO (CI) com o mínimo do Supabase para aplicar as migrações e testar RLS:
-- papéis anon/authenticated/service_role, schema auth com auth.uid() lendo o JWT da sessão
-- (mesmas chaves que o Supabase usa) e auth.users mínima. NÃO usar em projeto Supabase.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
