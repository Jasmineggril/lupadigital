/**
 * @file serverless.ts
 * @description Entry point para Vercel Serverless Functions.
 *
 * Re-exporta apenas o Express app sem chamar app.listen().
 * O esbuild compila este arquivo para dist/serverless.mjs,
 * que é importado por api/index.js no deploy do Vercel.
 */
export { default } from "./app";
