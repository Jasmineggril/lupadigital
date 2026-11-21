// Worker de TESTE que simula um PDF que cresce em memória sem parar.
import { parentPort } from "node:worker_threads";
parentPort.on("message", () => {
  const keep = [];
  for (;;) keep.push(new Array(1e6).fill(Math.random()));
});
