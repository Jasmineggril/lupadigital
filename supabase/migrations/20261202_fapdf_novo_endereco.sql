-- ============================================================================
-- 20261202 — Novo endereço da página de editais da FAPDF
--
-- A coleta de 22/11/2026 falhou: https://www.fap.df.gov.br/editais/ passou a responder 404.
-- Endereço novo informado pela responsável pelo projeto em 23/11/2026.
-- Só troca se ainda estiver o endereço antigo (não sobrescreve uma configuração feita
-- pela administração). Idempotente.
-- ============================================================================
UPDATE public.opportunity_sources
   SET start_urls = ARRAY['https://www.fap.df.gov.br/editais-fapdf-20261'],
       updated_at = now()
 WHERE id = 'fapdf'
   AND start_urls = ARRAY['https://www.fap.df.gov.br/editais/'];
