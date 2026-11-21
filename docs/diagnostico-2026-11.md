# Diagnóstico inicial — evolução integrada (novembro de 2026)

**Base avaliada:** branch `claude/magical-brown-cmd7a7`, iniciada a partir de `main` em `346679a` (PR #18 mesclado).
Produção de referência: `https://lupa-digital.vercel.app` (Vercel + Supabase).
Sem alterações locais pendentes no início. Instalação congelada (`pnpm install --frozen-lockfile`) ok.

## Arquitetura confirmada no código

| Camada | O que existe |
|---|---|
| Frontend | `artifacts/lupa-publica` — React + Vite + wouter + Tailwind. Rotas em `src/App.tsx`. |
| API | `artifacts/api-server` — Express 5, empacotada em `api/index.js` (função da Vercel). |
| IA | `lib/integrations/openai-ai-server` — Groq (`openai/gpt-oss-120b`) como principal; Gemini/OpenAI só para OCR quando configurados. |
| Auth | Supabase Auth; JWT verificado na API (JWKS + confirmação em `/auth/v1/user`). Papel de admin só de `app_metadata`/lista no servidor. |
| Banco | Supabase Postgres via service role **no servidor**; RLS ligada em todas as tabelas; a API filtra por `user_id` explicitamente. |
| Modo memória | Só com `LUPA_STORE=memory` e recusado em produção (testes e E2E). |

## Problemas relatados anteriormente — situação conferida

| Item | Situação | Evidência |
|---|---|---|
| Dependências incompatíveis com instalação congelada | **Resolvido** | `pnpm install --frozen-lockfile` passa; `vercel.json` usa o mesmo comando. |
| Cache baseado em trecho do documento | **Resolvido** | `lib/aiCache.ts`: chave = SHA-256 de escopo+modelo+versão do prompt+opções+**texto completo**; `aiCache.test.ts`. |
| Cache de respostas incompletas | **Resolvido** | `cacheSet` recusa `processing.complete === false` e modo `fallback`. |
| Gravação de payload bruto | **Resolvido** | `routes/resources.ts` grava só dados validados por Zod; campos do servidor recusados (400). |
| Alteração de `id`/`user_id`/permissões | **Resolvido** | `SERVER_CONTROLLED_FIELDS`; `match({id,user_id})`; perfil com schema `.strict()`; teste de perfil com `role` → 400. |
| SSRF na extração de URLs | **Resolvido** | `lib/safeFetch.ts`: resolve DNS e recusa IP privado em **cada** conexão (lookup próprio) e em cada redirecionamento; `safeFetch.test.ts`. |
| Endpoints de IA sem controle de acesso/consumo | **Resolvido** | `app.ts`: limites anônimos e por IA/OCR; chat e ferramentas NIASci exigem login. |
| Compartilhamento público sem proteção | **Era parcial → corrigido nesta etapa** | Antes: link eterno, sem revogação, criado sem dono (o frontend não enviava o token) e a resposta pública devolvia `user_id` e a comparação com o perfil. Agora: só com login, validade de 30 dias, revogação, resposta sem dono e sem `elegibilidade_perfil`. Teste de ponta a ponta na API e no navegador. |
| CORS permissivo e erros internos expostos | **Resolvido** | `corsDelegate` com lista permitida em produção; manipulador de erros devolve mensagens genéricas. |

## Problemas novos encontrados e corrigidos nesta etapa

1. **Instruções dentro de documentos** não eram isoladas: agora toda chamada de texto à IA recebe uma regra de conteúdo não confiável (`promptSafety.ts`), testada.
2. **Perfil presumido enviado à IA:** o `/testar` mandava renda “1 a 3 salários” e escolaridade “superior” mesmo sem a pessoa informar. Agora vazio = “não informado” (servidor e heurística local).
3. **Formulário de contato simulava envio** (“Mensagem enviada” sem enviar nada). Agora abre o e-mail da pessoa e diz isso.
4. **Página de privacidade desatualizada e com afirmações não comprováveis** (“não exigimos conta”, “servidores da OpenAI”, “em conformidade com a LGPD”). Reescrita como versão preliminar para revisão jurídica.
5. **Token de link público nos logs** (fazia parte do caminho). Agora mascarado (`maskLogUrl`), testado.
6. **Importação do Lattes sobrescrevia dados confirmados** sem aviso. Agora há prévia e só substitui com escolha explícita.
7. **Páginas estáticas sem cabeçalhos de segurança** além de HSTS. Acrescentados em `vercel.json`.
8. **Acessibilidade:** “Carregando…” com contraste 4,46:1 (abaixo de 4,5:1) em toda troca de página; botão de salvar que perdia o foco do teclado.

## O que não foi possível verificar (dependências externas)

Ver `docs/pendencias-externas.md`.
