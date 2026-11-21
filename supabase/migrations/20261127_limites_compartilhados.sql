-- ============================================================================
-- 20261127 — Limites de uso COMPARTILHADOS entre instâncias (custo de IA/OCR)
-- Antes: contadores só na memória de cada processo — cada instância serverless tinha a sua
-- cota, e reiniciar zerava tudo. Agora os contadores ficam no Postgres, com operação atômica.
-- Só ADICIONA objetos. Acesso: apenas service_role (RLS ligada, sem políticas; EXECUTE
-- revogado de anon/authenticated). Nenhum dado pessoal além da chave (id do usuário ou
-- prefixo de IP já reduzido pelo servidor). Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_counters (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        bigint      NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_counters_expires ON public.rate_counters (expires_at);
ALTER TABLE public.rate_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rate_inflight (
  id         uuid        PRIMARY KEY,
  key        text        NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_inflight_key ON public.rate_inflight (key, expires_at);
ALTER TABLE public.rate_inflight ENABLE ROW LEVEL SECURITY;

-- Soma `p_cost` ao contador da janela atual e diz se ainda cabe no limite.
-- Janela fixa alinhada ao relógio do banco (o mesmo para todas as instâncias).
CREATE OR REPLACE FUNCTION public.rate_hit(p_key text, p_window_seconds integer, p_limit bigint, p_cost bigint DEFAULT 1)
RETURNS TABLE (allowed boolean, current bigint, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w_start timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  w_end   timestamptz := w_start + make_interval(secs => p_window_seconds);
  c bigint;
BEGIN
  IF p_window_seconds <= 0 OR p_cost < 0 THEN
    RAISE EXCEPTION 'parâmetros inválidos';
  END IF;
  INSERT INTO public.rate_counters AS rc (key, window_start, count, expires_at)
  VALUES (p_key, w_start, p_cost, w_end)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rc.count + EXCLUDED.count
  RETURNING rc.count INTO c;
  -- limpeza oportunista (barata: índice por expires_at)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_counters WHERE expires_at < now() - interval '1 hour';
    DELETE FROM public.rate_inflight WHERE expires_at < now();
  END IF;
  RETURN QUERY SELECT c <= p_limit, c, w_end;
END $$;

-- Lê o contador da janela atual sem somar.
CREATE OR REPLACE FUNCTION public.rate_peek(p_key text, p_window_seconds integer)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT count FROM public.rate_counters
    WHERE key = p_key
      AND window_start = to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds)), 0);
$$;

-- Reserva uma vaga de execução simultânea (com prazo: vaga esquecida expira sozinha).
CREATE OR REPLACE FUNCTION public.limit_acquire(p_key text, p_max integer, p_ttl_seconds integer, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n integer;
BEGIN
  -- serializa por chave: duas instâncias não passam do limite ao mesmo tempo
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  DELETE FROM public.rate_inflight WHERE key = p_key AND expires_at < now();
  SELECT count(*) INTO n FROM public.rate_inflight WHERE key = p_key;
  IF n >= p_max THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_inflight (id, key, expires_at) VALUES (p_id, p_key, now() + make_interval(secs => p_ttl_seconds));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.limit_release(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ DELETE FROM public.rate_inflight WHERE id = p_id; $$;

REVOKE ALL ON FUNCTION public.rate_hit(text, integer, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_peek(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limit_acquire(text, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limit_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_hit(text, integer, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_peek(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.limit_acquire(text, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.limit_release(uuid) TO service_role;
