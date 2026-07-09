# Auditoria de Integração Supabase — lupadigital

## Resumo geral
A integração Supabase do projeto está parcialmente implementada. O backend possui suporte ao Supabase e ao JWT, além de centralizar chamadas OpenAI no `AIService`. Porém, o frontend ainda grava diretamente no Supabase, os nomes de tabelas estão inconsistentes e não há políticas/RLS completas para todas as tabelas de usuário.

## Resultado por item
- ✔ Implementado
  - `AIService`: uso centralizado de OpenAI em `artifacts/api-server/src/lib/aiService.ts`
  - Logs de IA: `ai_usage_logs` gravados corretamente no backend.

- ⚠ Parcial
  - Variáveis de ambiente: backend e frontend usam variáveis Supabase, mas não há documentação consolidada ou clareza entre service role e publishable key.
  - Cliente Supabase: backend usa cliente admin, frontend usa cliente anon e persiste dados diretamente.
  - Autenticação: middleware JWT existe, mas nem todos os endpoints de dados exigem `requireAuth()`.
  - Middleware JWT: verifica JWKs, mas falta validação estrita de `issuer`/`audience`.
  - RLS: presente apenas para `edital_analises` e `ai_usage_logs`; demais tabelas não têm RLS visível.
  - Policies: apenas políticas parciais no schema, sem proteção de usuário para todas as tabelas.
  - Tabelas: há discrepância `edital_analises` vs `edital_analyses`; `user_id` não está claramente definido em muitas tabelas usadas.
  - Índices: apenas `ai_usage_logs` apresenta índices explícitos.
  - Migrations: há migrations apenas para `ai_usage_logs`; tabelas principais não têm migrations no repositório atual.
  - API: existe, mas não é a única fonte de verdade pelo uso direto do frontend no Supabase.
  - Histórico: mecanismos existem, mas não há cobertura completa de políticas/RLS.
  - Chat: persistência direta no frontend para `chat_messages`, sem endpoint autoritativo.
  - Exportação e Storage: não implementados como parte do fluxo Supabase.

- ❌ Ausente
  - Buckets/Storage: nenhum uso de Supabase Storage detectado.
  - Política de usuários em todas as tabelas sensíveis: não implementadas.
  - Migrações para tabelas principais e esquema completo de banco.
  - Exportação de dados consolidada no backend.

## Confirmações
- Persistência pela API somente: **não**. O frontend ainda grava diretamente em Supabase em `artifacts/lupa-publica/src/services/analisesService.ts`.
- Todas as tabelas possuem `user_id`: **não**. Há evidências de muitas tabelas sem campo `user_id` documentado ou usado consistentemente.
- Todas as rotas usam `req.user.id`: **não**. Algumas rotas de AI e de histórico aceitam acesso sem validação estrita.
- OpenAI fora do `AIService`: **não no backend**. O uso de OpenAI no servidor está centralizado em `AIService`.

## Recomendações prioritárias
1. Remover todas as gravações diretas do frontend para o Supabase.
2. Sincronizar nomes de tabelas entre frontend, backend e schema (`edital_analises` vs `edital_analyses`).
3. Adicionar `user_id` em todas as tabelas que armazenam dados de usuário.
4. Implementar RLS e políticas de usuário para todas as tabelas de dados privados.
5. Proteger com `requireAuth()` todos os endpoints que gravam ou leem dados privados.
6. Criar migrations completas para todas as tabelas usadas no projeto.
7. Definir e documentar claramente as variáveis de ambiente Supabase e OpenAI.

## Estado atual da branch
- Mudanças aplicadas: botão modal na página `artifacts/lupa-publica/src/pages/niasci.tsx`.
- Correção de Git LFS aplicada: `.gitattributes` atualizada para remover rastreamento de `attached_assets/Edital-Claro_(1)_1782320348126.zip`.

---

Relatório gerado automaticamente para finalizar as tarefas pendentes solicitadas.