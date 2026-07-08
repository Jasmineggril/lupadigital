Resumo das mudanças — LUPA Digital

Data: 2026-07-07

Principais alterações:

- Backend
  - `artifacts/api-server/src/lib/aiService.ts`: centralizou logs estruturados (pino) e persistência de métricas em `ai_usage_logs`. Mede latência, tokens (quando disponíveis), registra sucesso/falha e mensagens de erro. Persistência em DB com fallback seguro.
  - `artifacts/api-server/src/routes/edital.ts`: passa `userId` opcional para `analyzeAgent` para associar métricas ao usuário quando autenticado.
  - `supabase-schema.sql`: adição de DDL de exemplo para `public.ai_usage_logs`.

- Migration
  - `db/migrations/2026-07-07-create-ai-usage-logs.sql`: migration SQL Drizzle criada (tabela, índices, RLS e policies de exemplo).

- Frontend (branding)
  - Várias páginas e componentes renomeados de "Lupa Pública IA" para "LUPA Digital" (meta tags, navbar, footer, páginas: `como-funciona`, `compartilhado`, `contato`, `faq`, `impacto-social`, `privacidade`, `tecnologias`, `niasci`, `testar`).
  - Atualizações de textos de exportação/compartilhamento e PDF gerado.

- Observações operacionais
  - A migration foi criada mas NÃO foi executada no banco.
  - Recomenda-se ajustar políticas RLS conforme ambiente de produção.
  - Rebuild do frontend é necessário para atualizar assets compilados.

Como aplicar a migration manualmente

Exemplo com psql:

```bash
psql "postgresql://<user>:<pass>@<host>:<port>/<db>" -f db/migrations/2026-07-07-create-ai-usage-logs.sql
```

Ou cole o SQL no painel SQL do Supabase e execute.

Commit e push
- As alterações foram commitadas e serão enviadas para `origin/main` no push executado por este workflow.

Contato
- Se quiser que eu gere uma migration no formato específico do Drizzle CLI (TS), informe e eu crio.
