-- ============================================================================
-- 20261125 — Leitura dos documentos oficiais (PDF) na coleta
-- Só ADICIONA colunas; documentos já registrados continuam como "não baixados".
-- ============================================================================
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS size_bytes integer;
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS page_count integer;
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS text_status text;
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS fetched_at timestamptz;
-- Texto por página (evidência com página). Limitado no código a 120 páginas × 12 mil caracteres.
ALTER TABLE IF EXISTS public.opportunity_documents ADD COLUMN IF NOT EXISTS pages jsonb;
