-- Drizzle migration: create ai_usage_logs compatibility columns
-- Generated: 2026-07-08

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  document_id text,
  module text NOT NULL,
  model text NOT NULL,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  success boolean DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS document_id text,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS success boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id
  ON public.ai_usage_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_module
  ON public.ai_usage_logs (module);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at
  ON public.ai_usage_logs (created_at DESC);
