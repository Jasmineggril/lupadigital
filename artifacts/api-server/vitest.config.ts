/**
 * Configuração do Vitest para o pacote api-server.
 *
 * O Vitest é o test runner escolhido por ser nativamente compatível com
 * TypeScript e ESM (ECMAScript Modules), sem necessidade de compilação prévia.
 *
 * Por que "environment: node"?
 * Os testes de preservação semântica testam lógica pura de análise de texto —
 * não dependem de DOM (browser), apenas de funções JavaScript/TypeScript.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["verbose"],
  },
});
