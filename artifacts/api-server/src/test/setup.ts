/**
 * Setup global do Vitest para o api-server.
 *
 * O cache de IA (lib/aiCache.ts) é um singleton em memória. Sem limpeza, um
 * resultado gerado por um teste seria devolvido a outro teste que usasse o
 * mesmo texto, mascarando o comportamento real (retry, falhas parciais,
 * subdivisão de chunks). Limpamos antes e depois de cada teste para que cada
 * um comece com o cache vazio — o cache continua ATIVO dentro do teste.
 */
import { afterEach, beforeEach } from "vitest";
import { cacheClear } from "../lib/aiCache";

beforeEach(() => {
  cacheClear();
});

afterEach(() => {
  cacheClear();
});
