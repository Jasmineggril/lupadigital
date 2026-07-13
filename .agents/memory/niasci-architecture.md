---
name: NIASci Architecture Decisions
description: Padrões arquiteturais adotados para elevar os módulos NIASci ao nível do módulo Editais
---

## Regra fundamental: ordem dos routers no index.ts

`niasciRouter` DEVE ficar ANTES do `resourcesRouter`. O `resourcesRouter` tem
`router.use(requireAuth())` global que bloqueia qualquer rota montada depois dele.

**Why:** Rotas NIASci são públicas (sem autenticação) e devem ser processadas antes do
middleware de auth do resources.

**How to apply:** Sempre que adicionar novos routers sem auth, montá-los antes do resourcesRouter.

## AIService — chamadas NIASci

Novas funções adicionadas ao final de `artifacts/api-server/src/lib/aiService.ts`:
- `analyzeLattes(text, opts)` → análise de currículo Lattes
- `analyzeArtigo(text, opts)` → análise de artigo científico (IMRaD)
- `analyzeProject(description, opts)` → plano de projeto de pesquisa
- `generatePlanetario(topic, audience, opts)` → conteúdo educativo
- `chatNiasci(messages, context?, opts)` → chat científico

Todas usam `callNiasciAI()` utilitário interno com `response_format: { type: "json_object" }`.

**Why:** JSON mode evita falhas de parse. Padrão consistente com logging via `persistUsageLog`.

## Shared utilities — niasci-utils.tsx

`artifacts/lupa-publica/src/lib/niasci-utils.tsx` centraliza:
- `NiasciHeader` — breadcrumb + título (padrão visual igual para todos os módulos)
- `AnalysisProgress` — indicador de estágios (idle→reading→extracting→finalizing→completed|error)
- `HistoryPanel` — painel colapsável de histórico com delete
- `InputSection` — upload PDF + textarea + botão de análise
- `ExportButton` — download como .txt (sem dependência jsPDF)
- `getFriendlyErrorMessage` — traduz erros técnicos
- `API_BASE` — URL base da API resolvida pelo Vite

**Why:** Reutilização garante que todos os módulos tenham o mesmo comportamento e aparência.

## analisesService.ts — funções de listagem adicionadas

Adicionadas em `artifacts/lupa-publica/src/services/analisesService.ts`:
- `listArticleAnalyses()` / `deleteArticleAnalysis(id)`
- `listResearchProjects()` / `deleteResearchProject(id)`
- `listPlanetariumContents()` / `deletePlanetariumContent(id)`
- `listChatMessages(conversationId?)` (lista por ID de conversa)
- `deleteLattesProfile(id)` (faltava a função de deleção)

## Padrão de persistência dos módulos NIASci

Cada módulo salva resultados no campo `metadata.result` do registro Supabase.
Para restaurar do histórico: `(item.metadata as any)?.result`.

**Why:** Reutiliza tabelas existentes (lattes_profiles, article_analyses, etc.) sem precisar
de schema novo. Supabase preferido quando autenticado, localStorage como fallback.

## Assistente IA — rota

Adicionada em `App.tsx`: `<Route path="/niasci/assistente" component={Assistente} />`
Arquivo: `artifacts/lupa-publica/src/pages/assistente.tsx`
Link no hub atualizado em `niasci.tsx`: `href: "/niasci/assistente"`
