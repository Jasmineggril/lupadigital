# LUPA como jornada contínua — o que existe, o que foi feito agora, o que falta

Data: 23/11/2026. Referência: a especificação "Como o LUPA Digital deve funcionar por completo" (seções 1–13).
Conferido no código antes de implementar. **Uma página abrir não foi aceita como prova:** cada item abaixo
aponta para o teste que exercita a função.

Legenda: ✅ funciona e tem teste · 🟡 funciona em parte · ⛔ pendente/depende de algo externo.

## Matriz por seção

| § | Comportamento esperado | Situação | Onde está | Como foi testado |
|---|---|---|---|---|
| 1 | Página inicial com "O que você quer fazer agora?" e os 8 caminhos, incluindo **continuar um trabalho anterior** | ✅ (o card "Continuar" foi acrescentado agora) | `lib/feature-catalog` (GOALS), `GoalPicker`, `ContinueWhereLeft` | `e2e-jornadas` (visitante → páginas reais), `e2e-jornada-completa` passo 9 |
| 2 | Conta separada do perfil; questionário curto e editável; várias classificações ao mesmo tempo; perfil não dá permissão de administrador; pedir dado só quando necessário, explicando o porquê | ✅ | `cadastro.tsx`, `docente/perfil.tsx`, `routes/lupa.ts` (papéis separados) | `participation.test.ts` ("declarar docente não dá acesso administrativo"); `e2e-jornada-completa` passo 1 (estudante + profissional + hackathons, salvo e reaberto; `/admin/status` recusado) |
| 3 | Fontes oficiais, anexos, retificações, mudança de prazo; recomendação explicada (combina / atende / não atende / falta / documento e versão); compatibilidade ≠ chance; salvar, dispensar, filtrar; cobertura e última atualização | 🟡 | `collector/*`, `matching.ts`, `compareFields`, `oportunidades.tsx` | `apiFlow.test.ts`, `matching.test.ts`, `e2e-docente`. **Pendente**: só a FAPDF está configurada e a coleta de 22/11 falhou (endereço `/editais/` respondeu 404); falta o endereço novo |
| 4 | Texto, URL ou PDF; objetivo, público, requisitos, restrições, datas, documentos, valores, **critérios, obrigações e desclassificação**; original e versão preservados; explícito × interpretação × não encontrado; documentos longos em partes com progresso real | ✅ (obrigações e desclassificação acrescentadas agora, com o trecho literal) | `documentBase.ts`, `analysisFacts.ts`, `longdoc/*`, `testar.tsx` (seção "Regras do edital") | `documentBaseRules.test.ts`; `e2e-testar` 17/17; `e2e-longo` 3/3 (600 mil e 1 milhão de caracteres); `e2e-jornada-completa` passo 2 |
| 5 | Depois do resultado: **Conferir minha elegibilidade, Organizar documentos, Acompanhar prazos, Preparar projeto**, com explicação curta e contexto preservado (perfil, edital/versão, análise, projeto, pendências) sem reenviar o documento | ✅ (novo componente `ProximosPassos`) | `components/lupa/ProximosPassos.tsx` | `e2e-jornada-completa` passos 3, 4 (pelo teclado) e 6; repetir não duplica o espaço de participação |
| 6 | Ferramentas trabalhando juntas (Analisar, Aprender, Glossário, e-Lattes, Artigos, Projetos, Planetário, Assistente, Meu histórico); referências verificáveis, nada inventado | 🟡 | cada página; `catalogForPrompt` (Assistente só indica rotas reais) | `e2e-continuidade` 15/15 (todas as ferramentas salvam e reabrem); `promptSafetyCatalog.test.ts`. **Planetário**: gera roteiros educativos; não há ligação com editais/projetos no código, então ficou como ferramenta à parte |
| 7 | "Preparar projeto" cria ou vincula; reaproveita requisitos do edital; pergunta só o que falta; versões; exigência do edital × sugestão; conferência separada da geração | ✅ | `projetos.tsx` (`?participacao=`), `projectContext`, `deterministicCheck`, "Salvar versão" | `e2e-regressao` P1/P4, `e2e-jornada-completa` passo 6, `e2e-continuidade` (Projetos) |
| 8 | Espaço por oportunidade: checklist, **tarefas e responsáveis**, prazos oficiais × metas pessoais, situação, alterações do edital, **envio e resultado informados pela pessoa** | ✅ (tarefas e envio/resultado acrescentados agora) | `participations.ts` (`tarefas`, `submissao`, regra "enviada exige data"), `participar-detalhe.tsx`, migração `20261201` | `participationTasks.test.ts` 6/6; `jornadaContinua.test.ts` (memória e **banco real**); `e2e-jornada-completa` passo 5 |
| 9 | Salvamento automático com estados; versões explícitas; favoritos; Meu histórico com busca e filtros; reabrir e continuar; nada de registrar cada clique; o que é só do navegador identificado | ✅ | `lib/persistence.ts`, `SaveStatus`, `/me/history`, `historico.tsx` | `continuidade.test.ts` 7/7 no banco real; `e2e-continuidade` 15/15 no banco real |
| 10 | Assistente com contexto: onde preparar projeto, continuar análise, documentos que faltam, trabalhos anteriores, Lattes, próximo passo; diz qual contexto usa; permite escolher o edital/projeto; não mistura trabalhos | ✅ (seleção de contexto acrescentada agora) | `assistente.tsx` (seletor "Usar um trabalho seu como contexto"), `routes/niasci.ts` (`participationId`, `projectId`, `historyId` com checagem de dono), `participationAssistantContext` | `jornadaContinua.test.ts` (outra conta recebe 404 sem chamar a IA); `e2e-jornada-completa` passos 7 e 9 (o contexto volta junto com a conversa) |
| 11 | Autenticação, banco e arquivos persistentes; dono conferido no servidor **e** nas políticas do banco; sessão expirada; compartilhamento explícito e revogável; exportação e exclusão; segredos protegidos; retenção e backup; aviso sobre IA | 🟡 | RLS em todas as tabelas, `ownsResource`, `/me/export`, `/me/data`, `/privacidade` | `rls-isolation.mjs` 21/21; `e2e-jornadas` (compartilhar e revogar); `e2e-regressao` (LGPD). **Pendente**: backup automático em produção depende de aprovação (rotina pronta em `scripts/ops/backup.sh`) |
| 12 | Computador, celular, tablet, Android; teclado, foco, leitor de tela, contraste, ampliação; instruções curtas; vídeos com alternativa; Libras com limitações ditas | 🟡 | `index.css` (foco), `lib/tv.ts` (TV e videogame) | `e2e-responsivo` 720/720 (18 tamanhos de tela, axe sem violações); `e2e-tv` 7/7. **Não verificado**: aparelhos Android/iOS reais, leitores de tela reais (NVDA, TalkBack, VoiceOver); Libras não implementada |
| 13 | Jornada completa: estudante com ideia para hackathon → edital → requisitos → perfil → documentos → projeto → assistente → volta outro dia | ✅ | `scripts/e2e-jornada-completa.mjs` | **11/11 etapas em memória e 11/11 no banco real de desenvolvimento** |

## O que mudou nesta etapa

- **§5 "E agora?"** (`ProximosPassos.tsx`): os quatro passos com explicação. Todos partem da mesma análise salva, sem reenviar o documento.
  - Abrir o espaço de participação de novo não cria um segundo.
  - Elegibilidade abre a aba certa do próprio resultado.
- **§8 Acompanhamento** (`participations.ts`, migração `20261201_participacao_tarefas_envio.sql`):
  - **Tarefas e responsáveis**: a data de uma tarefa é meta pessoal e não vira prazo oficial.
  - **Envio e resultado**: data, protocolo e resultado (aguardando, aprovada, não aprovada, lista de espera), sempre informados pela pessoa.
  - "Enviada" sem data de envio é recusada (422). Registrar resultado exige a data de envio.
- **§10 Assistente**:
  - Escolha da análise, participação ou projeto usado como contexto. A tela diz qual está sendo considerado.
  - Fica salvo na conversa: reabrir não mistura com outro trabalho.
  - O servidor lê os dados da conta e recusa contexto de outra pessoa.
  - Atalhos "Perguntar ao Assistente" na participação e no "E agora?".
- **§4 Regras do edital**: obrigações e causas de desclassificação extraídas do texto (trecho literal), mostradas junto dos critérios de avaliação. Quando o texto não traz, aparece "Não encontrado no documento".
- **§1**: o card "Continuar um trabalho anterior" aparece na página inicial. Ele não entra no questionário do perfil, porque não é um objetivo.
- **TV**: ←/→ não pulam mais em diagonal para a linha de cima quando o item está sozinho na linha.

## Testes executados (23/11/2026)

- **Unidade**: API 576 passaram (6 ignorados: exigem banco real); interface 11. Tipos: API e interface sem erro.
- **Banco real de desenvolvimento** (Postgres 16 + PostgREST, migração nova aplicada):
  - `continuidade.test.ts` + `jornadaContinua.test.ts`: 9/9.
  - `e2e-jornada-completa`: 11/11.
- **Navegador, todas as suítes** (`run-all.sh`): testar, docente, jornadas, regressão, longo, continuidade, jornada-completa e responsivo passaram.
  - `e2e-tv` falhou na primeira rodada por um defeito real (o pulo diagonal descrito acima). Depois da correção, passou 7/7 duas vezes seguidas.

## Dependências que continuam pendentes

1. **Catálogo de editais vazio em produção**: a coleta da FAPDF falhou com HTTP 404 em `https://www.fap.df.gov.br/editais/`. Falta o endereço novo da página de editais. Sugestão já feita: "Adicionar edital por PDF" na administração, aguardando decisão.
2. **Migração `20261201`** só vale em produção depois do merge (integração GitHub → Supabase).
3. **Aparelhos e leitores de tela reais**, Libras e validação humana de acessibilidade.
4. **Backup automático** em produção: aguarda aprovação.
5. **Planetário**: não tem ligação com editais nem projetos no código. Ligar exigiria definir para que ele serviria na jornada; nada foi inventado.
6. Não se declara conformidade integral com a LGPD nem segurança absoluta.
