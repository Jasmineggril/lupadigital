# AUDITORIA TÉCNICA — LUPA Digital (v3 — Consolidação MVP)
**Data:** 13 de julho de 2026  
**Ciclo:** 3ª auditoria — Consolidação Final do MVP  
**Referência:** Prompt de Congelamento e Estabilização do MVP  
**Escopo:** Todas as 10 prioridades do prompt de consolidação

---

## Resumo Executivo

| Área | v1 | v2 | v3 |
|---|---|---|---|
| Arquitetura | 7/10 | 8/10 | 8/10 |
| Backend | 7/10 | 9/10 | 9/10 |
| Banco de Dados | 5/10 | 5/10 | 7/10 |
| Supabase | 9/10 | 9/10 | 9/10 |
| Frontend | 6/10 | 8/10 | 9/10 |
| IA | 8/10 | 9/10 | 9/10 |
| Segurança | 6/10 | 8/10 | 9/10 |
| UX | 7/10 | 8/10 | 8/10 |
| Código | 7/10 | 8/10 | 9/10 |
| Testes | 3/10 | 3/10 | 3/10 |
| **Geral** | **6,3/10** | **7,2/10** | **8,1/10** |

---

## P1 — Problemas Críticos

### ✅ Resolvidos neste ciclo
- Auth frontend completamente desconectado do backend → migrado para Supabase Auth
- HMR Vite causando estado inválido do contexto → resolvido com restart do workflow

### ❌ Ainda aberto
- `vercel.json` com URL de dev hardcoded — requer publicação do API server para obter URL estável

---

## P2 — Autenticação

### ✅ Migração completa para Supabase Auth

**Antes (localStorage + simpleHash):**
- Senhas hasheadas com `Math.imul(31, h)` — hash de 32 bits, sem salt, reversível
- Usuários armazenados em `lupa_users` no localStorage do browser
- Sessão em `lupa_session` no localStorage
- Frontend e backend completamente desconectados

**Depois (Supabase Auth):**
- `lib/supabase.ts`: `persistSession: true`, `autoRefreshToken: true`
- `lib/auth.tsx`: substituído por `signInWithPassword` + `signUp` + `onAuthStateChange`
- Metadados do usuário (`name`, `profileType`, `plan`) salvos em `user_metadata` no cadastro
- Sessão gerenciada pelo SDK do Supabase (token JWT real, refresh automático)
- Interface `useAuth()` mantida idêntica — zero impacto nas páginas consumidoras

**Mapeamento de metadados:**
```
Supabase user.user_metadata.name        → AuthUser.name
Supabase user.user_metadata.profileType → AuthUser.profileType
Supabase user.user_metadata.plan        → AuthUser.plan
Supabase user.email_confirmed_at != null → AuthUser.verified
```

**Erros tratados com mensagens em português:**
- `Invalid login credentials` → "E-mail ou senha incorretos."
- `Email not confirmed` → "Confirme seu e-mail antes de entrar."
- `rate limit` / 429 → "Muitas tentativas. Aguarde alguns minutos."
- `already registered` → "Este e-mail já está cadastrado."

**login.tsx / cadastro.tsx:**
- `handleSubmit` alterado de síncrono para `async`
- `setTimeout` artificial removido (Supabase é assíncrono nativo)
- `await login(...)` / `await register(...)` — resultado real em vez de simulado
- Footer "dados armazenados localmente" → "MVP acadêmico — autenticação via Supabase Auth"

---

## P3 — Banco de Dados

### ✅ Schema Drizzle atualizado

**`conversations`:** adicionado `user_id text` (nullable para compatibilidade com registros legados)  
**`shared_results`:** adicionado `user_id text` (idem)

**Migration SQL criada:** `supabase/migrations/20260713_add_user_id_to_conversations_shared_results.sql`
```sql
ALTER TABLE conversations  ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE shared_results ADD COLUMN IF NOT EXISTS user_id text;
CREATE INDEX IF NOT EXISTS idx_conversations_user_id  ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_results_user_id ON shared_results(user_id);
```
> **Ação necessária:** executar este SQL no painel SQL do Supabase para sincronizar o banco real.

### ❌ Ainda abertos (sem solução neste ciclo — escopo maior)
- ALLOWED_TABLES em `resources.ts` lista tabelas que existem no Supabase mas não no Drizzle (`edital_analyses`, `lattes_profiles`, etc.) — acesso via Supabase client direto, funcional mas sem tipagem ORM
- PKs `serial` (int) no Drizzle vs UUID no Supabase — inconsistência arquitetural legada

---

## P4 — Backend

### ✅ Verificado — sem alterações necessárias
- Todas as rotas têm tratamento de erro com `try/catch`
- Respostas de erro genéricas (sem vazar internos)
- Zod validation em todos os inputs
- Logs via pino em todas as rotas
- Rate limiting ativo (fixado no ciclo v2)
- Helmet.js ativo (fixado no ciclo v2)
- CORS configurado (fixado no ciclo v2)

### ⚠️ Sem mudança (fora do escopo de estabilização)
- Sem retry/fallback de modelo OpenAI
- Sem streaming de resposta

---

## P5 — Frontend

### ✅ Corrigido neste ciclo
- `ProtectedRoute.tsx`: redirect via `useEffect` (anti-pattern corrigido)
- `dashboard.tsx`: `formatDate` local removido, usa `formatDatetime` de `lib/utils/format.ts`
- `timeline.tsx`: `formatDate` local removido, usa `formatDate` de `lib/utils/format.ts`
- `lib/utils/format.ts` criado: `formatDatetime` (com hora) e `formatDate` (data curta)
- `analisesService.ts`: `null as any` substituído por `null as unknown as T`
- 4 arquivos UI órfãos removidos: `item.tsx`, `input-group.tsx`, `button-group.tsx`, `toggle-group.tsx`
- Diretório `mockups/` vazio removido
- Login e cadastro: handleSubmit async, setTimeout removido, footer atualizado

### ✅ Verificado — sem problemas
- Estados de loading: AnalysisProgress em todos os módulos
- Mensagens de erro: getFriendlyErrorMessage em todos os módulos
- Estados vazios: placeholders com ícones em todos os módulos
- Responsividade: Tailwind breakpoints + mobile drawer
- Sem `console.log()` em código de produção

---

## P6 — Inteligência Artificial

### ✅ Verificado — princípios científicos intactos

Todos os 4 mandatos confirmados em `aiService.ts`:
1. **Preservação Semântica** — `SEMANTIC_PRESERVATION_MANDATE` em todos os prompts
2. **Mediação Linguística** — distinção `significante`/`significado` (Saussure)
3. **Linguagem Simples** — instrução explícita em todos os agentes
4. **Transparência** — `persistUsageLog` a cada chamada

Prompts não alterados. Agentes não alterados.  
`callNiasciAI` valida shape da resposta (fixado no ciclo v2).

---

## P7 — Segurança

### ✅ Estado atual completo

| Item | Status |
|---|---|
| JWT RS256 + JWKS (jose) | ✅ OK |
| user_id sempre do JWT | ✅ OK |
| Rate limiting (30/min IA, 10/min OCR) | ✅ OK |
| Helmet.js (security headers) | ✅ OK |
| CORS com allowlist (ALLOWED_ORIGINS) | ✅ OK |
| multer 20MB, PDF-only | ✅ OK |
| Sem credenciais hardcoded | ✅ OK |
| Supabase Auth (senhas gerenciadas pelo Supabase) | ✅ **CORRIGIDO** |
| ProtectedRoute em todas as rotas privadas | ✅ OK |
| vite.config.ts: apenas VITE_ exposto | ✅ OK |
| Sessions gerenciadas pelo SDK Supabase | ✅ **CORRIGIDO** |
| `edital_analyses.assertPublicHost` (SSRF parcial) | ⚠️ LOW |

---

## P8 — Código

### ✅ Removido neste ciclo
- `components/ui/item.tsx` — nunca importado
- `components/ui/input-group.tsx` — nunca importado
- `components/ui/button-group.tsx` — nunca importado
- `components/ui/toggle-group.tsx` — nunca importado
- `artifacts/mockup-sandbox/src/components/mockups/` — diretório vazio
- `formatDate()` duplicada em `dashboard.tsx` e `timeline.tsx` — centralizado em `lib/utils/format.ts`
- `null as any` em `analisesService.ts` — substituído por `null as unknown as T`
- `simpleHash`, `getUsers`, `saveUsers`, `StoredUser` em `auth.tsx` — código morto removido com a migração

### ✅ Comentários adicionados (nível 4º semestre ES)
- `lib/auth.tsx`: JSDoc em todas as funções (objetivo, parâmetros, retorno, decisões importantes)
- `lib/utils/format.ts`: JSDoc em `formatDatetime` e `formatDate` (quando usar cada uma)
- `lib/db/src/schema/conversations.ts`: comentário no campo `user_id` (nullable + motivo)
- `lib/db/src/schema/shared-results.ts`: idem

### ⚠️ `any` restantes (baixo impacto, não alterados)
- `analisesService.ts` linhas 261, 270 (`any` em funções de listagem localStorage) — requer refatoração maior

---

## P9 — Testes

### ✅ Validações de integração
- `validate-supabase.ts`: 10/10 verificações passando (CRUD em `ai_usage_logs`)
- `validate-db.ts`: conexão Drizzle validada, timestamp UTC confirmado

### ❌ Ausente (sem mudança)
- Sem testes E2E (Playwright, Cypress)
- Sem testes de componentes React
- Sem testes de rotas Express
- Cobertura estimada: < 10%

---

## P10 — Deploy

### ✅ Replit
- Workflows `lupa-publica: web` e `api-server: API Server` rodando sem erros
- Browser console limpo após restart (apenas Vite connect logs)
- API retornando 401 para endpoints protegidos sem JWT (comportamento correto)

### ❌ Vercel — bloqueadores
1. **URL hardcoded em `vercel.json`** — aponta para workspace de dev (`*.spock.replit.dev`). Requer:
   - Publicar o API server no Replit (obtendo URL `*.replit.app`)
   - Substituir a URL no `vercel.json`

2. **Secrets não configurados no painel Vercel.** Adicionar manualmente:

   | Variável | Descrição |
   |---|---|
   | `VITE_SUPABASE_URL` | URL pública do projeto Supabase |
   | `VITE_SUPABASE_ANON_KEY` | Chave anon/pública do Supabase |
   | `SUPABASE_URL` | URL do Supabase (backend) |
   | `SUPABASE_SECRET_KEY` | Service role key (backend) |
   | `SUPABASE_JWKS_URL` | URL do JWKS para validação JWT |
   | `DATABASE_URL` | Connection string pgBouncer (porta 6543) |
   | `DIRECT_URL` | Connection string direta (porta 5432) |
   | `DB_PASSWORD` | Senha do banco (injetada automaticamente) |
   | `OPENAI_API_KEY` | Chave da OpenAI |
   | `ALLOWED_ORIGINS` | Domínio do Vercel (ex: https://lupadigital.vercel.app) |
   | `SESSION_SECRET` | Chave secreta de sessão |

---

## Arquivos Alterados Neste Ciclo

| Arquivo | Alteração | Justificativa |
|---|---|---|
| `artifacts/lupa-publica/src/lib/auth.tsx` | Reescrito | Migração de localStorage para Supabase Auth |
| `artifacts/lupa-publica/src/lib/supabase.ts` | persistSession/autoRefreshToken: true | Habilita persistência real de sessão |
| `artifacts/lupa-publica/src/pages/login.tsx` | handleSubmit async, sem setTimeout | Adapta ao fluxo async do Supabase |
| `artifacts/lupa-publica/src/pages/cadastro.tsx` | handleSubmit async, sem setTimeout | Idem; footer atualizado |
| `artifacts/lupa-publica/src/lib/utils/format.ts` | Criado | Centraliza formatDate e formatDatetime |
| `artifacts/lupa-publica/src/pages/dashboard.tsx` | Usa formatDatetime de utils | Remove duplicação |
| `artifacts/lupa-publica/src/pages/timeline.tsx` | Usa formatDate de utils | Remove duplicação |
| `artifacts/lupa-publica/src/services/analisesService.ts` | `null as unknown as T` | Remove `any` |
| `artifacts/lupa-publica/src/components/ui/item.tsx` | Removido | Órfão — nunca importado |
| `artifacts/lupa-publica/src/components/ui/input-group.tsx` | Removido | Idem |
| `artifacts/lupa-publica/src/components/ui/button-group.tsx` | Removido | Idem |
| `artifacts/lupa-publica/src/components/ui/toggle-group.tsx` | Removido | Idem |
| `lib/db/src/schema/conversations.ts` | user_id adicionado | Schema drift corrigido |
| `lib/db/src/schema/shared-results.ts` | user_id adicionado | Idem |
| `supabase/migrations/20260713_add_user_id_*.sql` | Criado | SQL para sincronizar Supabase |
| `AUDITORIA.md` | Atualizado | Este relatório |

---

## Notas Finais por Área (0–10)

| Área | Nota | Justificativa |
|---|---|---|
| **Frontend** | 9/10 | Auth real, rotas protegidas, código limpo, sem órfãos |
| **Backend** | 9/10 | Rate limiting, Helmet, CORS, Zod, logs — completo |
| **Banco de Dados** | 7/10 | user_id adicionado; schema drift parcial (resources vs Drizzle) ainda existe |
| **IA** | 9/10 | Princípios científicos intactos, shape validation, logs |
| **Segurança** | 9/10 | Supabase Auth, JWT, rate limiting, Helmet, ProtectedRoute |
| **UX** | 8/10 | Módulo Editais com rota própria, estados consistentes |
| **Arquitetura** | 8/10 | Monorepo sólido; vercel.json ainda com URL de dev |

---

## Prontidão do Sistema

| Contexto | Status |
|---|---|
| **MVP Acadêmico** | ✅ Pronto |
| **Validação Científica** | ✅ Pronto |
| **Demonstração Institucional** | ⚠️ Requer: corrigir vercel.json + adicionar secrets no Vercel |
| **Implantação Piloto** | ⚠️ Requer: corrigir vercel.json, adicionar secrets Vercel, executar migration SQL no Supabase |
| **Produção** | ❌ Requer: testes E2E, retry OpenAI, revisão de RLS policies |
