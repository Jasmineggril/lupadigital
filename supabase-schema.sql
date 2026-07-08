create table if not exists public.edital_analises (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  titulo text,
  conteudo_original text,
  conteudo_simplificado text,
  categoria text,
  modo_analise text,
  indicadores jsonb,
  timeline jsonb,
  recomendacoes jsonb,
  favorito boolean default false
);

alter table public.edital_analises enable row level security;
alter table public.edital_analises add column if not exists favorito boolean default false;

create policy "Permitir leitura publica MVP"
on public.edital_analises
for select
using (true);

create policy "Permitir insercao publica MVP"
on public.edital_analises
for insert
with check (true);

create policy "Permitir exclusao publica MVP"
on public.edital_analises
for delete
using (true);

-- AI usage logs for metrics and auditing
create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  module text not null,
  model text not null,
  agent_id text,
  user_id text,
  document_id text,
  latency_ms integer,
  success boolean default false,
  error_message text,
  tokens_used integer,
  meta jsonb
);

alter table public.ai_usage_logs enable row level security;
