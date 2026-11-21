# LUPA Digital no servidor da CIIA — guia de implantação

O LUPA continua publicado na **Vercel** (`lupa-digital.vercel.app`). Este pacote sobe uma **segunda
cópia** no servidor da CIIA. Os dois podem usar o **mesmo banco e as mesmas contas** (Supabase), ou
um banco separado — ver "Decisões" abaixo.

Testado em 21/11/2026 com Docker 29 (imagens construídas e executadas, site e `/api` respondendo pelo
Caddy, cabeçalhos de segurança, sistema de arquivos só leitura, usuário sem privilégio, leitura de PDF
dentro do contêiner). **Ainda não foi testado no servidor da CIIA nem com o Supabase real.**

## O que é preciso no servidor

- Linux com **Docker** e **Docker Compose** (plugin `docker compose`).
- 2 GB de RAM (1 GB para a API + o resto), 5 GB de disco.
- Saída para a internet: Supabase (`*.supabase.co`), Groq (`api.groq.com`), sites oficiais da coleta
  (`www.fap.df.gov.br`) e, se usar OCR no servidor, Google/OpenAI.
- Um **domínio** apontando para o servidor (ex.: `lupa.ciia.exemplo.br`) e as portas **80 e 443**
  abertas — o Caddy tira e renova o certificado HTTPS sozinho.
  Se a universidade já tem um proxy que faz HTTPS, veja "Atrás de outro proxy".

## Decisões (antes de subir)

1. **Mesmo banco da Vercel ou separado?**
   - *Mesmo banco* (recomendado para ter um site só, em dois endereços): copie as variáveis do Supabase
     que estão na Vercel. As contas, dados e limites de uso são os mesmos nos dois.
     **Não ligue** `LUPA_RUN_MIGRATIONS_ON_START` — quem aplica mudanças no banco é a integração
     GitHub → Supabase.
   - *Separado* (ex.: ambiente da CIIA independente): crie outro projeto no Supabase, aplique as
     migrações de `supabase/migrations/` em ordem e use as chaves desse projeto.
2. **Chave de IA:** a mesma da Vercel divide custo e cota; uma própria separa a conta.
3. **Coleta automática:** a Vercel já coleta uma vez por dia. Deixe `CRON_SECRET` vazio aqui para não
   duplicar (se duplicar, nada quebra — a coleta não roda duas vezes no mesmo dia —, só gasta acesso à toa).

## Passo a passo

```bash
git clone https://github.com/Jasmineggril/lupadigital.git && cd lupadigital
cp deploy/ciia/.env.example deploy/ciia/.env
nano deploy/ciia/.env          # preencher (ver tabela abaixo)
docker compose -f deploy/ciia/docker-compose.yml --env-file deploy/ciia/.env up -d --build
docker compose -f deploy/ciia/docker-compose.yml ps        # "api" deve ficar healthy
curl -fsS https://SEU-DOMINIO/api/healthz
curl -fsS https://SEU-DOMINIO/api/readyz/deep             # banco e IA: ok
```

| Variável | De onde vem |
|---|---|
| `DOMAIN` | domínio do servidor (ex.: `lupa.ciia.exemplo.br`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (URL e chave **anon/publishable**) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | mesmo lugar; a **service_role/secret** é SECRETA |
| `SUPABASE_JWKS_URL` | `https://<projeto>.supabase.co/auth/v1/.well-known/jwks.json` |
| `GROQ_API_KEY` | console da Groq (ou a mesma da Vercel) |

O arquivo `.env` tem segredos: permissão `chmod 600`, nunca no Git, nunca por e-mail/chat.

## Depois de subir (no painel do Supabase)

- **Authentication → URL Configuration → Redirect URLs**: acrescentar `https://SEU-DOMINIO/**`.
  Sem isso, os links de confirmação de cadastro e de recuperação de senha levam para a Vercel.
- Conferir no site: abrir `/`, `/testar`, entrar com uma conta, analisar um texto curto.

## Atualizar para uma versão nova

```bash
cd lupadigital && git pull
docker compose -f deploy/ciia/docker-compose.yml --env-file deploy/ciia/.env up -d --build
```
Atualize sempre a partir da `main` (a mesma versão da Vercel), para o código bater com o banco.

## Operação

- **Reinício automático:** `restart: unless-stopped`. Em erro grave a API encerra de forma controlada
  (código 1) e o Docker sobe de novo — é proposital.
- **Logs:** `docker compose -f deploy/ciia/docker-compose.yml logs -f api` (sem senhas nem tokens).
- **Reinício do servidor:** o Docker precisa iniciar com o sistema (`systemctl enable docker`).
- **Backup:** o banco é o Supabase; o backup é o mesmo do site da Vercel (ver
  `docs/operacao/seguranca-e-recuperacao.md`). O servidor da CIIA não guarda dados próprios.
- **Atualizações de segurança:** do sistema operacional e do Docker, pela equipe da CIIA.

## Atrás de outro proxy da instituição

Se o HTTPS é feito por um proxy da universidade que encaminha para este servidor:
`DOMAIN=:80`, publique só a porta 80 para esse proxy e use `LUPA_TRUST_PROXY_HOPS=2`
(para os limites de uso enxergarem o IP real de quem acessa).
