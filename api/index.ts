/**
 * @file api/index.ts
 * @description Vercel Serverless Function — entry point para toda a API do LUPA Digital.
 *
 * Este arquivo é detectado automaticamente pelo Vercel quando o root directory
 * do projeto aponta para a raiz do monorepo. O Vercel roteia todas as
 * requisições /api/* para este handler.
 *
 * O Express app (app.ts) já monta todas as rotas em /api/*, aplica CORS,
 * autenticação Supabase, rate limiting e logging — sem nenhuma mudança
 * necessária no código existente da API.
 *
 * Diferença em relação ao modo dev:
 *   - Dev:        index.ts → app.listen(PORT)   (processo persistente)
 *   - Serverless: api/index.ts → export default app  (Vercel gerencia o servidor)
 */

export { default } from "../artifacts/api-server/src/app.js";
