/**
 * Vercel Serverless Function — entry point da API do LUPA Digital.
 *
 * Importa o Express app já compilado pelo esbuild (sem tsc, sem erros de tipo).
 * O esbuild gera dist/serverless.mjs a partir de src/serverless.ts.
 */
export { default } from "../artifacts/api-server/dist/serverless.mjs";
