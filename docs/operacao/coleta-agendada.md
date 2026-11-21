# Coleta automática diária (Vercel Cron)

**O que faz:** uma vez por dia, às **06:17 (horário de Brasília)** = `17 9 * * *` em UTC, a Vercel chama
`GET /api/cron/collect`. Para cada fonte **ativa**, a coleta roda só se a última execução que não falhou
começou há mais tempo que a frequência cadastrada (`frequency_minutes`, padrão 1 dia, com 10 min de folga).
Coletas manuais recentes contam: se o administrador coletou de manhã, a automática do dia seguinte é que roda.

## Como ligar (uma vez)
1. Na Vercel: **Project → Settings → Environment Variables** → criar `CRON_SECRET` (ambiente *Production*)
   com um valor aleatório de **pelo menos 32 caracteres** (ex.: `openssl rand -hex 32`). Não colocar em
   código, chat nem issue.
2. Fazer um novo deploy de produção (a variável só vale a partir do próximo deploy).
3. Conferir em **Administração → Situação das integrações → Coleta automática: ativa**.

A Vercel envia `Authorization: Bearer <CRON_SECRET>` sozinha quando a variável existe.

## Segurança
- Sem `CRON_SECRET` (ou com menos de 32 caracteres) a rota responde **503 e não coleta**: nunca fica aberta.
- Segredo errado → 401. O segredo do Hermes não serve aqui (e vice-versa).
- Usa a mesma proteção da coleta manual: só os domínios oficiais da fonte, limites de páginas, tempo e tamanho.

## Onde ver o resultado
- **Administração → Execuções**: origem "automática".
- Logs da função na Vercel: linha `coleta agendada` com o resultado por fonte (sem o segredo).
- Execução que ficou "em andamento" por mais de 30 min (função interrompida) é encerrada como falha na
  próxima chamada, para não bloquear a fonte.

## Limites conhecidos
- No plano Hobby da Vercel, o horário pode variar dentro da hora; por isso a folga de 10 min.
- Ainda **não verificado** em produção: se o servidor da Vercel consegue acessar o site da FAPDF (daqui do
  ambiente de desenvolvimento a conexão é recusada pelo site). Se falhar, o erro aparece em Execuções.
