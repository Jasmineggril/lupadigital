# Fluxo docente: fonte oficial → edital estruturado → perfil → recomendação explicada

## Visão geral

| Etapa | Onde |
|---|---|
| Cadastro, login, recuperação e sessão | Supabase Auth (`artifacts/lupa-publica/src/lib/auth.tsx`). Não há autenticação paralela. |
| Perfil docente | `PUT /api/profile`; tabela `teacher_profiles`; tela `/perfil` |
| Coleta (FAPDF primeiro) | `lib/lupa/collector/*`; tela `/admin` |
| Catálogo | `GET /api/opportunities`; telas `/oportunidades` e `/oportunidades/:id` |
| Compatibilidade | `lib/lupa/matching.ts`; `GET /api/recommendations`; tela `/recomendacoes` |

## Papéis

Administrador é definido **somente pelo servidor**:

- `app_metadata.role = "admin"` no Supabase. Esse campo só pode ser alterado com a service role, pelo painel ou pela Admin API.
- Ou a variável `LUPA_ADMIN_USER_IDS`, com os IDs separados por vírgula.

O cadastro grava apenas `user_metadata` (nome, tipo de perfil), que o usuário pode editar e que **nunca concede papel**. O perfil docente usa schema estrito: `user_id`, `role`, `version` e campos desconhecidos resultam em 400.

Para tornar alguém administrador no Supabase, no SQL Editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'pessoa@undf.edu.br';
```

A pessoa precisa entrar de novo para receber um token com o papel.

## Coleta

- **Classificação:**
  - **Categoria:** página que lista vários editais, ou sem número no título. Nunca vira edital.
  - **Oportunidade:** página dedicada, com um único número de edital no título.
  - **Documento:** PDF, DOCX etc. Não é baixado; fica vinculado à oportunidade.
- **Limites:** profundidade, número de páginas, tempo total, 5 MB por resposta e intervalo mínimo de 500 ms entre requisições (padrão: 1,5 s). Só segue os domínios da fonte.
- **Sem ciclos nem duplicatas:**
  - As URLs são normalizadas (sem fragmento, sem `utm_*`, sem barra final).
  - O catálogo usa `canonical_url` como chave única.
  - A reexecução atualiza `last_seen_at` sem criar versão quando nada mudou.
- **Versões:** mudanças geram nova `version` (snapshot em `opportunity_versions`) e devolvem o item para revisão humana.
- **Retificações:**
  - A retificação encontrada na própria página do edital é vinculada a ele.
  - A encontrada em página de categoria só é vinculada se citar o **mesmo número** do edital.
  - "Retificação" genérica, ou a palavra em menus e rodapés, não cria vínculo; fica contada em `retificacoes_sem_vinculo`.
- **Situação × eventos:** a situação (`aberta`, `encerrada`, `desconhecida`) fica separada dos eventos (`retificacao`, `prorrogacao`, `resultado`).
- **Extração com evidência:** cada campo guarda o trecho e a URL de origem. O que não for encontrado entra em `missing_fields` e aparece como "não encontrado — pendente de verificação".

### FAPDF: URL inicial a confirmar

A fonte padrão usa `https://www.fap.df.gov.br/editais/`. **Essa URL não pôde ser verificada**: o portal da FAPDF recusou as conexões a partir do ambiente de desenvolvimento usado. O domínio `fapdf.df.gov.br` apresenta o certificado TLS de outro site, vencido. Confirme a página real de editais e ajuste as "URLs iniciais" na tela **Administração**.

## Compatibilidade (critérios)

Detalhados em `lib/lupa/matching.ts` e na página `/como-funciona#compatibilidade`.

- **Aderência temática** (0–100): termos do perfil encontrados no edital. Pesos: áreas e temas 3; palavras-chave e competências 2. O índice é a soma × 10, limitado a 100. **Não é probabilidade de aprovação.**
- **Elegibilidade**, requisito a requisito: `atendida` (dado autodeclarado, a comprovar), `nao_atendida` ou `pendente_comprovacao`. Qualquer `nao_atendida` torna o resultado geral **impedimento**, mesmo com aderência alta, e gera um aviso.
- Cada recomendação registra `opportunity_version` e `profile_version`, e é recalculada quando qualquer uma das duas muda.
- O feedback de relevância fica em `recommendation_feedback`.

## Banco

Migração `supabase/migrations/20261120_docentes_oportunidades.sql`:

- Só cria tabelas novas, sem `DROP`, com RLS em todas.
- Policies:
  - Perfil, recomendações, feedback e salvos: só o dono.
  - Catálogo: leitura para usuários autenticados.
  - Fontes, versões e execuções: só o backend.

## Variáveis de ambiente (servidor)

| Variável | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Acesso do backend ao banco (só no servidor). |
| `SUPABASE_JWKS_URL` | Verificação de JWT. Opcional: é derivada de `SUPABASE_URL`. |
| `LUPA_ADMIN_USER_IDS` | Opcional. IDs de administradores, separados por vírgula. |
| `HERMES_TRIGGER_SECRET` | Opcional. Habilita o gatilho do Hermes (32 ou mais caracteres). |
| `LUPA_STORE=memory` | **Só desenvolvimento e testes.** Banco em memória; é recusado com `NODE_ENV=production`. |

No frontend: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

No Supabase Auth, cadastre em **Redirect URLs** os endereços `/perfil` (confirmação de e-mail) e `/redefinir-senha` (recuperação) do domínio publicado.

## Testes

- **Backend:** `pnpm --filter @workspace/api-server test`. Inclui a coleta com fixtures e a API com JWT ES256 real.
- **Ponta a ponta:** Auth de teste, API em memória e build de produção:

```bash
node artifacts/api-server/src/scripts/e2e-fake-auth.mjs 54321
```

```bash
cd artifacts/api-server && SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json PORT=3001 ../../scripts/node_modules/.bin/tsx src/scripts/e2e-server.ts
```

```bash
cd artifacts/lupa-publica && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=e2e pnpm run build
```

Sirva `dist/public` em `:4173`, com `/api` encaminhado para `:3001`, e rode:

```bash
node scripts/e2e-docente.mjs
```

As fixtures de coleta são **fictícias** e imitam a estrutura de um portal; não são dados reais da FAPDF.
