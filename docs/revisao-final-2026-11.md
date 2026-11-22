# Revisão final — LUPA Digital (22/11/2026)

Branch `claude/magical-brown-cmd7a7`, a partir de `main` em `f15fc44`, que já inclui o commit `dda40fc`.
Nada foi mesclado, publicado ou migrado em produção. Em produção houve apenas leitura: consultas
`read_only` ao banco, cabeçalhos HTTP e análises de um edital **fictício**. As capturas e os arquivos
desta pasta usam só dados fictícios.

## 1. As três falhas reproduzidas

O edital usado é fictício: [`revisao-final/edital-ficticio.txt`](revisao-final/edital-ficticio.txt).
Ele foi enviado à API de produção com quatro agentes. A resposta "antes" está guardada em
[`revisao-final/antes-producao-documentacao.json`](revisao-final/antes-producao-documentacao.json).

| Falha | Antes (produção, 22/11) | Causa | Correção | Prova |
|---|---|---|---|---|
| **Exigência inventada** | O pedido "foto/assinatura" não se repetiu nesta rodada, porque a IA varia. Ainda assim, a observação de cada item era o texto do modelo do prompt copiado ("Como obter ou preparar — sem adicionar exigências…"), e o agente devolvia `anoPublicacao: 2024` e `totalPaginas: 45` | Nenhuma conferência no servidor; o prompt continha exemplos que a IA copiava | `lib/analysisFacts.ts`: cada item é procurado no texto. O nome vem do trecho do edital, e o que a IA acrescentou sem respaldo fica em `nao_confirmado` com aviso. Item sem trecho fica "desconhecido", sem obrigatoriedade afirmada. Observação passa a ser **orientação**. O prompt foi ajustado, mas **não é tratado como a correção** | `analysisFacts.test.ts` (IA simulada com "com foto e assinatura"; opcional, alternativa, dispensa); `analyzeFacts.test.ts` (rota completa); E2E R1–R3 |
| **Prazo contraditório** | Agente Documentação: `deadlines: "Prazo não informado."`, enquanto `base.datas` tinha 20/12/2026. O chat lia o primeiro e o cronograma, o segundo | Cada tela lia um campo diferente | O prazo oficial é resolvido uma única vez no servidor, pela regra única de prazos (`deadlines.ts`). Um marcador de ausência é trocado pela data do documento, com o trecho; uma divergência real vai para `conflitos`. No frontend, `resolveAnalysisFacts` atende chat, FAQ, cronograma, visão rápida e PDF | testes unitários (servidor e frontend); E2E: chat, visão rápida e PDF mostram 20/12/2026, inclusive ao reabrir do histórico |
| **Ausentes incoerentes** | `base.ausentes` dizia "documentos exigidos" ao lado de uma lista de documentos do mesmo texto | Dois extratores diferentes | Cada campo é conciliado em encontrado / parcial / incerto / não localizado. O rótulo passou a ser "não localizado automaticamente — não significa que não exista". O que **só a IA** afirmou continua na lista como "incerto" | testes de conciliação (lista explícita, extração parcial, troca de agente, reabertura, nova versão com prorrogação) |

O mesmo defeito aparecia em outros campos e foi corrigido pela mesma regra. O FAQ respondia
"Local de inscrição não informado" e "Público-alvo conforme o edital", embora o texto trouxesse
"pelo sistema eletrônico da instituição" e os requisitos.

Depois da correção (navegador, IA simulada com a saída observada):
[checklist](revisao-final/depois-checklist.png) ·
[chat e FAQ](revisao-final/depois-chat.png) ·
[visão rápida](revisao-final/depois-visao-rapida.png).

**Limite.** A conferência é por palavras, sem compreensão do texto. Um item reescrito com outras
palavras pode ficar como "desconhecido" (falso alarme), e um qualificador fora da lista
(foto, assinatura, autenticação, firma, cartório, original, cópia, impresso, colorido, frente e verso,
emissão recente, timbrado, Correios) não é detectado. Na dúvida, o sistema pede conferência; ele não
afirma a exigência.

## 2. Matriz de páginas e funções

Formato pedido: Função → entrada → ação → resultado → persistência → permissão → teste → situação.
Legenda:

- **V** = visitante, **U** = usuário logado, **A** = administrador.
- Testes: **T** = `e2e-testar`, **D** = `e2e-docente`, **J** = `e2e-jornadas`, **R** = `e2e-regressao`, **S** = `e2e-responsivo`, **API** = vitest.
- Todas as 40 rotas passaram por **S** em 12 viewports.

A matriz completa por ação, com endpoint e tabela, está em [`matriz-funcional.md`](matriz-funcional.md).

| Página | Função | Entrada | Ação | Resultado | Persistência | Permissão | Teste | Situação |
|---|---|---|---|---|---|---|---|---|
| `/testar` | Analisar edital | texto, URL ou PDF | Analisar | etapas reais; resultado com trechos; parcial ou contingência rotulados | navegador (V) ou `agent_results` (U) | V/U | T, R, API | ✅ (IA real: produção 22/11, edital fictício) |
| `/testar` | Checklist | análise | aba Checklist | item com origem, trecho e "não confirmado" | junto da análise | V/U | R | ✅ |
| `/testar` | Prazo / visão rápida / chat automático / FAQ | análise | abrir ou perguntar | mesmo prazo e mesmos documentos em todos | — | V/U | R | ✅ |
| `/testar` | Chat com IA | pergunta | Perguntar | resposta com os fatos conferidos no topo do contexto; falha → resposta automática rotulada | `chat_messages` | U | API (contexto) | 🟡 resposta real da IA não exercitada nos testes (provedores bloqueados de propósito) |
| `/testar` | Exportar PDF | análise | Exportar | prazo, documentos com origem e pendências conciliadas | arquivo local | V/U | T, R | ✅ |
| `/testar` | Ler PDF | arquivo | enviar | texto, não-PDF, protegido, escaneado; leitor baixado só nessa hora | — | V/U | T | ✅ |
| `/historico` | Reabrir | registro | clicar | mesmo resultado e mesmos fatos | idem | V/U | T, R | ✅ |
| `/oportunidades` | Catálogo | filtros (URL) | buscar | lista ou **motivo real do vazio** (nunca coletado, coletando, coleta falhou, coleta sem itens) | `opportunities` | V/U | D, API | ✅ código; em produção o catálogo está vazio (seção 3) |
| `/oportunidades/:id` | Detalhe, salvar, interesse, Quero participar | — | botões | campos com trecho e versões | `saved_opportunities`, `participations` | V/U | D, J | ✅ |
| `/inicio`, `/recomendacoes`, `/salvos`, `/avisos` | Painel e recomendação explicada | perfil | abrir, feedback, salvar, marcar lido | 4 partes da recomendação; impedimento separado | `recommendations`, `notifications` | U | D | ✅ (catálogo de teste) |
| `/perfil` | Perfil progressivo e importação Lattes | campos ou JSON | salvar / prévia → importar | origem e versão por campo | `teacher_profiles` | U | D, J | ✅ |
| `/participar`, `/participar/:id` | Espaço de participação | — | marcar, salvar, proposta | conflito entre abas avisado; isolamento entre usuários | `participations` | U (dono) | J, R | ✅ |
| `/configuracoes` | Links, baixar e excluir dados, encerrar conta | — | botões com confirmação | exclusão parcial informada | várias | U | J, R | ✅ |
| `/admin` | Fonte, coleta, revisão, importação, comparação | — | botões | execução registrada; usuário comum recebe 403 | `collection_runs`… | A | D | ✅ com fixtures; ⛔ coleta real (seção 3) |
| `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/verificacao` | Conta | formulário | enviar | erros nos campos, envio único, sessão expirada | Supabase Auth | V | D | ✅ (Auth de teste) |
| `/niasci/*` | e-Lattes, artigos, projetos, planetário, assistente | texto ou PDF | analisar | resultado salvo na conta; falha avisada | tabelas próprias | U | R (projetos), API | 🟡 IA real só conferida em produção, sem testes automatizados |
| `/compartilhado/:token` | Link somente leitura | token | abrir | sem dados do dono; revogável | `shared_results` | V | J | ✅ |
| `/`, `/aprender`, `/glossario`, `/faq`, `/sobre`, `/tecnologias`, `/impacto-social`, `/como-funciona`, `/planos`, `/contato`, `/privacidade`, 404 | Conteúdo | — | navegar | — | — | V | S, J | ✅ (`/contato` abre o e-mail, não envia) |
| `/dashboard`, `/timeline` | Painéis antigos | — | abrir | — | — | U | S | 🟡 só carregamento, sem erro, testado |

**Estados cobertos.**

| Estado | Onde foi testado |
|---|---|
| carregando | T |
| vazio | D, catálogo novo |
| sucesso | todos |
| erro de IA | T (contingência) |
| erro de banco | T ("não foi salva") |
| erro de rede/URL | T |
| cliques repetidos | T |
| sessão expirada | T, D |
| recarregar e retomar | T, R, J |
| troca de documento | T |
| dois usuários isolados | T, J, R |
| usuário comum × admin | D |
| links e menus | S, J |
| abas | R |
| modais com Escape e retorno do foco | S (menu), T (visão rápida) |

## 3. Catálogo real — situação e bloqueio exato

Produção, consulta somente leitura em 22/11 às 02h UTC:

| Item | Situação |
|---|---|
| `opportunities` | **0** |
| `opportunity_documents` | **0** |
| `collection_runs` | **0** — nenhuma coleta jamais executada |
| Fonte `fapdf` | ativa, frequência de 1440 min, `start_urls = https://www.fap.df.gov.br/editais/` |
| Leitura real da fonte (pela função de produção em São Paulo) | a página inicial é lida. **`/editais/` responde 404.** `/editais-2026` existe, mas é um portal Liferay montado por JavaScript: o HTML traz só 113 caracteres ("Por favor, selecione uma ferramenta…"). Deste ambiente, o site recusa a conexão TLS |
| Agendador | `/api/cron/collect` responde 401 sem segredo, o que indica `CRON_SECRET` configurado. A primeira execução agendada (09:17 UTC) ainda não deixou registro |

A cadeia fonte → documento → oportunidade → banco → tela → recomendação explicada está provada
**só em ambiente de teste**, com fixtures fictícias (D, J). Em produção ela está bloqueada na
primeira etapa: o endereço da fonte.

O que mudou nesta revisão: o catálogo agora diz **por que** está vazio. Em produção mostrará
"Catálogo ainda não coletado"; depois da primeira execução com falha, mostrará "A última coleta
falhou", com o motivo sem a URL.

Para destravar (exige autorização, porque grava em produção):

1. Em um navegador, abrir `https://www.fap.df.gov.br/editais-2026`, abrir as ferramentas de rede
   e anotar de onde vêm os editais (Documentos e Mídia do Liferay, um "Publicador de Conteúdos"
   ou links para PDFs).
2. Em `/admin → Fonte`, trocar `start_urls` por uma página com links diretos para os editais.
   A página inicial `https://www.fap.df.gov.br/` com profundidade 2 é uma opção a testar.
3. Clicar em "Executar coleta agora" e conferir em **Execuções** o número de páginas, documentos
   e falhas.
4. Revisar e aprovar os editais coletados.

Se a lista só existir via JavaScript, o coletor precisará ler a API do Liferay. Isso é uma mudança
de código que depende do passo 1.

## 4. Responsividade e acessibilidade

`scripts/e2e-responsivo.mjs`, agora dentro de `run-all.sh` e do CI, cobre **40 rotas × 12 viewports = 480 combinações**:

| Viewport | Retrato | Paisagem |
|---|---|---|
| Celular 320 | 320×568 | 568×320 |
| Celular 360 | 360×740 | 740×360 |
| Celular 390 | 390×844 | 844×390 |
| Tablet 768 | 768×1024 | 1024×768 |
| Tablet 1024 | 1024×1366 | 1366×1024 |
| Computador 1440 | 900×1440 | 1440×900 |

As 480 combinações passaram sem rolagem horizontal e sem erro de página. O axe
(WCAG 2.0/2.1/2.2 A e AA) foi rodado em 390 retrato e 1440 paisagem: **0 violações** depois das
correções.

Achados corrigidos nesta revisão:

- **Menu do celular não fechava com Escape**, em todas as larguras abaixo de 1280 px. Agora fecha e devolve o foco ao botão.
- **Tabelas roláveis sem foco de teclado** em `/privacidade` e `/admin` (axe: `scrollable-region-focusable`). Agora são regiões rotuladas e focáveis.

Emulação no Chromium headless **não é teste em aparelho**. **Não houve teste em Android ou iOS
físico.** Teclado virtual, envio e download no Android, zoom real e leitores de tela (NVDA,
TalkBack, VoiceOver) continuam pendentes.

Pendências de acessibilidade que dependem de pessoas: conteúdo em Libras, legendas e transcrição
dos vídeos (se houver vídeos), e validação com usuários com deficiência. O axe e esta varredura
**não comprovam conformidade integral** com a WCAG.

## 5. Desempenho (medido)

Medição no Chromium headless, rede local, sem cache; JS transferido por rota:

| Rota | Antes | Depois |
|---|---|---|
| `/testar` | 1096 KB | **712 KB** — leitor de PDF (pdf.js + OCR, 515 KB) só baixa quando um PDF é enviado |
| `/niasci/elattes`, `/niasci/artigos` | carga estática do leitor | sob demanda |
| `/dashboard` | 979 KB | igual (gráficos; página antiga, pouco usada) — pendente |
| Pacote inicial comum | 570 KB (170 KB gzip) | igual (React, Supabase, Radix, framer-motion) — pendente |

Outros resultados:

- **Memória:** o documento do pdf.js nunca era liberado. Agora `loadingTask.destroy()` roda ao fim, com sucesso ou com erro.
- **Workers:** o worker do OCR já era encerrado (`terminate`).
- **Servidor:** com o índice, a conferência de fatos num edital de 440 mil caracteres e 60 itens caiu de **2,9 s para 0,15 s**. Há um teste com limite de 1,5 s.
- **Exportação:** jsPDF já era carregado sob demanda.

## 6. Segurança e operação — evidência × documentação

| Item | Evidência verificada | Situação |
|---|---|---|
| Correções anteriores (SSRF com DNS rebinding, PDF isolado, limites compartilhados, telemetria, RLS) | 538 testes da API passando, inclusive SSRF com resolução controlada e servidor local | ✅ preservadas |
| Dependências | `pnpm audit --prod`: 0. Ferramentas de desenvolvimento: 2 moderadas, com exceção justificada | ✅ |
| RLS | 0 tabelas públicas sem RLS (produção, leitura) | ✅ |
| Migrações | 15 no repositório = 15 aplicadas (mesmas versões) | ✅ |
| Cabeçalhos HTTP | HSTS, CSP (frame-ancestors, object-src, base-uri, form-action), X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy presentes | ✅ |
| **MFA de administrador** | 1 administrador, **0 fatores MFA verificados**; o LUPA não tem tela de cadastro de MFA | ⛔ pendente |
| **Backup ativo** | API do Supabase: `backups: []`, `pitr_enabled: false`. O workflow `backup.yml` é só manual, e sua execução não foi confirmada | ⛔ pendente; restauração testada só no banco local de desenvolvimento |
| Retenção, canal de solicitações de titulares, fornecedores | documentados em `docs/privacidade/` e `docs/operacao/` | 🟡 documentação preparada, **operação não verificada** |
| Testes isolados | provedores de IA simulados; navegador bloqueia hosts externos (`isolate.mjs`); nenhum dado real enviado a Google, Groq ou OpenAI nos testes | ✅ |

Isto **não** declara conformidade integral com a LGPD nem segurança absoluta.

## 7. Resultados dos testes (22/11/2026, nesta branch)

| Verificação | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | ok, lockfile atualizado só com vitest no frontend |
| `pnpm -r typecheck` | ok |
| API (vitest) | 41 arquivos, 538 testes passando, 5 ignorados (dependem de Postgres externo) |
| Frontend (vitest; antes não rodava em lugar nenhum, agora roda no CI) | 11 testes passando |
| Build de produção | ok |
| E2E `e2e-testar` | 17/17 |
| E2E `e2e-docente` | 23/23 |
| E2E `e2e-jornadas` | 11/11 (com axe) |
| E2E `e2e-regressao` | 8/8, inclusive R1–R3 de fidelidade |
| E2E `e2e-responsivo` | 480/480 combinações; axe com 0 violações |
| `pnpm audit --prod` | 0 vulnerabilidades |

Ambiente: Linux, Chromium headless do Playwright, emulação de toque e de viewport. Firefox, Safari
e aparelhos físicos não foram testados.

## 8. Pendências externas e riscos, por prioridade

| Prioridade | Item | Quem resolve |
|---|---|---|
| **Alta** | Catálogo vazio em produção: URL da fonte com 404 e lista montada por JavaScript (seção 3) | Administração: decidir a URL (passo 1). Gravar em produção exige autorização |
| **Alta** | MFA do administrador inexistente | Supabase (ativar MFA) + tela de cadastro de fator, a desenvolver |
| **Alta** | Sem backup automático (sem PITR; workflow manual nunca executado) | Responsável pela infraestrutura: plano com backup ou execução agendada do `backup.yml` com segredo |
| Média | Conferência de exigências por palavras (falsos alarmes ou qualificadores fora da lista) | Melhoria contínua; casos novos viram teste |
| Média | Chat com IA real e ferramentas NIASci sem teste automatizado da resposta real | Teste de integração separado, com chave de teste e dados fictícios |
| Média | Sem teste em Android ou iOS físico, nem com leitor de tela | Equipe, com aparelhos |
| Média | Pacote inicial de 170 KB gzip; `/dashboard` com gráficos pesados | Próxima rodada de desempenho |
| Baixa | Libras, legendas e transcrição; validação com pessoas com deficiência | Equipe de acessibilidade |
