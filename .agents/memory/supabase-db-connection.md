---
name: Supabase DB connection setup
description: Como a conexão Drizzle/PostgreSQL com Supabase está configurada e os problemas que foram resolvidos
---

## Configuração final

- `DATABASE_URL` — URL do pooler Supabase, porta 6543, pgbouncer=true (Transaction mode)
- `DIRECT_URL` — URL do pooler Supabase, porta 5432 (Session mode)
- `DB_PASSWORD` — **apenas a senha** (sem URL, sem aspas). O código injeta automaticamente.

## Problema resolvido: injeção automática de senha

`lib/db/src/index.ts` tem `resolveConnectionString()` que:
1. Normaliza DATABASE_URL/DIRECT_URL removendo prefixo `KEY=` e aspas envolventes (erro comum ao copiar .env)
2. Se `DB_PASSWORD` estiver definido, substitui a senha na URL via `injectPassword()` (remove colchetes [] se presentes)

**Why:** usuário consistentemente colava `DATABASE_URL="postgresql://..."` no campo do secret, causando "unmatched quotation mark" no shell do workflow. A separação senha/URL elimina o problema.

## Scripts de validação

- `artifacts/api-server/src/scripts/validate-supabase.ts` — testa Supabase JS (auth, CRUD em ai_usage_logs, RLS)
- `artifacts/api-server/src/scripts/validate-db.ts` — testa Drizzle/PostgreSQL diretamente

Como executar (sem tsx no PATH padrão):
```
NODE=/nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin/node
$NODE /home/runner/workspace/node_modules/.pnpm/tsx@4.23.0/node_modules/tsx/dist/cli.mjs <script>
```

## Schema ai_usage_logs

Colunas reais (sem `agent_id` — esse campo só vai pro logContext local do pino, não para o Supabase):
`module, model, user_id, document_id, latency_ms, success, error_message, input_tokens, output_tokens, total_tokens`

## RLS

Aviso "0 linhas sem JWT" = comportamento correto. RLS está bloqueando anon sem autenticação.
