-- Migration: add user_id to shared_results to record owner of shared tokens
ALTER TABLE public.shared_results
  ADD COLUMN IF NOT EXISTS user_id text;

-- Optional index for lookups by user
CREATE INDEX IF NOT EXISTS idx_shared_results_user_id ON public.shared_results (user_id);
