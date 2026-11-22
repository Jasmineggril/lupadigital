# Continuidade do usuário e "Meu histórico" — diagnóstico, mudanças e evidências

Data: 22/11/2026. Ambiente de validação: **banco real de desenvolvimento local** (Postgres 16 + PostgREST v12.2.3,
mesmo caminho de acesso do Supabase; `scripts/dev-db/stack.sh`), com todas as migrações aplicadas, contas e dados
**fictícios**. Nenhuma gravação em produção; nenhum texto enviado a provedor de IA durante os testes (respostas de IA
fictícias, interceptadas no navegador).

> "Salvo" na tela não foi aceito como prova: cada jornada confere o registro **pela API em outro contexto de navegador**
> e, nos testes de servidor, também depois de **reiniciar a API**.

## 1. Diagnóstico (antes)

Contagens de produção (somente leitura, 22/11): `agent_results` 0, `lattes_profiles` 0, `article_analyses` 0,
`research_projects` 2, `planetarium_contents` 1, `chat_messages` 2, `participations` 0. Os registros de uso da IA
mostravam 1 análise de edital feita **com login** e 0 análises salvas — compatível com a causa 4 abaixo.

| # | Módulo | Problema | Tipo | Causa confirmada |
|---|---|---|---|---|
| 1 | Assistente | Reabrir uma conversa trazia mensagens de outra | salvou, mas não recupera | `GET /resources/chat_messages` ignorava `conversation_id` e ordenava do mais novo (reproduzido no banco real) |
| 2 | Assistente | Sem lista de conversas; conversa perdida ao fechar a aba | não há como recuperar | id da conversa só no `sessionStorage` |
| 3 | Assistente | Pergunta perdida quando a IA falhava | não salvou | a mensagem da pessoa só era gravada depois da resposta |
| 4 | Editais | Análise parcial (IA indisponível) nunca ia para a conta | não salvou | só o botão "Salvar interpretação" gravava |
| 5 | Editais | Checklist marcado e anotações perdidos | não salvou | estado só em memória (React) |
| 6 | NIASci (e-Lattes, Artigos, Planetário) | Falha ao carregar o histórico aparecia como "nenhum item" | salvou, mas parecia perdido | erro convertido em lista vazia |
| 7 | Aprender | Progresso só no navegador; quiz não salvo | não salvou na conta | `localStorage` sem dono |
| 8 | Glossário | Sem favoritos nem recentes | — | não existia persistência |
| 9 | e-Lattes | Só 2.000 caracteres do currículo guardados | salvou incompleto | corte em `lattes_xml` |
| 10 | Artigos | Leitura parcial (texto > limite) não identificada; sem anotações | — | não havia registro de leitura |
| 11 | Projetos | Renomear etapa = uma gravação por tecla; duas abas sobrescreviam em silêncio | — | gravação a cada `onChange`, sem versão |
| 12 | Todos | Repetir envio (clique duplo, nova tentativa) podia duplicar registro | — | sem idempotência |

O que **já funcionava** (verificado no banco real): gravação de e-Lattes, Artigos, Planetário e `agent_results` pelo
botão salvar; participações (com versões próprias).

## 2. O que mudou

### Servidor
- **Migração `supabase/migrations/20261130_continuidade.sql`** (só adiciona; idempotente; linhas antigas continuam válidas):
  `updated_at`, `version`, `client_id` (+ índice único por usuário) e `favorito` nas tabelas de trabalho; `estado` e
  `status` em `agent_results`; RLS em `conversations`; tabela `user_items` (progresso, favoritos, preferência e recentes),
  com RLS e escrita só pelo servidor.
- **Idempotência**: cabeçalho `Idempotency-Key` → `client_id`; repetir devolve o mesmo registro (também em corrida, via 23505).
- **Concorrência**: `If-Match: <versão>` com compare-and-set; versão antiga → `409 CONFLITO` com a versão atual. Nada é sobrescrito em silêncio.
- **Dono sempre do token**: todas as leituras/gravações filtram por `user_id` do JWT; o `user_id` enviado pelo cliente é ignorado.
- `GET /resources/chat_messages?conversation_id=` (ordem cronológica); paginação `limit/offset`; `PATCH /resources/:t/:id/meta` (título/favorito); excluir conversa apaga as mensagens.
- `GET /edital/agent-history/:id`, `PATCH` com `estado` (checklist, anotações, chat) e versão.
- `routes/continuidade.ts`: `/me/items` (aprendizagem, favoritos, recentes **opt-in**: máx. 20, 30 dias, desligar apaga) e
  **`GET /me/history`** — lê as tabelas de cada ferramenta (sem copiar dados), com filtro por ferramenta/situação,
  pesquisa sem acento, ordenação, favoritos primeiro, paginação, e informa ferramentas que falharam em vez de escondê-las.
- Exportação/exclusão incluem `user_items` e `analysis_jobs`.

### Interface
- `lib/persistence.ts` + `components/lupa/SaveStatus.tsx`: estados **"Alterações não salvas" → "Salvando…" → "Salvo na sua conta às HH:MM"** (só após resposta do servidor) ou **"Falha ao salvar — Tentar de novo"**; conflito oferece "Carregar a versão salva" / "Manter a minha". Espera de 1,5 s (sem requisição por tecla), nova tentativa automática em falha de rede/servidor, gravação ao esconder a aba e ao voltar a conexão. O leitor de tela é avisado só de falha, conflito e da primeira confirmação.
- Cópia de **recuperação** local: só do que ainda não chegou ao servidor, por conta (`lupa-rascunho:v1:<conta>:…`), expira em 7 dias, apagada ao confirmar, ao sair e quando outra conta entra. Nunca exibida como "salvo na conta".
- **Assistente** reescrito: "Minhas conversas" (nova, pesquisar, renomear, fixar, excluir), conversa na URL (`?c=`), pergunta salva **antes** da resposta, mensagem não salva marcada com "Tentar de novo", resposta interrompida com "Tentar de novo".
- **Editais**: análise parcial salva automaticamente (com aviso); checklist, anotações e chat salvos na análise; reabrir por `?analise=ID` sem nova análise.
- **Aprender**: passo, passos concluídos e respostas do quiz na conta; "Continuar de onde parei"; "Reiniciar progresso" com confirmação; progresso de visitante só é levado à conta se a pessoa importar.
- **Glossário**: favoritos (estrela só marcada depois da confirmação); consultas recentes **desligadas por padrão**, registram só termo aberto ou busca confirmada com Enter; botão "Limpar".
- **e-Lattes**: guarda o currículo (até 60 mil caracteres) com cada versão; reabrir carrega leitura e texto sem nova análise; incorporação ao perfil continua exigindo confirmação.
- **Artigos**: leitura **integral ou parcial** identificada (o servidor lê até 20 mil caracteres) e mostrada; anotações salvas automaticamente; o texto do artigo **não** é guardado.
- **Projetos**: gravações em fila (sem corrida), com espera ao digitar, versão por projeto (conflito entre abas detectado), "Salvar versão" (até 10) e "Restaurar"; falha mantém o conteúdo na tela e oferece "Tentar de novo".
- **e-Lattes, Artigos, Planetário**: reabrir por link (`?item=ID`), erro de histórico com "Tentar de novo", nova análise = novo registro (idempotente na mesma análise).
- **"Meu histórico"** (`/historico`, antes "Histórico de análises"): todas as ferramentas, filtros, pesquisa, ordenação, situação (rascunho, concluído, parcial, em andamento, falha), fixados, datas de criação e atualização, agrupamento por projeto, paginação, "Continuar"/"Reabrir"; resumos de Aprender e Glossário fora da lista; análises de visitante deste navegador com **importação explícita** por item.
- **"Continue de onde parou"** em `/` e `/inicio` (os 3 trabalhos mais recentes).
- Privacidade: inventário (`docs/privacidade/inventario-tratamento.md`, itens 17–25) e aviso (`/privacidade`, seção "Salvamento automático e Meu histórico").

## 3. Matriz final

| Módulo | O que é salvo | Onde fica | Como retomar | Teste executado | Resultado | Pendência |
|---|---|---|---|---|---|---|
| Assistente | Conversas separadas (título, fixado), perguntas e respostas, trecho de contexto | `conversations`, `chat_messages` | "Minhas conversas" ou Meu histórico → `?c=ID` | E2E: 2 conversas, recarregar, reabrir sem mistura, contagem no servidor; rede caída → mensagem fica "não salva" → tentar de novo sem duplicar. API: idempotência, ordem, renomear, excluir em cascata, B sem acesso | ✅ | — |
| Editais | Resultado completo, situação (concluída/parcial), checklist, anotações, chat, versão | `agent_results` (+ `estado`) | Meu histórico → `?analise=ID` (sem nova IA) | E2E: parcial salva sozinha; anotação "Salvo na sua conta" e conferida na API; outro navegador reabre sem chamar análise; duas abas → conflito, nada sobrescrito, "Manter a minha" grava; sessão expirada → texto fica, falha dita, tentar de novo salva | ✅ | — |
| Documento longo | Tarefa, partes, resultado parcial | `analysis_jobs` | Meu histórico → `?tarefa=ID` | Suíte `e2e-longo` (retomada após recarregar) | ✅ (suíte anterior) | — |
| Aprender | Passo, passos concluídos, respostas do quiz | `user_items` (aprendizagem) | "Continuar de onde parei" (página e Meu histórico) | E2E: avançar 2 passos, conferir na API, outro navegador oferece "passo 3 de 6" | ✅ | — |
| Glossário | Favoritos; recentes só se ligados (20 itens/30 dias) | `user_items` | Filtro "Meus favoritos"; lista de recentes | E2E: favorito confirmado reaparece em outro navegador; recentes desligadas por padrão. API: opt-in, limite 20, desligar apaga | ✅ | — |
| e-Lattes | Currículo (≤60 mil car.), leitura, versões | `lattes_profiles` | Histórico da ferramenta ou Meu histórico → `?item=ID` | E2E: currículo guardado com a versão; outro navegador reabre sem chamar a IA | ✅ | Incorporação ao perfil: confirmação já existente, não alterada |
| Artigos | Resultado, título, leitura integral/parcial, anotações (sem o texto do artigo) | `article_analyses.metadata` | `?item=ID` | E2E: texto > 20 mil → "Leitura PARCIAL"; anotação salva e reaberta em outro navegador; texto do artigo ausente do registro | ✅ | Arquivo original nunca é guardado (por decisão) |
| Projetos | Projetos manuais, etapas, situação, até 10 versões; projetos gerados por IA | `research_projects` | Aba "Meus projetos" ou Meu histórico → `?projeto=ID` | E2E: criar, adicionar etapa, digitar nome (≤2 gravações para 15 teclas), salvar versão, outro navegador vê nome e versão | ✅ | — |
| Planetário | Roteiro científico educativo gerado (finalidade atual mantida: tema + público → explicação, roteiro, curiosidades, quiz, slides e fontes) | `planetarium_contents` | Histórico da ferramenta ou `?item=ID` | API (banco real): versão/conflito. Navegador: não há jornada própria | ⚠️ parcial | Jornada de navegador própria |
| Participações | Checklist, prazos, proposta com versões (já existentes) | `participations` | Meu histórico → `/participar/ID` | Suítes `e2e-jornadas`/`e2e-regressao` (anteriores); aparece no Meu histórico (API) | ✅ | — |
| Meu histórico | — (lê os registros acima) | `GET /me/history` | `/historico`, menu "Meu histórico", "Continue de onde parou" | E2E: filtro por ferramenta, pesquisa, "Continue de onde parou" em /inicio. API: paginação, filtros, fixados primeiro, isolamento | ✅ | — |
| Isolamento | — | API + RLS | — | E2E: B com histórico vazio; B recebe 404 ao abrir/alterar análise de A e lista vazia de mensagens de A. RLS: `rls-isolation.mjs` 21/21 tabelas | ✅ | — |
| Troca de conta | Cópias de recuperação por conta | navegador | — | E2E: sair apaga a cópia de A; cópia remanescente de A é apagada quando B entra | ✅ | — |
| Exportar/excluir | Todos os itens acima | `/me/export`, `/me/data` | Configurações | E2E: exportação contém conversations, chat_messages, user_items, agent_results, research_projects; exclusão → Meu histórico com 0 itens | ✅ | — |

## 4. Evidências

- `npx vitest run src/routes/__tests__/continuidade.test.ts` com `LUPA_TEST_REST_URL/KEY` (banco real): **7/7**, incluindo
  "reiniciar a API e recuperar" (nova instância do servidor lê o que foi confirmado antes).
- `node scripts/e2e-continuidade.mjs` com a API em `LUPA_E2E_REAL_DB=1`: **15/15 jornadas**.
- Suíte de unidade da API: 561 aprovados, 6 ignorados (casos que exigem banco real). Verificação de tipos: API e interface sem erros.
- `scripts/security/rls-isolation.mjs` no banco de desenvolvimento: 21/21 tabelas isoladas (incluindo `user_items`).

## 5. Limitações honestas

- A migração **não foi aplicada em produção** (aplica-se ao mesclar, pela integração GitHub → Supabase). Até lá, a versão publicada continua com os problemas do diagnóstico.
- Falha do **banco** foi testada como erro 5xx/rede no navegador e como falha de tabela no servidor (memória); não houve desligamento físico do Postgres durante uma jornada.
- O conflito entre abas é detectado na gravação (não em tempo real): a segunda aba só descobre ao salvar.
- Visitante: o histórico deste navegador do /testar pode ser importado; o progresso do "Aprender" de visitante também. Os demais módulos NIASci exigem login.
- O Planetário não tem jornada de navegador própria (coberto por testes de API).
- Não há declaração de conformidade integral com a LGPD: o inventário e as bases legais continuam marcados "a validar" para revisão jurídica.
