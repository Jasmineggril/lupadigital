# Dependências: auditoria, política e exceções

Comando: `pnpm audit --prod` (produção) e `pnpm audit` (inclui ferramentas). pnpm 9.15.9, Node 22.

## Antes × depois (21/11/2026)

| | crítico | alto | moderado | baixo |
|---|---|---|---|---|
| Produção — antes (commit dc9a16a) | 1 | 11 | 24 | 7 |
| Produção — depois | 0 | 0 | 0 | 0 |
| Todas (com ferramentas) — depois | 0 | 0 | 2 | 0 |

Correções: express 5.3 (proxy-addr 2.0.8 — GHSA-jqcg-44mw-7w3h; body-parser 2.4; qs 6.17),
express-rate-limit 8.7.5 (ip-address 10.7.6), undici 7.30.2 (via cheerio), dompurify 3.4.18 (via jspdf),
pdfjs-dist 6.5.438 no navegador (GHSA-hq66-cqwq-w95j), zod 4.6.7 (GHSA-mrhx-c7xc-m3w5, só corrigido na
linha 4), vitest/vite/esbuild atualizados. Avisos de dependência **não** são exploração comprovada:
nenhum foi explorado; foram corrigidos por estarem no caminho de código usado ou por precaução.

PDF no servidor: o `pdf-parse` 1.x trazia embutido o pdf.js 2.0.550 (2018), invisível para o audit.
Foi removido; o servidor usa pdfjs-dist 6.5 em worker isolado (`lib/pdf/`).

## Overrides (package.json da raiz, `pnpm.overrides`)

Correções de **mesma versão principal** em dependências de ferramentas presas em versão exata pelo pacote
pai (orval, @tailwindcss/*, pino-pretty). Nada disso vai para o pacote publicado.
Atenção: no pnpm 9 o bloco `overrides:` do `pnpm-workspace.yaml` **não é lido** (só no pnpm 10).

## Exceções aceitas (com justificativa) — revisar a cada atualização

| Pacote | Aviso | Por que fica | Plano |
|---|---|---|---|
| esbuild 0.18 (via drizzle-kit → @esbuild-kit) | GHSA-67mh-4wv8-2f99 (servidor de desenvolvimento do esbuild aceita requisições de qualquer site) | Só a CLI de migração do drizzle-kit usa; ela não sobe o servidor de desenvolvimento do esbuild; não vai para produção | Atualizar quando drizzle-kit trocar @esbuild-kit |
| minimatch 10 (via orval) | GHSA-g3hv-75wg-m249 (DoS com padrões) | Só no gerador de código (orval), com padrões do próprio repositório; correção exige 11.x (versão principal nova) | Atualizar com o orval |

## Política no CI

`node scripts/security/audit-policy.mjs`: falha se houver aviso **alto ou crítico em produção**, ou aviso
de qualquer nível em produção que não esteja na lista de exceções; avisos de ferramentas fora da lista
aparecem como alerta no resumo. Exceções ficam em `scripts/security/audit-exceptions.json` com motivo
e data de revisão; exceção vencida falha o job.
