/**
 * @file load-env.ts
 * @description Carrega variáveis de ambiente de `.env` (raiz do repositório) sem
 * depender de dotenv. Executado ANTES de qualquer outro import para que módulos
 * que leem env no import (ex.: lib/db) encontrem as variáveis prontas.
 *
 * Regras:
 * - Não sobrescreve variáveis já presentes no ambiente real (Vercel/preview ganham).
 * - Ignora comentários e linhas vazias; aceita aspas simples/duplas ao redor do valor.
 * - Se o `.env` não existir, segue apenas com o ambiente real (caso serverless).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);

try {
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // `.env` ausente — usa apenas o ambiente real (ex.: Vercel)
}
