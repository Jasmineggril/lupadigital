# Operação: limites, erros fatais, PDF, backup, restauração e administração

Estado: **corrigido no código e testado localmente**, salvo onde indicado. Nada aqui foi verificado em
produção, exceto as leituras marcadas "verificado em produção (leitura)".

## 1. Limites de uso e custo (lib/limits/shared.ts, migração 20261127)

Duas camadas: (1) limitadores por minuto na memória de cada instância (rajadas); (2) cotas
**compartilhadas** no Postgres (funções `rate_hit`, `limit_acquire`), que valem para todas as
instâncias e sobrevivem a reinícios.

| Variável | Padrão | O quê |
|---|---|---|
| `AI_USER_PER_HOUR` / `AI_USER_PER_DAY` | 60 / 300 | análises de IA por pessoa logada |
| `AI_ANON_PER_HOUR` / `AI_ANON_PER_DAY` | 10 (ou `RATE_LIMIT_AI_ANON_PER_HOUR`) / 30 | visitante, por IP (/56 em IPv6) |
| `AI_GLOBAL_PER_DAY` | 3000 | teto de chamadas de IA do LUPA inteiro |
| `AI_TOKENS_GLOBAL_PER_DAY` | 5 000 000 | orçamento diário de tokens (somado ao registrar o consumo) |
| `AI_CONCURRENT_PER_KEY` / `AI_CONCURRENT_GLOBAL` | 2 / 20 | análises simultâneas (vaga expira em `AI_CONCURRENT_TTL_SECONDS`=180) |
| `OCR_*` | análogos (60/200/30/60/2000, 2/10) | OCR e leitura de URL |
| `LIMITS_FAIL_OPEN` | (vazio) | `true` deixa passar se o banco dos limites falhar — **risco de custo**; padrão é recusar com 503 |

Resposta 429: `Retry-After` + `{ code: "LIMIT", scope, retry_after_s, error }`. Os valores padrão são
proposta técnica; ajustar com o custo real do provedor.

**IP real**: `trust proxy = 1`. Na Vercel o cliente não escolhe o último salto do `X-Forwarded-For`
(teste cobre um XFF forjado à esquerda). Comportamento da Vercel conferido pela documentação, **não em produção**.

## 2. Erro fatal (servidor persistente — `src/index.ts`, `lib/lifecycle.ts`)

- `uncaughtException` e rejeições não transitórias → registro mínimo, Sentry (se configurado), 503 para
  novas requisições, fechamento do servidor, saída com código 1 em até 10 s.
- **O processo precisa de supervisor que reinicie** (systemd `Restart=always`, Docker `restart: unless-stopped`,
  PM2). Sem supervisor, a saída derruba o serviço — é o comportamento correto, mas exige o supervisor.
- **Vercel (produção atual)**: a função serverless não instala esses tratadores; a plataforma recicla a
  instância. Não há servidor próprio para fechar.

## 3. PDF (lib/pdf/)

Worker isolado (pdf.js 6.5): 20 s, 256 MB, 120 páginas, 12 mil caracteres/página, 2 simultâneos + 6 na
fila. Tempo-limite **encerra** o worker. Conteúdo cortado → status `parcial`. Falha temporária →
`erro`, tentado de novo só na próxima coleta (sem retentativa automática).
Na Vercel o worker é `api/_pdf-worker.mjs` (incluído por `vercel.json` → `includeFiles`);
`scripts/check-serverless.mjs` prova que ele carrega sozinho.

## 4. Backup

**Verificado em produção (leitura, API do Supabase, 21/11/2026): 0 backups disponíveis, PITR desligado.**
Ou seja: hoje **não existe** cópia de segurança do banco. Opções:
1. Plano pago do Supabase com backups diários/PITR (custo do plano — decisão da instituição);
2. Rotina própria (preparada): `scripts/ops/backup.sh` — pg_dump (Postgres 17) + AES-256/PBKDF2 + sha256,
   retenção de 14 arquivos; workflow manual "Backup do banco" (artefato privado, 7 dias).
   Requer secrets `DATABASE_URL` (conexão direta) e `BACKUP_PASSPHRASE` (cofre; quem tem a senha?).
   **Pendente de aprovação**: local de guarda, retenção, quem acessa.

Metas propostas (**pendentes de aprovação**): RPO (perda máxima) 24 h com backup diário; RTO
(tempo para voltar) 4 h.

## 5. Restauração (testar SEMPRE em banco descartável)

```
createdb lupa_restore   # ou projeto Supabase de desenvolvimento
RESTORE_URL=postgres://.../lupa_restore BACKUP_PASSPHRASE=... bash scripts/ops/restore-test.sh lupa-AAAAMMDD.dump.enc
```
Confere sha256, descriptografa, restaura, compara migrações com o repositório, lista tabelas sem RLS e roda
o isolamento A/B. **Testado localmente** (PG16): restauração OK, migrações conferem, 19/19 isoladas.
Restauração em produção: só com decisão registrada, depois de testar o mesmo arquivo em banco descartável.

## 6. Isolamento entre usuários (RLS)

`LUPA_ALLOW_RLS_TEST=sim DATABASE_URL=<banco de dev> node scripts/security/rls-isolation.mjs`
— recusa o projeto de produção. Local: 19/19. **Não executado em Supabase real** (não há projeto de dev).
O servidor usa a chave de serviço (ignora RLS): o isolamento no servidor é por filtro explícito de
`user_id` em cada operação, coberto pelos testes de API (recursos, histórico, participações,
compartilhamento, exportação/exclusão, encerramento de conta).

## 7. Administração

Papel só por `app_metadata.role = "admin"` (Supabase Auth) ou `LUPA_ADMIN_USER_IDS`. `user_metadata` e
campos do perfil não dão acesso (testado). Toda rota `/admin` registrada é testada (401/403).
**MFA**: cadastrar TOTP na conta administradora (Supabase Auth → MFA) e então ligar
`LUPA_ADMIN_REQUIRE_MFA=true` (exige `aal2`). Ligar antes do cadastro bloqueia a própria administração.
