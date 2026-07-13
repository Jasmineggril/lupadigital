# AUDITORIA TÉCNICA — LUPA Digital (v2)
**Data:** 13 de julho de 2026  
**Ciclo:** 2ª auditoria — pós-correções  
**Escopo:** MVP completo — Frontend, Backend, Banco, IA, Segurança, Performance, UX, Arquitetura

---

## Comparativo de Evolução

| Área | Auditoria 1 | Auditoria 2 | Δ |
|---|---|---|---|
| Arquitetura | 7/10 | 8/10 | +1 |
| Backend | 7/10 | 9/10 | +2 |
| Banco de Dados | 5/10 | 5/10 | = |
| Supabase | 9/10 | 9/10 | = |
| Frontend | 6/10 | 8/10 | +2 |
| IA | 8/10 | 9/10 | +1 |
| Segurança | 6/10 | 8/10 | +2 |
| Performance | 5/10 | 5/10 | = |
| UX | 7/10 | 8/10 | +1 |
| Código | 7/10 | 8/10 | +1 |
| Testes | 3/10 | 3/10 | = |
| Produção | 6/10 | 6/10 | = |
| **Geral** | **6,3/10** | **7,2/10** | **+0,9** |

---

## 1. ARQUITETURA — 8/10

### ✅ Corrigido desde a v1
- **Rota `/niasci/editais` criada** — módulo Editais tem página e rota dedicadas (`pages/editais.tsx`)
- **Navbar corrigida** — link "Editais" aponta para `/niasci/editais`
- **`ProtectedRoute` implementado** — componente com `useEffect` para redirect (anti-pattern corrigido após detecção na v2)
- **`/dashboard` e `/timeline` protegidos** com `ProtectedRoute`
- **Todos os módulos NIASci protegidos**: `/niasci/editais`, `/niasci/elattes`, `/niasci/artigos`, `/niasci/projetos`, `/niasci/planetario`, `/niasci/assistente` — todos exigem login

### ❌ Ainda aberto
- **`vercel.json` com URL dev hardcoded** — `*.spock.replit.dev` ainda presente; só pode ser corrigido após publicar o API server no Replit e obter URL `*.replit.app` estável

### ⚠️ Melhorias menores
- `/testar` e `/historico` ainda mapeiam para o mesmo componente `TestarIA` (sem propósito claro para a rota `/historico`)
- Diretório `middlewares/` continua vazio

---

## 2. BANCO DE DADOS — 5/10

### ✅ Sem mudança (sem intervenção nesse ciclo)

### ❌ Ainda abertos
- **`edital_analyses` e outras 7 tabelas do `ALLOWED_TABLES` não existem no Drizzle schema** — a API de resources acessa o Supabase diretamente via client, ignorando o ORM. Não é bug funcional, mas é um risco de manutenção grave: se o schema do Supabase mudar, não há tipagem que detecte o problema.
- **`conversations` sem `user_id`** — conversas não são escopadas por usuário no Drizzle
- **`shared_results` sem `user_id`** — resultados compartilhados não rastreiam o autor
- **PKs `serial` (int) no Drizzle vs UUID no Supabase** — duas convenções de PK em paralelo

### ⚠️ Nomenclatura
- `edital_analyses` (inglês) é o nome consolidado no código atual — o backup `edital_analises` (português) existe apenas em documentação legada e pode ser ignorado

---

## 3. SUPABASE — 9/10 (sem mudança)

- 10/10 verificações passando
- Todas as secrets configuradas
- CRUD validado
- `vite.config.ts` não expõe chaves sensíveis

---

## 4. BACKEND — 9/10

### ✅ Corrigido desde a v1
- **Rate limiting ativo** (`express-rate-limit`):
  - Geral: 120 req/min por IP
  - Endpoints de IA (`/analyze`, `/simplify`, `/extract-url`, `/niasci/*`): 30 req/min
  - OCR (`/edital/ocr-pdf`): 10 req/min
- **CORS restrito** — `corsOptions` com `ALLOWED_ORIGINS` env var; em produção exige allowlist explícita
- **`helmet.js` instalado e ativo** — headers de segurança padrão aplicados (`X-Frame-Options`, `X-Content-Type-Options`, CSP, etc.)
- **`callNiasciAI` com validação de shape** — JSON parse protegido; valida que resposta é objeto não-nulo/não-array; erro explícito se inválido

### ⚠️ Ainda abertas (baixa prioridade)
- Sem retry/fallback de modelo OpenAI (se `gpt-4o` retornar 429/500, request falha)
- SSRF: `assertPublicHost` bloqueia IPs privados mas não metadados de cloud (169.254.x.x tratado?)
- JSON body limit em 10MB para todas as rotas — poderia ser menor em rotas que não precisam de payloads grandes

---

## 5. FRONTEND — 8/10

### ✅ Corrigido desde a v1
- **`ProtectedRoute.tsx`** — implementado com `useEffect` para redirect (sem setState durante render)
- **Todos os módulos NIASci protegidos** — `/niasci/editais`, `/niasci/elattes`, `/niasci/artigos`, `/niasci/projetos`, `/niasci/planetario`, `/niasci/assistente` exigem autenticação
- **`/dashboard` e `/timeline` protegidos**
- **Módulo Editais com rota própria** — `/niasci/editais` com `pages/editais.tsx`

### ❌ Ainda abertos
- **Auth system é local (localStorage + simpleHash)** — não integra com o Supabase Auth real. O frontend e o backend têm sistemas de autenticação completamente desconectados:
  - Frontend: usuários registrados só em localStorage, senha com hash de 31 bits (inseguro)
  - Backend: valida JWT RS256 via JWKS do Supabase — JWTs que o frontend nunca gera
  - Consequência: endpoints autenticados no backend são inacessíveis pelo frontend atual
- **`/testar` sem proteção** — rota de análise de editais é pública, sem login

### ⚠️ Melhorias menores
- Sem lazy loading de rotas (bundle único)
- TypeScript `any` em `analisesService.ts` e `niasci-utils.tsx`

---

## 6. AUTENTICAÇÃO — 3/10 ⚠️ CRÍTICO

> **Esta é a inconsistência arquitetural mais grave do projeto.**

### Estado atual
- **Frontend** usa `lib/auth.tsx` com:
  - Armazenamento em `localStorage`
  - Hash de senha com `Math.imul(31, h)` (inseguro — 32-bit hash simples, reversível)
  - Sem integração Supabase
- **Backend** usa `supabaseAuthMiddleware()` com:
  - `jose` + JWKS + RS256 para validar JWTs do Supabase Auth
  - `user_id` extraído do `payload.sub` do JWT
- **Resultado:** o frontend nunca envia um JWT válido — os endpoints protegidos do backend (`requireAuth`) são funcionalmente inacessíveis pelo frontend de produção

### Por que isso ainda funciona?
- Os módulos NIASci **não exigem autenticação no backend** (rotas em `niasci.ts` ficam antes do `requireAuth()` do `resourcesRouter`)
- Apenas as rotas de `resources.ts` exigem JWT — mas `resources.ts` acessa tabelas como `edital_analyses`, `ai_analyses` etc. que não são acessadas pelo frontend principal
- O `TestarIA`/`EditaisPage` usa o Supabase client diretamente para salvar histórico (não via API backend autenticada)

### O que precisa ser feito (fora do escopo desta auditoria de correções)
- Substituir `lib/auth.tsx` por autenticação real via Supabase Auth (email/password + sessão JWT)
- Ou: converter as rotas de IA para aceitar autenticação opcional (userId `null` quando não logado)

---

## 7. INTELIGÊNCIA ARTIFICIAL — 9/10

### ✅ Corrigido desde a v1
- **`callNiasciAI` valida shape da resposta** — JSON parse com verificação de tipo; erro explícito se inválido

### ✅ Mantido desde v1
- SEMANTIC_PRESERVATION_MANDATE em todos os prompts
- 6 agentes com Zod validation na rota de editais
- OCR via GPT-4o Vision, 8 páginas por batch
- Truncamento de input (12k/14k chars)
- Logs de uso no Supabase

### ⚠️ Ainda abertas
- Sem retry/fallback de modelo
- Sem streaming de resposta
- Sem cache de resultados

---

## 8. SEGURANÇA — 8/10

| Item | Status | Severidade |
|---|---|---|
| JWT via jose + RS256 + JWKS | ✅ OK | — |
| user_id sempre do JWT, nunca do body | ✅ OK | — |
| Multer: 20MB, PDF-only | ✅ OK | — |
| Sem credenciais hardcoded | ✅ OK | — |
| Drizzle ORM (SQL injection protegido) | ✅ OK | — |
| vite.config.ts: apenas VITE_ exposto | ✅ OK | — |
| **Rate limiting** | ✅ **CORRIGIDO** | — |
| **CORS com allowlist** | ✅ **CORRIGIDO** | — |
| **Helmet.js (security headers)** | ✅ **CORRIGIDO** | — |
| **ProtectedRoute no router** | ✅ **CORRIGIDO** | — |
| **callNiasciAI validado** | ✅ **CORRIGIDO** | — |
| Error messages genéricas | ✅ OK | — |
| Auth local (localStorage + hash fraco) | ❌ ABERTO | 🔴 CRÍTICO |
| Sessions em localStorage | ⚠️ RISCO | 🟡 MEDIUM |
| SSRF parcial (sem bloquear 169.254.x.x) | ⚠️ RISCO | 🟡 LOW |

---

## 9. PERFORMANCE — 5/10 (sem mudança)

- Sem cache de resultados de IA
- Sem lazy loading de rotas React
- Sem paginação nos históricos
- Queries Drizzle sem índices explícitos

---

## 10. TESTES — 3/10 (sem mudança)

- `semanticPreservation.test.ts` e scripts de validação: únicos testes
- Sem testes E2E, de integração ou de componentes React
- Cobertura estimada: < 10%

---

## 11. PRODUÇÃO — 6/10 (sem mudança)

### ❌ Bloqueadores
- `vercel.json` com URL dev hardcoded — requer publicar o API server no Replit primeiro
- Secrets do Vercel não configurados

---

## 12. RELATÓRIO FINAL

### Nota Geral: **7,2 / 10** (era 6,3)

### O que foi corrigido neste ciclo (9 itens)
1. ✅ Rate limiting — 3 níveis (geral, IA, OCR)
2. ✅ CORS restrito por allowlist de origem
3. ✅ Helmet.js — headers de segurança HTTP
4. ✅ ProtectedRoute — wrapper com useEffect (sem anti-pattern)
5. ✅ Rotas NIASci protegidas (/editais, /elattes, /artigos, /projetos, /planetario, /assistente)
6. ✅ /dashboard e /timeline protegidos
7. ✅ Módulo Editais com rota e página próprias (/niasci/editais)
8. ✅ Navbar: link Editais atualizado para /niasci/editais
9. ✅ callNiasciAI: validação de shape na resposta da IA

### O que ainda está aberto (por prioridade)

**🔴 CRÍTICO**
1. **Auth desconectado** — frontend usa localStorage; backend valida JWT Supabase; os dois sistemas nunca se comunicam. Requer integração real com Supabase Auth.
2. **`vercel.json` URL hardcoded** — precisa da URL de produção do API server

**🟡 ALTO**
3. **Secrets no painel Vercel** — sem configuração manual, o deploy falha
4. **Schema drift banco** — `edital_analyses` e 7 outras tabelas não estão no Drizzle; sem tipagem, mudanças no Supabase são invisíveis para o ORM

**🟢 MÉDIO**
5. `conversations` e `shared_results` sem `user_id`
6. Sem retry/fallback de modelo OpenAI
7. `/testar` público (acesso sem login)
8. Sem lazy loading de rotas React

### Prontidão para cada contexto

| Contexto | v1 | v2 |
|---|---|---|
| MVP Interno | ✅ | ✅ |
| Validação Científica | ⚠️ | ✅ (melhorado) |
| Demonstração Institucional | ⚠️ | ⚠️ (ainda precisa de vercel.json + secrets) |
| Produção | ❌ | ❌ (auth desconectado é bloqueador) |
| Escalabilidade | ❌ | ❌ |
