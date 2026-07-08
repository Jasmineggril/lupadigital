-- Drizzle migration: create ai_usage_logs
-- Generated: 2026-07-07

-- Create table for AI usage logs
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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON public.ai_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_module ON public.ai_usage_logs (module);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs (created_at DESC);

-- Row Level Security: enable and provide permissive policies for server-side inserts/selects
-- Adapt policies as needed in production to limit access.
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy: allow server (service role) to insert/select/delete (supabase service role should bypass RLS)
-- If you manage RLS strictly via policies, add policies below. Example permissive policies:

CREATE POLICY IF NOT EXISTS "allow_public_select_for_metrics"
  ON public.ai_usage_logs
  FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "allow_insert_from_server"
  ON public.ai_usage_logs
  FOR INSERT
  WITH CHECK (true);

-- Note: For stricter security, limit SELECT to internal roles and do not expose logs via public endpoints.

-- End of migration
