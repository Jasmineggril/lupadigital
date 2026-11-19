# Integração de perfis com o eLattes — contrato + importação provisória

**Situação: NÃO integrado.** Não houve acesso à API real do eLattes. Nenhum endpoint foi inventado.

- Interface: `LattesProvider` (`artifacts/api-server/src/lib/lupa/integrations/lattes.ts`).
- Provider ativo: `NotConfiguredLattesProvider`. Ele sempre informa "não configurado".
- **Alternativa provisória:** importação de um resumo estruturado em JSON, validado pelo `LattesSummarySchema`.

## Por que um resumo e não o currículo inteiro

A compatibilidade compara termos do perfil com o texto do edital. O sistema guarda um **resumo estruturado por docente** (competências, temas, evidências e data de atualização), para não reprocessar o Lattes completo a cada comparação.

## Formato do resumo (um docente)

```json
{
  "lattes_id": "1234567890123456",
  "nome": "Nome do Docente",
  "instituicao": "UnDF",
  "unidade": "Escola de Tecnologia",
  "titulacao": "doutorado",
  "areas": ["Ciência da Computação"],
  "competencias": ["análise de dados"],
  "temas": ["inteligência artificial na educação"],
  "palavras_chave": ["aprendizado de máquina"],
  "evidencias": [{ "tipo": "projeto", "descricao": "Projeto X", "ano": 2025 }],
  "atualizado_em": "2026-10-01"
}
```

| Campo | Regra |
|---|---|
| `lattes_id` | Identificador estável, 16 dígitos. |
| `titulacao` | `graduacao`, `especializacao`, `mestrado` ou `doutorado`. |
| `evidencias[].tipo` | `projeto`, `publicacao`, `orientacao`, `formacao` ou `outro`. |
| Demais campos | Campos desconhecidos são **recusados** (schema estrito). |

## Quem pode importar

| Rota | Quem | Origem registrada |
|---|---|---|
| `POST /api/profile/lattes-import` | O próprio docente, só no próprio perfil | `importacao_json_provisoria` |
| `POST /api/admin/profiles/import` | **Somente administração**. Recebe uma lista com `user_id` em cada item. | `importacao_institucional` |

Cada campo do perfil guarda a origem e a data de atualização (`field_sources`), exibidas na tela **Meu perfil** para revisão. Dados importados **não comprovam elegibilidade**.

## Pendências

1. Obter o contrato real do eLattes: endpoint, autenticação, formato e limites.
2. Implementar um `LattesProvider` real e trocar `getLattesProvider()`.
3. Verificar com currículos reais antes de declarar a integração concluída.
