// Worker de TESTE que simula um PDF que prende a CPU: nunca responde.
import { parentPort } from "node:worker_threads";
parentPort.on("message", () => {
  for (;;) {
    /* laço infinito proposital */
  }
});
