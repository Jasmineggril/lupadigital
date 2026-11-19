# Integração com o Hermes (agendador) — contrato preparado

**Situação: NÃO integrado.** A interface real do Hermes não estava disponível durante a implementação. A busca periódica **não está ativa**; hoje só existe a execução manual pela administração.

## Separação entre coleta e agendamento

- A coleta é a função `runCollection()` (`artifacts/api-server/src/lib/lupa/collector/crawler.ts`). Ela registra início, fim, estatísticas e falhas em `collection_runs`.
- Uma trava impede execuções concorrentes da mesma fonte: índice único parcial `uq_collection_runs_running` no banco e verificação equivalente no modo de desenvolvimento.
- Quem dispara a coleta:
  - **Manual:** `POST /api/admin/sources/:id/collect`, apenas para administradores.
  - **Hermes:** o endpoint abaixo.

## Endpoint de gatilho para o Hermes

```
POST /api/integrations/hermes/collect
Authorization: Bearer <HERMES_TRIGGER_SECRET>
Content-Type: application/json

{ "source_id": "fapdf", "request_id": "<id da tarefa no Hermes>" }
```

| Resposta | Significado |
|---|---|
| `202 { run }` | Coleta executada. `run.trigger = "hermes"` e `run.triggered_by = "hermes:<request_id>"`. |
| `401` | Segredo ausente ou inválido. |
| `409` | Já existe uma coleta em andamento para a fonte. |
| `503` | Integração não configurada (sem `HERMES_TRIGGER_SECRET` com 32 ou mais caracteres). |

A frequência desejada de cada fonte fica em `opportunity_sources.frequency_minutes` e pode ser editada na tela **Administração**. O Hermes deve ler essa configuração ou receber a frequência na própria configuração dele.

## Pendências para declarar a integração concluída

1. Obter a documentação real do Hermes: como agenda tarefas, como autentica as chamadas, se aceita webhook ou se espera que o LUPA consulte uma fila.
2. Ajustar o contrato acima, se necessário (por exemplo, com assinatura HMAC em vez de Bearer).
3. Configurar `HERMES_TRIGGER_SECRET` no servidor e no Hermes.
4. **Verificar de fato**: uma execução com `trigger = "hermes"` registrada em `collection_runs` no ambiente real, seguida de execuções periódicas na frequência configurada.

Antes do item 4, a busca periódica não deve ser considerada concluída.
