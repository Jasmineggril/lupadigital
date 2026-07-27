# Load Test — LUPA Digital

## Visão Geral

Teste de carga para validar a estabilidade do LUPA Digital em produção.
4 fases progressivas, executadas sequencialmente.

| Fase | Descrição | VUs | Duração | Custo IA |
|------|-----------|-----|---------|----------|
| A | Smoke funcional | 5 | ~2 min | $0.00 |
| B | Endpoints leves | 10 | ~3 min | $0.00 |
| C | IA controlada | 5 | ~5 min | ~$0.02–0.05 |
| D | Documentos longos | 1→3 | ~10 min | ~$0.05–0.15 |

**Custo total estimado: $0.07–0.20**

## Pré-requisitos

### Instalação do k6

```bash
# Windows (WinGet)
winget install k6

# macOS (Homebrew)
brew install k6

# Linux (APT)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Verificação

```bash
k6 version
# Deve mostrar: k6 v0.5x.x
```

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `BASE_URL` | Sim | URL do Preview (ex: `https://lupa-digital-xxxxx.vercel.app`) |
| `TOKEN_READONLY` | Fase A | Token JWT de leitura (usuário comum) |
| `TOKEN_WRITE` | Fase B | Token JWT de escrita (usuário com permissão) |
| `TOKEN_AI` | Fases C, D | Token JWT com acesso ao endpoint de IA |
| `TOKEN_CRUD_1` | Reserva | Token JWT alternativo |
| `TOKEN_CRUD_2` | Reserva | Token JWT alternativo |
| `TEST_RUN_ID` | Não | ID único do teste (default: timestamp) |

### Como obter tokens

1. Criar contas de teste (ver seção "Contas de Teste")
2. Fazer login via API: `POST /api/auth/login` com email/senha
3. Copiar o `access_token` da resposta
4. Passar como variável de ambiente para k6

**NUNCA** salve tokens no repositório ou em arquivos versionados.

## Contas de Teste

### Criação

```bash
export SUPABASE_URL=https://vwqfqfjsdgfnjxkbqusn.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...  # Service role key do dashboard
node create-test-accounts.js
```

### Contas padrão

| # | Email | Perfil |
|---|-------|--------|
| 1 | test_admin@loadtest.local | Admin |
| 2 | test_user1@loadtest.local | Usuário comum |
| 3 | test_user2@loadtest.local | Usuário comum |
| 4 | test_user3@loadtest.local | Usuário comum |
| 5 | test_user4@loadtest.local | Usuário comum |

### Autenticação com k6

O k6 não suporta login interativo. A autenticação funciona assim:

1. **Antes do teste**: criar contas e obter JWTs via `create-test-accounts.js`
2. **Durante o teste**: passar tokens como variáveis de ambiente
3. **K6 usa**: header `Authorization: Bearer <token>` em requisições autenticadas

```bash
# Exemplo: passar tokens para k6
k6 run \
  --env BASE_URL=https://lupa-digital-xxxxx.vercel.app \
  --env TOKEN_READONLY=eyJhbG... \
  --env TOKEN_AI=eyJhbG... \
  phases/A_smoke.js
```

**NUNCA** grave o segredo no repositório.
**NUNCA** coloque token no código ou em arquivos versionados.

## URL do Preview

A URL do Preview é gerada automaticamente pelo Vercel a cada push para uma branch.

Para obter a URL:
1. Push da branch `feat/load-test` para o GitHub
2. Vercel cria o Preview automaticamente
3. Copiar a URL do comentário do bot Vercel no PR
4. Ou verificar em: `https://vercel.com/<team>/<project>/deployments`

**A URL muda a cada push.** Atualize `BASE_URL` antes de cada teste.

## Execução

### Fase A — Smoke (sem custo IA)

```bash
k6 run \
  --env BASE_URL=<url> \
  --env TOKEN_READONLY=<token> \
  phases/A_smoke.js
```

**Esperado:** 100% check pass, 0 erros.

### Fase B — Endpoints Leves (sem custo IA)

```bash
k6 run \
  --env BASE_URL=<url> \
  --env TOKEN_WRITE=<token> \
  phases/B_light.js
```

**Esperado:** >95% check pass, <5% erros HTTP.

### Fase C — IA Controlada (custo baixo)

```bash
k6 run \
  --env BASE_URL=<url> \
  --env TOKEN_AI=<token> \
  phases/C_ai.js
```

**Esperado:** >85% check pass, <10% erros HTTP.

### Fase D — Documentos Longos (custo moderado)

```bash
k6 run \
  --env BASE_URL=<url> \
  --env TOKEN_AI=<token> \
  phases/D_long.js
```

**Esperado:** >80% check pass, <15% erros HTTP.

### Todas as fases sequencialmente

```bash
k6 run phases/A_smoke.js \
  --env BASE_URL=<url> \
  --env TOKEN_READONLY=<token> \
  --env TOKEN_WRITE=<token> \
  --env TOKEN_AI=<token>

k6 run phases/B_light.js \
  --env BASE_URL=<url> \
  --env TOKEN_WRITE=<token>

k6 run phases/C_ai.js \
  --env BASE_URL=<url> \
  --env TOKEN_AI=<token>

k6 run phases/D_long.js \
  --env BASE_URL=<url> \
  --env TOKEN_AI=<token>
```

## Limites de Custo

| Limite | Valor | Ação |
|--------|-------|------|
| Custo máximo | $0.50 | Abortar imediatamente |
| Chamadas IA máximas | 50 | Parar fases C/D |
| Budget exaustão | >3 ocorrências | Abortar fase D |
| Taxa 429 | >5% | Abortar fase atual |
| Taxa 5xx | >3% | Abortar fase atual |
| Timeouts consecutivos | 3 | Abortar fase atual |

## Critérios de Abort

### Abortar Imediatamente

- **3 timeouts consecutivos** em qualquer fase
- **>5% de respostas 429** (rate limit) em qualquer fase
- **>3% de respostas 5xx** em qualquer fase
- **Request >4 minutos** (excede budget do servidor)
- **Custo >$0.50** em chamadas IA

### Abortar Fase

- **Check pass rate <80%** na fase atual
- **Budget exaustão detectada** (mensagens "orçamento de tempo" no response)
- **Vercel retorna 502/503** consistentemente

### Continuar (não abortar)

- **429 intermitente** (<5%) — backoff automático do servidor
- **5xx intermitente** (<3%) — retry do k6
- **Alto tempo de resposta** (>10s mas <4min) — dentro do esperado para IA

## Interpretação das Métricas

### Métricas do k6

| Métrica | O que indica | Target |
|---------|-------------|--------|
| `http_req_duration` | Tempo de resposta | p95 <5s (leve), p99 <30s (IA) |
| `http_req_failed` | Taxa de falha | <5% |
| `http_errors` (custom) | Erros HTTP (4xx/5xx) | <5% |
| `checks` | Assertions passaram | >90% |
| `total_429` (custom) | Rate limits atingidos | <5% |
| `total_5xx` (custom) | Erros de servidor | <3% |
| `consecutive_timeouts` (custom) | Timeouts seguidos | 0 |
| `abort_triggered` (custom) | Abort automático | 0 |

### Métricas por fase

#### Fase A (Smoke)
- **Esperado:** 100% checks pass, 0 erros
- **Problema:** Se health check falha → servidor instável
- **Problema:** Se auth/user retorna erro → configuração incorreta

#### Fase B (Leve)
- **Esperado:** >95% checks pass, latência p95 <5s
- **Problema:** Se muitos 429 → rate limit muito baixo
- **Problema:** Se muitos 5xx → servidor sobrecarregado
- **Problema:** Se latência alta → problemas de infraestrutura

#### Fase C (IA)
- **Esperado:** >85% checks pass, latência p99 <30s
- **Problema:** Se muitos 429 → Groq rate limit
- **Problema:** Se muitos 500 → budget exaustão (verificar logs)
- **Problema:** Se latência >60s → timeout do servidor

#### Fase D (Longos)
- **Esperado:** >80% checks pass, latência p99 <250s
- **Problema:** Se budget exaustão → ajustar MIN_CHUNK_TIMEOUT_MS
- **Problema:** Se muitos timeouts → budget insuficiente
- **Problema:** Se 500 consistentes → bug no chunking

### Custo estimado

| Métrica | Fase C | Fase D |
|---------|--------|--------|
| Chamadas IA | ~20 | ~10 |
| Custo/chamada | ~$0.001 | ~$0.003 |
| Custo total | ~$0.02 | ~$0.03 |
| **Total** | | **~$0.05** |

*Valores estimados baseados em preços Groq (mais barato).*

## Cleanup

### Modo padrão: DRY-RUN

```bash
node cleanup.js
```

Apenas lista o que seria removido. Nenhum dado é alterado.

### Modo DELETE

```bash
node cleanup.js --delete
```

Remove todos os dados com prefixo `loadtest_`.

### Filtro por RUN_ID

```bash
node cleanup.js --run-id loadtest_1234567890
```

Remove apenas dados de um teste específico.

### O que é removido

- `agent_results` com título começando com `loadtest_`
- `conversations` associadas
- `messages` associadas
- `shared_results` de teste

### O que NÃO é removido

- Dados de produção
- Dados de outros testes
- Dados sem prefixo `loadtest_`

## Estrutura de Arquivos

```
load-test/
├── phases/
│   ├── utils.js           # Funções compartilhadas
│   ├── A_smoke.js         # Fase A — Smoke funcional
│   ├── B_light.js         # Fase B — Endpoints leves
│   ├── C_ai.js            # Fase C — IA controlada
│   └── D_long.js          # Fase D — Documentos longos
├── data/
│   └── synthetic.json     # Dados sintéticos para testes
├── scripts/
│   └── create-test-accounts.js  # Criação de contas de teste
├── cleanup.js             # Limpeza de dados de teste
└── README.md              # Esta documentação
```

## Segurança

### O que NUNCA fazer

- ❌ Salvar tokens no repositório
- ❌ Colocar service role key em arquivos versionados
- ❌ Usar contas de produção para testes
- ❌ Deletar dados sem verificar o filtro
- ❌ Rodar testes sem limite de custo

### O que SEMPRE fazer

- ✅ Usar contas com prefixo `test_`
- ✅ Passar tokens via variáveis de ambiente
- ✅ Rodar cleanup em dry-run primeiro
- ✅ Verificar custo antes de cada fase
- ✅ Monitorar métricas em tempo real
