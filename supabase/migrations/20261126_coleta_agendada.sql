-- ============================================================================
-- 20261126 — Coleta automática diária (Vercel Cron)
-- Só AMPLIA o CHECK de collection_runs.trigger para aceitar 'agendada'.
-- Execuções existentes ('manual', 'hermes') continuam válidas. Idempotente.
-- ============================================================================
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.collection_runs'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%trigger%'
     AND pg_get_constraintdef(oid) NOT LIKE '%agendada%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.collection_runs DROP CONSTRAINT %I', c);
    ALTER TABLE public.collection_runs ADD CONSTRAINT collection_runs_trigger_check
      CHECK (trigger IN ('manual', 'hermes', 'agendada'));
  END IF;
END $$;
