-- Migration: create view `edital_analyses` as alias for legacy `edital_analises`
-- This provides a canonical public name while preserving the legacy table.
CREATE VIEW IF NOT EXISTS public.edital_analyses AS
  SELECT * FROM public.edital_analises;

-- Grant select/insert/update/delete to the authenticated role if needed (optional):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.edital_analyses TO authenticated;
