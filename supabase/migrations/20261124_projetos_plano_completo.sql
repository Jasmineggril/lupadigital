-- ============================================================================
-- 20261124 — Projetos: plano completo, origem e vínculo com a participação
--
-- Só ADICIONA colunas. Registros antigos continuam válidos: sem `plan`, a tela
-- reconstrói o que existe (título, resumo, equipe, cronograma) e avisa que é parcial.
-- Idempotente.
-- ============================================================================
ALTER TABLE IF EXISTS public.research_projects ADD COLUMN IF NOT EXISTS plan jsonb;
ALTER TABLE IF EXISTS public.research_projects ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE IF EXISTS public.research_projects ADD COLUMN IF NOT EXISTS origin jsonb;
-- Projetos manuais (gerenciador de etapas): antes só no navegador, numa chave sem dono
ALTER TABLE IF EXISTS public.research_projects ADD COLUMN IF NOT EXISTS manual jsonb;
ALTER TABLE IF EXISTS public.research_projects ADD COLUMN IF NOT EXISTS contract_version integer;
ALTER TABLE IF EXISTS public.research_projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_research_projects_user ON public.research_projects (user_id, created_at DESC);

-- Participação ↔ projeto (um projeto por participação; nada duplicado)
ALTER TABLE IF EXISTS public.participations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.research_projects(id) ON DELETE SET NULL;
