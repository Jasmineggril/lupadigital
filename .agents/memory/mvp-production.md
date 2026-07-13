---
name: MVP Production State
description: Estado atual do MVP LUPA Digital em produção — URLs, commits, o que foi feito e o que ainda falta
---

## Estado pós-deploy (2026-07-13)

### Deploy Vercel
- **URL produção**: https://lupa-digital.vercel.app
- **Projeto ID**: prj_En5pRsrckEQUf6WK6Nb0f7DEJxGM
- **Team ID**: team_vmCmcK0fEXef6kFPc3f6Qvtp
- **Root dir**: artifacts/lupa-publica
- **Deploy ID**: dpl_6fdb7QZngH1H8yJ4SfQJcX7qPJNA (State: READY)
- Auto-deploy via GitHub push na branch `main`

### GitHub
- **Repo**: Jasmineggril/lupadigital
- **Commit atual**: 247f4db (main)
- **Nota**: token GitHub sem scope `workflow` — .github/workflows/supabase-migrate.yml está apenas LOCAL, não pusheado

### Auditoria técnica — Concluída
- Rate limiting (3 níveis: 120/min geral, 30/min IA, 10/min OCR)
- Helmet.js + CORS allowlist (ALLOWED_ORIGINS)
- ProtectedRoute com useEffect (sem setState durante render)
- handleSubmit async em login.tsx e cadastro.tsx
- null as unknown as T em analisesService.ts
- lib/utils/format.ts criado (formatDatetime, formatDate)
- JSDoc estilo 4º semestre ES em TODOS os arquivos críticos

### Arquivos com JSDoc completo
**Frontend**: agents.ts, analisesService.ts, pdf.ts, niasci-utils.tsx, navbar.tsx, testar.tsx, App.tsx, ProtectedRoute.tsx, auth.tsx, supabase.ts, login.tsx, cadastro.tsx, dashboard.tsx, timeline.tsx, format.ts
**Backend**: app.ts, aiService.ts, semanticPreservation.ts, supabase.ts, routes/index.ts, routes/edital.ts, routes/resources.ts, routes/niasci.ts
**DB**: schema/agent-results.ts, schema/messages.ts, schema/saved-editals.ts, schema/conversations.ts, schema/shared-results.ts

### Pendências para o usuário (não automatizáveis)
1. **Secrets Vercel** — adicionar no painel Vercel: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
2. **Migration SQL** — executar supabase/migrations/20260713_add_user_id_*.sql no SQL Editor do Supabase
3. **Workflow GitHub** — .github/workflows/supabase-migrate.yml está local; precisa de token com scope `workflow` para pushar
4. **API server em produção** — vercel.json aponta para URL dev do Replit; publicar o API server no Replit Deployments para obter URL *.replit.app estável, depois atualizar vercel.json

**Why:** Secrets Vercel e migration SQL são bloqueantes para funcionar em produção. A URL da API no vercel.json precisa ser atualizada após publicar o backend.
