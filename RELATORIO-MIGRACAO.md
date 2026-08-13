# Relatório — Migração do modelo Groq: `llama-3.3-70b-versatile` → `openai/gpt-oss-120b`

## 1. Objetivo
Migrar o LUPA Digital (Vercel) para o `openai/gpt-oss-120b` na Groq antes da descontinuação oficial do `llama-3.3-70b-versatile` em **16/08/2026**, sem perda de funcionalidade.

## 2. Problemas encontrados e causas
| Sintoma em produção | Causa raiz |
|---|---|
| `/api/edital/analyze` caía em fallback (resposta heurística, sem IA) | `getTpmLimit` assumia TPM de 12k; o gpt-oss-120b free tem **8k TPM** → erro 413 → fallback |
| `/api/edital/simplify` idem | `max_tokens: 4096` fixo somado ao prompt estourava o TPM de 8k |
| `/api/niasci/planetario`, `elattes`, etc. → `400 Failed to validate JSON` | `max_tokens` fixo (1024) **truncava o JSON** no meio (gpt-oss gera mais longo que o llama) |

## 3. Mudanças aplicadas (`artifacts/api-server/src/lib/aiService.ts`)
- `getTpmLimit()`: gpt-oss → **8.000**; llama/legado → 12.000.
- `simplifyEdital`: `max_tokens` fixo → `calcRequestMaxTokens(promptTokens, model)` + `waitForTpmBudget`.
- `callNiasciAI`: idem (remoção do cap `1024`), orçamento TPM-aware.
- `analyzeArtigo`: truncamento de texto de 14k → 10k caracteres.

## 4. Commits e deploy
- `465ee8e` migra modelo Groq
- `9647f7e` regenera bundle pós-merge
- `6ef5657` ajusta TPM 8k + fix simplify
- `131c827` max_tokens TPM-aware nos módulos NIASci

**Estado atual**: local, `origin/main` e `lupadigital/main` todos em `131c827` (mesmo repo no GitHub). Deploy automático via Vercel.

## 5. Qualidade
- `typecheck`: OK
- Testes: **187/187 passando** (Node v24; PATH usa v18, incompatível com vitest v4)
- Bundle `api/index.js` regenerado a cada commit

## 6. Verificação em produção (13/08/2026, pós-deploy)
| Endpoint | Resultado |
|---|---|
| `/` + assets JS/CSS | 200 |
| `/api/healthz`, `/api/readyz` (db) | ok |
| `/api/edital/analyze` | `mode=single`, `complete=True`, requisitos reais |
| `/api/edital/simplify` | resumo + prazo corretos |
| `/api/niasci/chat` | OK |
| `/api/niasci/planetario/generate` | OK |
| `/api/niasci/elattes/analyze` | OK (exige texto ≥100 chars — validação, não erro) |
| `/api/niasci/projetos/analyze` | OK |
| `/api/niasci/artigos/analyze` | OK |

## 7. Pendências
- Nenhuma. Migração concluída.
- Observações: tier free do gpt-oss-120b é limitado (8k TPM / 30 RPM / 1K RPD); sob concorrência o `waitForTpmBudget` enfileira requisições. Se a carga crescer, avaliar plano pago ou multi-provider.
