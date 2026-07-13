---
name: MVP Freeze State
description: Estado pós-consolidação do MVP LUPA Digital — o que está pronto, o que falta para produção
---

## Regra
O MVP está congelado em escopo. Não criar novos módulos, telas ou agentes. Só corrigir bugs e melhorar estabilidade.

## Estado atual (pós auditoria v3 — 2026-07-13)
**Nota geral: 8,1/10**

Pronto para:
- MVP Acadêmico ✅
- Validação Científica ✅
- Demonstração Institucional (falta vercel.json + secrets Vercel) ⚠️
- Produção (falta testes E2E, retry OpenAI, migration SQL no Supabase) ❌

## Pendências para o Vercel funcionar
1. `vercel.json` tem URL de dev hardcoded (`*.spock.replit.dev`) — requer publicar API server no Replit para obter URL `*.replit.app` estável
2. Secrets no painel Vercel: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_JWKS_URL, DATABASE_URL, DIRECT_URL, DB_PASSWORD, OPENAI_API_KEY, ALLOWED_ORIGINS, SESSION_SECRET

## Migration SQL pendente no Supabase
Arquivo: `supabase/migrations/20260713_add_user_id_to_conversations_shared_results.sql`
Precisa ser executado manualmente no SQL Editor do Supabase.

## Por que
Consolidação do MVP registrada para manter histórico de decisões e evitar retrabalho em ciclos futuros.
