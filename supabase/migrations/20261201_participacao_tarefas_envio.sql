-- ============================================================================
-- 20261201 — Acompanhamento da participação: tarefas e registro de envio/resultado
--
-- tarefas    lista de tarefas com responsável e meta pessoal (não substitui prazo oficial)
-- submissao  data de envio, protocolo e resultado INFORMADOS PELA PESSOA (o LUPA não
--            confirma envio nem aprovação sozinho); null = nada registrado
-- Só adiciona colunas com padrão; linhas antigas continuam válidas. Idempotente.
-- ============================================================================
ALTER TABLE IF EXISTS public.participations ADD COLUMN IF NOT EXISTS tarefas jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS public.participations ADD COLUMN IF NOT EXISTS submissao jsonb;
