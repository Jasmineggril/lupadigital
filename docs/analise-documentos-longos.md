# Leitura completa de documentos longos (22/11/2026)

**Problema.** Um documento de 562.044 caracteres era recusado pelo limite de 450.000. Mesmo
abaixo desse limite, editais acima de ~60 mil caracteres podiam terminar **parciais** na Vercel,
porque uma requisição dura no máximo 300 s e o provedor gratuito libera ~8.000 tokens por minuto.

**Solução.** O limite não foi apenas aumentado. Documentos acima de 45 mil caracteres passam a
ser lidos **por inteiro em segundo plano**, numa tarefa com estado no banco:

1. o documento é dividido em partes;
2. as partes são lidas em várias etapas curtas;
3. cada parte concluída é gravada na hora;
4. ao final, tudo é consolidado numa única análise.

## 1. Como funciona

```
navegador ──POST /edital/jobs──▶ divide (plan.ts) ──▶ analysis_jobs + analysis_job_chunks (Supabase)
    │                                                        ▲
    └─POST /edital/jobs/:id/advance (repetido) ──▶ reserva atômica ──▶ lê partes até o tempo da etapa
                                                    (analysis_job_claim)   grava cada parte concluída
                                                                          ▼
                                       todas as partes com desfecho ──▶ consolida ──▶ base + fatos (texto INTEIRO)
                                                                          ▼
                                       resultado único: resumo, checklist, cronograma, elegibilidade, chat, PDF
```

| Requisito | Como foi atendido | Onde |
|---|---|---|
| Dividir por seção e página, sem perda | Corte preferencial em marcador de página e em título (CAPÍTULO, ANEXO, CLÁUSULA, item numerado), depois parágrafo, depois linha. Cada parte tem intervalo `[início, fim)`. **Invariante verificada:** as partes são contíguas e cobrem 100% do texto (`assertCoverage`). O texto juntado é idêntico ao original. Cada parte tem um hash sha256 | `lib/longdoc/plan.ts` |
| Sobreposição controlada | Até 1.200 caracteres do fim da parte anterior, marcados no prompt como **CONTEXTO, não extrair**. O chunker antigo prefixava o próprio fim da parte a ela mesma, duplicando texto | `chunkPromptText` |
| Nada descartado em silêncio | O limpador antigo apagava linhas com até 2 caracteres (células de tabela) e linhas repetidas. Para documentos longos, isso não é mais feito (teste: `normalizeLongText`) | `plan.ts` |
| Ler todas as partes antes de dizer "completa" | `complete: true` só quando **todas** as partes estão concluídas. Com qualquer falha, o resultado é `parcial`, com as partes e páginas não lidas | `jobs.ts`, `consolidate.ts` |
| Consolidar sem duplicar | Fatos iguais viram um só. A lista `documento_longo.requisitos` e `.documentos` guarda **todas** as partes e páginas de origem de cada item | `consolidate.ts` |
| Conflitos explícitos | A mesma data com valores diferentes em partes diferentes aparece em `documento_longo.conflitos`, com as duas versões, a parte e a página | `consolidate.ts` |
| Exceções e retificações | Exceção, dispensa, retificação, prorrogação e revogação ficam em `documento_longo.alteracoes`, com a parte e a página. O prazo oficial é calculado no **texto inteiro** pela regra única de prazos, e a prorrogação no último anexo prevalece | `consolidate.ts`, `analysisFacts.ts` |
| Execução durável | Estado no Postgres. A reserva é atômica: um processador por vez, e uma reserva vencida é retomada. Se a função for encerrada, perde-se no máximo a parte em andamento | `store.ts`, migração `20261129` |
| Retomar após atualizar a página | O navegador lembra a tarefa e também consulta `GET /edital/jobs`. O painel volta com o andamento do servidor | `testar.tsx` |
| Concorrência, novas tentativas, cancelamento | Concorrência configurável (padrão 1, máximo 4). Até 3 tentativas por parte, com espera crescente. A cota do provedor (429) **não gasta tentativa** e pausa a tarefa até o horário informado pelo provedor. Cancelar apaga o documento | `jobs.ts` |
| Reprocessar só o que falhou | `retry-failed` volta para a fila **apenas** as partes com falha. As concluídas não são lidas de novo (verificado por contagem de chamadas) | `jobs.ts` |
| Documento protegido | Só o dono vê ou mexe na tarefa (404 para outra pessoa). RLS permite só SELECT do próprio dono. Escrita apenas pelo servidor | migração, rotas |
| Retenção | O texto é apagado **ao concluir** e **ao cancelar**. Numa tarefa parcial, fica até 7 dias (`expires_at`) para permitir reprocessar e depois é apagado | `jobs.ts`, `purgeExpired` |
| Progresso real | "X de Y partes analisadas · F com falha · agora: parte N (p. a–b)". A barra mostra a fração de partes lidas informada pelo servidor; não há cronômetro. Mostra separadamente "documento recebido" e "efetivamente analisado", o consumo de tokens e as páginas não lidas | `LongDocProgress.tsx` |
| Não obrigar a escolher trechos | Acima de 450 mil caracteres, `/edital/analyze` responde `USAR_ANALISE_LONGA`. Nenhuma mensagem pede para cortar o documento | rotas, `testar.tsx` |
| Uma análise para todas as telas | O resultado da tarefa tem a mesma forma das análises curtas e passa pelo mesmo enriquecimento (`lib/analysisEnrich.ts`). O histórico da conta agora **salva a análise do servidor como está**: antes, ele a reconstruía e descartava `fatos` | `analysisEnrich.ts`, `edital.ts` |
| "Não encontrado" ≠ "não existe" | Numa análise parcial, cada campo "não localizado" ganha o aviso "N parte(s) não foram lidas pela IA; o item pode estar nelas" | `jobs.ts` |

## 2. Limites (efetivos e configuráveis)

Os valores são lidos por variável de ambiente e expostos em `GET /api/edital/limits`.

| Limite | Valor | Origem |
|---|---|---|
| Texto extraído por tarefa | **1.200.000 caracteres** (`LONGDOC_MAX_CHARS`) | configuração |
| Análise direta numa requisição | até 45.000 caracteres para quem está logado; até 450.000 para visitantes (`LONGDOC_SYNC_MAX_CHARS`, `MAX_ANALYZE_CHARS`) | configuração |
| Requisição HTTP (Express) | 10 MB. 1 milhão de caracteres em JSON ≈ 1,1 MB | código (`app.ts`) |
| Requisição HTTP (Vercel) | **não verificado** nesta sessão: a documentação da Vercel não é acessível daqui. O valor conhecido é 4,5 MB, a confirmar | dependência |
| Arquivo PDF | 20 MB (navegador e servidor) | código |
| Páginas | camada de texto: **todas** as páginas. OCR de PDF escaneado no navegador: **25 páginas**. Acima disso, a tela e o próprio texto avisam quais páginas não foram lidas (antes, o corte era silencioso) | código |
| Tamanho da parte | 14.000 caracteres (alvo; máximo 1,15×), mais 1.200 de contexto | configuração |
| Tokens por tarefa | 700.000 estimados (`LONGDOC_MAX_JOB_TOKENS`); acima disso, 413 com explicação | configuração |
| Tarefas | 1 ativa por pessoa; 5 por dia | configuração |
| Tempo por etapa | 200 s (abaixo dos 300 s de `maxDuration` da Vercel) | configuração + `vercel.json` |
| Tempo por parte | 90 s | configuração |
| Cota de IA (custo) | cada "avançar" passa pelo `costGuard("ai")`: 60/h e 300/dia por pessoa, orçamento global de 5 milhões de tokens/dia. Os tokens de cada parte entram no orçamento global | código |
| Provedor (Groq, `gpt-oss-120b`) | **8.000 tokens/minuto, medido** (resposta 413 "Limit 8000", 21/11). Limite diário: **não verificado** (docs inacessíveis daqui). O sistema lê a mensagem 429 do provedor ("tokens per day", "try again in 7m12s") e pausa a tarefa até o horário indicado | medição + dependência |

## 3. Capacidade efetivamente testada

| Teste | Tamanho | Partes | Resultado | Duração |
|---|---|---|---|---|
| Unidade: divisão | 562.045 e 1.000.000+ caracteres | 50 / 90 | 100% de cobertura; texto juntado idêntico ao original; cada marcador do início, meio e fim em exatamente uma parte; hash conferido | < 50 ms |
| Unidade: tarefa completa, IA **simulada** | 1.000.246 caracteres | 90 | concluída; cada parte lida **uma vez**; TAI-INICIO, PGD-MEIO e DCE-FIM no checklist; REQ-INICIO e REQ-FIM nos requisitos; exceção EXC-TAI listada; conflito 31/03 × 30/04 explícito; prazo oficial 30/04/2027 (prorrogado); documento apagado ao concluir; resultado de 92 KB sem o texto original | 0,6 s (processamento local) |
| API HTTP real (JWT, banco de teste) | 1.000.000+ caracteres | 90 | aceito, concluído, DCE-FIM presente; outra pessoa recebe 404 | 0,7 s |
| Navegador (Chromium) | 600.685 caracteres | 55 | concluída; início, meio e fim no checklist; visão rápida e chat com 30/04/2027 | 6 s |
| Navegador: falha e retomada | 1.000.552 caracteres, 275 páginas marcadas | 89 | página atualizada no meio → retomou do servidor sem perder partes; parte 35 (p. 109–111) falhou 3× → **parcial**, com "Análise incompleta"; "Reprocessar" → concluída | 22 s |
| Postgres 16 real | — | — | 20 conexões disputando a mesma tarefa → **1** reserva; reserva vencida retomada; cancelada não é reservada; papel `authenticated` não executa a função; RLS: 20/20 tabelas isoladas | — |

**O que os números NÃO provam.** Todas as durações acima usam a IA **simulada**, que só extrai
fatos da parte recebida (por isso um fato no resultado prova que aquela parte foi enviada). Nenhum
documento foi enviado a um provedor real: os testes bloqueiam provedores externos, e este ambiente
não tem chave.

**Duração e consumo previstos com o provedor real.** Cálculo com as reservas do código, para o
edital fictício:

| Documento | Partes | Tokens de entrada (estim.) | 8.000 TPM (Groq grátis, medido) | 30.000 TPM | 250.000 TPM |
|---|---|---|---|---|---|
| 562.045 caracteres | 50 | ~152 mil (≈188 mil reais) | ≈ 40 min | ≈ 11 min | ≈ 1 min |
| 1.000.000 caracteres | 90 | ~272 mil (≈335 mil reais) | ≈ 71 min | ≈ 19 min | ≈ 2 min |

Consumo total por documento de 1 milhão de caracteres: **cerca de 400–520 mil tokens** (entrada
mais saída). Se a cota **diária** do plano gratuito for menor, a tarefa fica em "Aguardando a cota
do provedor" e continua sozinha no dia seguinte, sem perder o que já foi lido. Isso é comportamento
testado com um 429 simulado, não uma medição no provedor.

## 4. Dependências de infraestrutura (exatas)

1. **Migração `supabase/migrations/20261129_analises_longas.sql`.** Testada em Postgres 16 local
   (aplicação, idempotência, RLS e reserva). Em produção, ela entra pela integração
   GitHub → Supabase **ao mesclar na main**, o que exige autorização. Sem ela, as rotas de tarefa
   respondem 503 ("não foi possível acessar a análise agora").
2. **Avançar com a página fechada.** Na Vercel, a função só existe durante uma requisição: sem
   agendador, a leitura **avança enquanto a página está aberta**, e a tela diz isso. Para processar
   com a página fechada, uma de duas opções:
   - **Supabase (pg_cron + pg_net)**, chamando a cada minuto:
     ```sql
     select cron.schedule('lupa-analises-longas', '* * * * *', $$
       select net.http_post(
         url := 'https://lupa-digital.vercel.app/api/cron/analysis-jobs',
         headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
       ) $$);
     ```
     Exige habilitar as extensões e guardar o segredo no banco: é uma alteração de produção e
     precisa de autorização. Depois, defina `LONGDOC_SCHEDULER=1` na Vercel, para a tela informar
     que a leitura continua com a página fechada.
   - **Servidor próprio (CIIA):** `LONGDOC_WORKER=1`. O laço interno avança as tarefas a cada 30 s.
   - O cron da própria Vercel no plano Hobby roda só 1×/dia (informação **não verificada** nesta
     sessão): não serve para isto.
3. **Armazenamento via PostgREST (`SupabaseJobStore`).** Não foi executado contra um PostgREST
   real: a instalação do PostgREST foi bloqueada pela política de permissões deste ambiente. A
   reserva e o RLS foram provados direto no Postgres, e as consultas seguem o mesmo padrão do
   restante do repositório. **Antes de liberar em produção, rode uma análise longa num projeto
   Supabase de desenvolvimento.**
4. **Limites do provedor e da Vercel** (seção 2): confirmar na documentação oficial, inacessível
   daqui.

## 5. Limitações conhecidas

- A conferência de exigências e a detecção de conflitos dependem do que a IA extrai de cada parte.
  Conflitos são detectados por **data com o mesmo evento**. Requisitos contraditórios escritos de
  formas diferentes não são casados automaticamente; ficam listados com as partes de origem.
- Páginas só são citadas quando o texto tem marcadores ("[Página N]", "Página N" ou quebra de
  página). Texto colado sem marcadores é referenciado por parte e por intervalo de caracteres.
- Colar 1 milhão de caracteres na caixa de texto depende do navegador. A edição simulada do
  Playwright ficou quadrática no Chromium; o carregamento direto (como o de um PDF) levou 0,6 s.
  Para documentos desse porte, o caminho recomendado é enviar o PDF.
- Visitantes sem conta: a análise direta continua até 450 mil caracteres. Acima disso, ou para ler
  tudo em segundo plano, é preciso entrar (o andamento fica guardado na conta).
