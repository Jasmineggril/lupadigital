# Medidas de segurança e testes de isolamento

Estado em novembro de 2026. “Testado” = há teste automatizado executado nesta etapa. Nenhuma medida aqui torna o sistema “100% seguro”.

## Medidas

| Área | Medida | Onde | Teste |
|---|---|---|---|
| Transporte | HTTPS com HSTS (Vercel e helmet) | `vercel.json`, `app.ts` | conferido em produção (`curl -I`) |
| Cabeçalhos | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP mínima (`frame-ancestors`, `object-src`, `base-uri`, `form-action`) nas páginas; helmet na API | `vercel.json`, `app.ts` | entra em vigor no deploy; conferir após merge |
| Segredos | Chaves só no servidor (variáveis da Vercel); nada de chave no frontend | `lib/integrations`, `runtimeConfig.ts` | `runtimeConfig.test.ts` |
| Autenticação | JWT verificado (JWKS; fallback `/auth/v1/user`); sessão expirada → login com aviso | `lib/supabase.ts` | `supabaseJwt.test.ts`, E2E |
| Autorização | Admin só por `app_metadata.role` ou lista no servidor; vínculo “docente” não dá acesso | `lib/lupa/roles.ts` | `apiFlow.test.ts`, `participation.test.ts` |
| Propriedade | Toda consulta com service role filtra `user_id` (o service role contorna RLS) | `store.ts`, `db-http.ts`, rotas | testes com dois usuários |
| RLS | Ligada em todas as tabelas; `participations_own` (ALL, `user_id = auth.uid()`) | `supabase/migrations` | Postgres 16 local: A vê só a sua linha, não altera a de B, não cria com dono B |
| Validação de entrada | Zod com `.strict()` e lista de campos; `id`, `user_id`, origem e versão nunca aceitos do cliente | rotas | testes 400 |
| Concorrência | Versão otimista (`expected_version`) → 409 sem perder o texto | `participations` | API e navegador (duas abas) |
| Limites | Por IP (anônimo) e por rota de IA/OCR; tamanho de texto (450 mil caracteres), PDF (20 MB), JSON (10 MB), compartilhamento (512 KB) | `app.ts`, `edital.ts`, `pdf.ts` | `analyzeBase.test.ts` |
| SSRF | DNS resolvido e IP privado recusado em cada conexão e redirecionamento (protege contra DNS rebinding) | `safeFetch.ts` | `safeFetch.test.ts`, E2E URL interna |
| Conteúdo não confiável | Regra fixa no prompt de sistema de toda chamada de texto; o Assistente só cita páginas do catálogo real | `promptSafety.ts`, `feature-catalog` | `promptSafetyCatalog.test.ts` |
| XSS | Conteúdo da IA renderizado como texto pelo React; sem `dangerouslySetInnerHTML` com conteúdo de usuário/IA | frontend | busca no código (único uso: CSS estático do gráfico) |
| CSRF | Autenticação por cabeçalho `Authorization: Bearer` (não por cookie): CSRF clássico não se aplica | `lib/api.ts` | — |
| Erros | Mensagens genéricas ao usuário; detalhes só no log | `app.ts` | `processingErrors.test.ts` |
| Logs | Sem `authorization`/cookies; caminho sem query e sem token de compartilhamento; sem texto de documentos | `logger.ts`, `app.ts` | `promptSafetyCatalog.test.ts` (logs) |
| Uploads | PDF lido no navegador (pdf.js), sem execução; verificação de cabeçalho `%PDF-`, senha, tamanho, páginas | `lib/pdf.ts` | E2E PDF inválido/escaneado |
| Compartilhamento | Só com login, validade de 30 dias, revogação, resposta pública sem dono e sem dados do perfil | `edital.ts` | API e navegador |
| Dependências | Instalação reproduzível (`--frozen-lockfile`); idade mínima de pacotes (`pnpm-workspace.yaml`) | raiz | `pnpm install --frozen-lockfile` |
| Modo memória | Recusado em produção | `store.ts`, `db-http.ts`, `e2e-server.ts` | `apiFlow.test.ts` |
| DEV_AUTH_BYPASS | **Não existe no código** (busca sem ocorrências) | — | — |

## Testes de isolamento entre dois usuários (executados)

| Operação | Usuário B sobre dado de A | Resultado | Onde |
|---|---|---|---|
| Consultar participação | `GET /participations/:id` | 404 | API + navegador |
| Editar | `PATCH` | 404 | API + navegador |
| Excluir | `DELETE` | 404 | API + navegador |
| Criar a partir de análise de A | `POST {agent_result_id}` | 404 | API |
| Listar | `GET /participations` | só os próprios | API + navegador |
| Histórico de análises | lista / favorito / excluir | só os próprios; 404 | `agentHistory.test.ts`, E2E /testar |
| Links compartilhados | listar / revogar | lista vazia; 404 | API + navegador |
| Exportar dados | `GET /me/export` de A | não contém dados de B | API + navegador |
| Excluir dados | `DELETE /me/data` de A | dados de B intactos | API + navegador |
| Banco (RLS) | `SELECT/UPDATE/INSERT` como `authenticated` | só linhas próprias; insert forjado recusado | Postgres 16 local |

**Não testado:** buckets de armazenamento (o projeto não usa Storage para documentos: PDFs são lidos no navegador e não são guardados); MFA para administração (depende de ativação no Supabase — pendência).
