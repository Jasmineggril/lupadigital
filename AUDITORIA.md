# AUDITORIA TÉCNICA — LUPA Digital
**Data:** 13 de julho de 2026  
**Escopo:** MVP completo — Frontend, Backend, Banco, IA, Segurança, Performance, UX, Arquitetura  
**Objetivo:** Validação pré-publicação e pré-validação científica

---

## 1. ARQUITETURA — 7/10

### ✅ Funcionando
- Monorepo pnpm bem estruturado: `artifacts/`, `lib/`, `scripts/`
- Separação clara: frontend (React/Vite), backend (Express), lib compartilhada (Drizzle, OpenAI, Zod)
- Todos os 23 arquivos de página existem e têm rotas correspondentes em `App.tsx`
- Módulos e-Lattes, Artigos, Projetos, Planetário e Assistente: implementados com UI real, tabs, API integration
- Variáveis de ambiente corretamente separadas: apenas `VITE_` expostas ao frontend

### ❌ Bugs / Inconsistências
- **`vercel.json` tem URL de desenvolvimento hardcoded** para proxy da API:  
  `https://27c9e4ab-...spock.replit.dev/api/:path*`  
  Esta é a URL da workspace de desenvolvimento — não funciona em produção após reinício do Repl. Deve apontar para a URL de deploy estável.

### ⚠️ Melhorias
- `/testar` e `/historico` mapeiam para o mesmo componente `TestarIA` — redundância de rota sem propósito claro
- Diretório `middlewares/` existe mas está vazio — middleware está inline em `app.ts` e nas rotas
- Módulo Editais não tem página dedicada `/niasci/editais` — usa `/testar` (ver seção Frontend)

---

## 2. BANCO DE DADOS — 5/10

### ✅ Funcionando
- 5 tabelas no Drizzle: `agent_results`, `conversations`, `messages`, `saved_editals`, `shared_results`
- FK: `messages.conversation_id → conversations.id` presente
- `saved_editals` tem `user_id` para isolamento de dados
- Conexão validada: `SELECT current_database()` ok, CRUD em `ai_usage_logs` ok (10/10 no script)

### ❌ Bugs / Inconsistências
- **`edital_analyses` referenciada em `resources.ts` (linha 12 e 87) mas NÃO existe no schema Drizzle.**  
  Existe apenas como tabela direta no Supabase — schema drift confirmado.
- **Conflito de nomenclatura:**  
  - `edital_analyses` → usado no código atual (inglês)  
  - `edital_analises` → aparece no backup de migração `supabase-schema.sql` (português)  
  Deve ser padronizado em toda a base.
- **PKs são `serial` (integer) em todas as tabelas Drizzle**, não UUID. O Supabase usa UUID nas tabelas gerenciadas por ele (`ai_usage_logs`, `edital_analyses`). Inconsistência de tipos de PK entre as duas camadas.
- **`conversations` não tem `user_id`** — conversas não são escopadas por usuário no Drizzle schema, apenas `messages` indiretamente.
- **`shared_results` não tem `user_id`** — resultados compartilhados não rastreiam o autor.

### ⚠️ Melhorias
- Nenhum índice explícito definido no schema Drizzle (além de PKs e unique constraints)
- `agent_results.created_at` não tem `DEFAULT now()` explícito no schema

---

## 3. SUPABASE — 9/10

### ✅ Funcionando
- Todas as variáveis configuradas: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DIRECT_URL`, `DB_PASSWORD`
- JWKS configurado: `SUPABASE_JWKS_URL` presente
- 10/10 verificações do script `validate-supabase.ts` passando
- CRUD completo em `ai_usage_logs` funcionando
- Chaves distintas (service_role ≠ anon_key): confirmado
- `vite.config.ts` expõe apenas `VITE_` prefix — `SUPABASE_SECRET_KEY` não vaza para o bundle

### ⚠️ Avisos
- RLS retorna 0 linhas sem JWT (comportamento correto, mas verificar se as políticas estão documentadas)
- `edital_analyses` existe no Supabase mas não no Drizzle (ver seção Banco)

---

## 4. BACKEND — 7/10

### ✅ Funcionando
- JWT validado via `jose` + RS256 + JWKS: correto
- `user_id` sempre extraído do JWT verificado (`getReqUserId(req)`) — nunca confiado do body
- Zod validation em todos os inputs de POST/PATCH (editais, resources, niasci)
- HTTP status codes corretos: 400 (validação), 401 (auth), 404 (not found), 500 (server)
- multer: 20MB limit, PDF-only fileFilter
- Logs via pino com contexto estruturado
- Usage logging a cada chamada de IA (ai_usage_logs)
- Agentes: simples, analista, estrategica, acompanhamento, documentacao, elegibilidade

### ❌ Bugs / Inconsistências
- **Sem rate limiting** em nenhum endpoint. Os endpoints `/edital/ocr-pdf`, `/edital/analisar`, `/niasci/*` chamam OpenAI sem proteção — vulneráveis a DoS e esgotamento de cota/custo.
- **`callNiasciAI` (módulos NIASci) não tem validação Zod na resposta da IA** — apenas no edital path via `analyzeAgent`. Schema drift pode ocorrer silenciosamente.

### ⚠️ Melhorias
- CORS: `app.use(cors())` sem configuração de origin — aceita qualquer domínio. Deve restringir ao domínio de produção.
- Sem retry/fallback se OpenAI retornar 429 ou 500 — a request falha imediatamente.
- Algumas mensagens de erro retornam `error.message` diretamente ao cliente (pode vazar paths internos ou nomes de biblioteca).
- Sem graceful shutdown (SIGTERM handler) no servidor Express.

---

## 5. FRONTEND — 6/10

### ✅ Funcionando
- 23 rotas definidas com 23 arquivos de página correspondentes
- Módulos implementados com loading states (`AnalysisProgress`), error states (toast + `getFriendlyErrorMessage`), empty states
- Responsivo: Tailwind breakpoints (`md:flex`, `md:hidden`), mobile drawer, hook `use-mobile.tsx`
- API base URL derivada de `import.meta.env.BASE_URL` — sem hardcode de localhost no código de produção
- Componentes shadcn/Radix para acessibilidade básica

### ❌ Bugs / Inconsistências
- **Módulo Editais não tem página dedicada.** O link "Editais" na navbar aponta para `/testar` (componente genérico `TestarIA`), não para um módulo NIASci específico com os 6 agentes. O módulo mais importante da plataforma está sem identidade própria no frontend.
- **Sem `<ProtectedRoute>` wrapper.** Rotas como `/dashboard` são acessíveis por URL direta mesmo sem login. A proteção é feita dentro de cada componente — inconsistente e frágil.

### ⚠️ Melhorias
- Sessões Supabase armazenadas em `localStorage` (padrão do SDK) — não usa httpOnly cookies; vulnerável a XSS que extrai tokens
- Ocorrências de `any` em TypeScript: `analisesService.ts` e `niasci-utils.tsx`
- Sem lazy loading de rotas — todo o bundle carrega no first load
- Sem `<Suspense>` boundaries para code splitting

---

## 6. FLUXO DOS MÓDULOS — 7/10

### ✅ Funcionando
- **Editais** (via `/testar`): texto, URL, PDF, OCR, IA, 6 agentes, abas de resultado, histórico, exportação — funcionando
- **e-Lattes**: upload PDF, resumo executivo, linha do tempo, competências, produção científica, áreas, sugestões de editais — implementado
- **Artigos**: upload, resumo, metodologia, resultados, referências, citações — implementado
- **Projetos**: criação, edição, cronograma, equipe, objetivos, status — implementado
- **Planetário**: criação de conteúdo, roteiros, perguntas, linguagem simples — implementado
- **Assistente IA**: conversa contextual, histórico de mensagens — implementado

### ❌ Inconsistências
- **Editais não tem rota própria `/niasci/editais`** — o módulo central da plataforma está "escondido" em `/testar`
- Histórico em `/historico` e `/testar` são o mesmo componente (redundante)

### ⚠️ Melhorias
- Exportação: verificar formatos disponíveis (PDF, Word, JSON?)
- Chat contextual dos Editais: verificar se o contexto do documento é mantido entre mensagens
- Persistência do Assistente IA: verificar se o histórico sobrevive a reload de página

---

## 7. INTELIGÊNCIA ARTIFICIAL — 8/10

### ✅ Funcionando
- 6 agentes Editais com `SEMANTIC_PRESERVATION_MANDATE` injetado em todos os prompts
- Instrução explícita de distinção `significante` / `significado` (fundamento de Saussure)
- Validação Zod da resposta para cada agente (path `analyzeAgent`)
- Tratamento de JSON inválido com logs de erro
- Truncamento de input: 12.000 chars (editais) / 14.000 chars (NIASci)
- OCR via GPT-4o Vision em lotes de 8 páginas
- `max_completion_tokens: 4096` definido
- Logs de uso salvos: userId, latência, tokens, modelo, módulo, sucesso/erro

### ❌ Inconsistências
- **`callNiasciAI` (e-Lattes, Artigos, Projetos, Planetário, Assistente) não valida a resposta da IA com Zod** — apenas tenta `JSON.parse`. Se a IA retornar JSON com schema diferente, o erro pode ser silencioso.
- **Sem fallback de modelo** — se `gpt-4o` retornar 429 ou 500, a request falha sem tentar `gpt-4o-mini`.

### ⚠️ Melhorias
- Sem retry automático (1-2 tentativas com backoff exponencial recomendadas)
- Sem streaming de resposta — usuário espera até a resposta completa chegar
- Sem cache de resultados — mesmo documento processado múltiplas vezes gera novas chamadas à OpenAI

---

## 8. SEGURANÇA — 6/10

| Item | Status | Severidade |
|---|---|---|
| JWT via jose + RS256 + JWKS | ✅ OK | — |
| user_id sempre do JWT, nunca do body | ✅ OK | — |
| Multer: 20MB, PDF-only | ✅ OK | — |
| Sem credenciais hardcoded | ✅ OK | — |
| Drizzle ORM (SQL injection protegido) | ✅ OK | — |
| vite.config.ts: apenas VITE_ exposto | ✅ OK | — |
| Rate limiting | ❌ AUSENTE | 🔴 HIGH |
| CORS irrestrito (all origins) | ⚠️ PARCIAL | 🟡 MEDIUM |
| Sessions em localStorage | ⚠️ RISCO | 🟡 MEDIUM |
| XSS: sem helmet.js | ⚠️ RISCO | 🟡 MEDIUM |
| Sem ProtectedRoute no router | ⚠️ RISCO | 🟡 MEDIUM |
| Error messages podem vazar internals | ⚠️ RISCO | 🟡 MEDIUM |
| HTTPS: delegado ao Vercel/Replit | ✅ OK (implícito) | — |

---

## 9. PERFORMANCE — 5/10

### ✅ Funcionando
- Truncamento de texto evita payloads gigantes para a OpenAI
- Pino (JSON logger) de alta performance no backend

### ⚠️ Melhorias Recomendadas
- Sem cache de resultados de IA (Redis, in-memory ou Supabase)
- Sem lazy loading de rotas no React (bundle único)
- Sem paginação visível nos históricos de análise
- Sem `React.memo` ou `useMemo` documentados nos componentes pesados
- Queries Drizzle sem índices explícitos → potencial lentidão com volume

---

## 10. UX — 7/10

### ✅ Funcionando
- Loading states animados (`AnalysisProgress`) em todos os módulos
- Mensagens de erro amigáveis (`getFriendlyErrorMessage`)
- Empty states com ícones e instruções
- Design responsivo (mobile drawer funcional)
- Identidade visual consistente entre módulos

### ⚠️ Melhorias
- Editais não tem página própria — UX inconsistente (módulo principal escondido)
- Sem feedback de progresso incremental na análise (streaming)
- Sem onboarding/tutorial para novos usuários
- Acessibilidade: Radix UI cobre básico, mas falta auditoria ARIA completa

---

## 11. CÓDIGO — 7/10

### ✅ Funcionando
- Sem `console.log` em código de produção
- Sem credenciais hardcoded
- Sem TODO/FIXME no código principal (apenas em `semanticPreservation.test.ts`)
- Estrutura de arquivos organizada e previsível

### ⚠️ Problemas Encontrados
- TypeScript `any` em `analisesService.ts` e `niasci-utils.tsx`
- Diretório `middlewares/` vazio (sem uso)
- `/testar` e `/historico` mapeiam para o mesmo componente (código duplicado desnecessário)
- `edital_analyses` referenciado como string literal em `resources.ts` (sem type safety)

---

## 12. PRODUÇÃO — 6/10

### ✅ Funcionando
- Build local passa sem erros
- Supabase: 10/10 testes passando
- Drizzle: conexão validada com sucesso
- Secrets todos configurados no Replit
- vercel.json com outputDirectory, buildCommand e SPA rewrite corretos

### ❌ Bloqueadores para Produção
- **`vercel.json` tem URL de dev hardcoded no proxy da API** → qualquer restart do Repl quebra a produção
- **Secrets do Vercel não configurados** — o deploy no Vercel não tem as variáveis de ambiente necessárias para funcionar (precisam ser adicionadas manualmente no painel Vercel)

### ⚠️ Atenção
- O DIRECT_URL está apontando para o pooler Supabase (Session mode, porta 5432) — compatível com Drizzle
- O banco `edital_analyses` existe no Supabase mas não está no schema Drizzle — se o Vercel usar Drizzle para acessar essa tabela, vai falhar

---

## 13. TESTES — 3/10

### ✅ Funcionando
- `semanticPreservation.test.ts`: testes unitários existem para o núcleo de preservação semântica
- Scripts de validação: `validate-supabase.ts` e `validate-db.ts` cobrem integração

### ❌ Ausente
- Sem testes E2E (Playwright, Cypress)
- Sem testes de integração para as rotas Express
- Sem testes dos componentes React
- Cobertura de testes: estimada < 10% do código total

---

## 14. RELATÓRIO FINAL

### Notas por Área

| Área | Nota | Status |
|---|---|---|
| **Arquitetura** | 7/10 | ✅ Sólida, com 1 bug crítico (vercel.json) |
| **Backend** | 7/10 | ✅ Funcional, falta rate limiting |
| **Banco de Dados** | 5/10 | ⚠️ Schema drift, naming conflict, sem UUIDs |
| **Supabase** | 9/10 | ✅ Excelente, tudo validado |
| **Frontend** | 6/10 | ⚠️ Editais sem página própria, sem ProtectedRoute |
| **IA** | 8/10 | ✅ Bem implementada, falta Zod em callNiasciAI |
| **Segurança** | 6/10 | 🔴 Sem rate limiting, CORS aberto |
| **Performance** | 5/10 | ⚠️ Sem cache, sem lazy loading |
| **UX** | 7/10 | ✅ Boa, inconsistência no módulo Editais |
| **Código** | 7/10 | ✅ Limpo, alguns `any` e redundâncias |
| **Testes** | 3/10 | ❌ Cobertura muito baixa |
| **Produção** | 6/10 | ⚠️ Bloqueadores identificados |

### **Nota Geral do MVP: 6,3 / 10**

---

### Prontidão para cada contexto

| Contexto | Pronto? | Condição |
|---|---|---|
| **MVP Interno** | ✅ SIM | Sistema funciona end-to-end para uso controlado |
| **Validação Científica** | ⚠️ PARCIAL | Funciona, mas falta página dedicada de Editais e logs mais detalhados |
| **Demonstração Institucional** | ⚠️ PARCIAL | Corrigir vercel.json e adicionar secrets no Vercel antes |
| **Produção** | ❌ NÃO | Rate limiting, CORS, ProtectedRoute, secrets Vercel são pré-requisitos |
| **Escalabilidade** | ❌ NÃO | Cache, lazy loading, índices de banco, retry de IA são necessários |

---

### Ações imediatas recomendadas (por prioridade)

**🔴 Crítico (bloqueadores)**
1. Corrigir `vercel.json` — substituir URL dev hardcoded pela URL de produção estável
2. Adicionar secrets no painel Vercel (DATABASE_URL, DB_PASSWORD, SUPABASE_*, VITE_*)
3. Implementar rate limiting nos endpoints de IA (`express-rate-limit`)

**🟡 Alto (antes de demo/publicação)**
4. Criar página dedicada `/niasci/editais` com identidade própria
5. Restringir CORS ao domínio de produção
6. Adicionar Zod validation na resposta de `callNiasciAI`
7. Implementar `<ProtectedRoute>` wrapper no router

**🟢 Médio (maturidade)**
8. Padronizar naming: `edital_analyses` em todo o código (remover `edital_analises`)
9. Sincronizar schema Drizzle com as tabelas reais do Supabase
10. Adicionar retry + fallback de modelo na OpenAI
11. Implementar lazy loading de rotas React
12. Corrigir TypeScript `any` restantes
