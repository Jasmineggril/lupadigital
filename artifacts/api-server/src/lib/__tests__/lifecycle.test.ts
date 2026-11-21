import { describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createLifecycle, errorSummary, isRecoverable } from "../lifecycle";

const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

describe("lifecycle: erro fatal × recuperável", () => {
  it("falhas de rede transitórias são recuperáveis; o resto é fatal", () => {
    expect(isRecoverable(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(isRecoverable(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isRecoverable(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isRecoverable("texto qualquer")).toBe(false);
  });

  it("resumo do erro tem só o mínimo (sem objetos anexados nem mensagem longa)", () => {
    const err = Object.assign(new Error("a".repeat(500)), { code: "E1", body: { cpf: "000.000.000-00" }, config: { headers: { authorization: "Bearer x" } } });
    const s = errorSummary(err);
    expect(Object.keys(s).sort()).toEqual(["code", "message", "name"]);
    expect(s.message.length).toBe(200);
    expect(JSON.stringify(s)).not.toMatch(/cpf|authorization/);
  });

  it("encerramento: para de aceitar (503), fecha o servidor, roda o fechamento e sai com o código", async () => {
    const exit = vi.fn();
    const onClose = vi.fn(async () => {});
    const flush = vi.fn(async () => {});
    const lc = createLifecycle({ logger: quiet, exit, onClose, flush });
    const app = express();
    app.use(lc.drainGuard);
    app.get("/x", (_req, res) => res.json({ ok: true }));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    lc.attach(server);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
    expect((await fetch(url)).status).toBe(200);
    const p = lc.shutdown("uncaughtException", 1);
    expect(lc.isShuttingDown()).toBe(true);
    // Requisição chegando durante o encerramento (conexão nova antes do close completar)
    const during = await new Promise<number>((resolve) => {
      const req = { url: "/x", method: "GET", headers: {} };
      const res = {
        statusCode: 0,
        setHeader() {},
        status(c: number) {
          this.statusCode = c;
          return this;
        },
        json() {
          resolve(this.statusCode);
        },
      };
      lc.drainGuard(req as never, res as never, () => resolve(200));
    });
    expect(during).toBe(503);
    await p;
    expect(onClose).toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    expect(server.listening).toBe(false);
  });

  it("chamado duas vezes, encerra uma vez só", async () => {
    const exit = vi.fn();
    const lc = createLifecycle({ logger: quiet, exit });
    await Promise.all([lc.shutdown("SIGTERM", 0), lc.shutdown("SIGTERM", 0)]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("prazo máximo: se o fechamento travar, sai mesmo assim", async () => {
    const exit = vi.fn();
    const lc = createLifecycle({ logger: quiet, exit, timeoutMs: 100, onClose: () => new Promise(() => {}) });
    void lc.shutdown("uncaughtException", 1);
    await new Promise((r) => setTimeout(r, 250));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("lifecycle: processo real", () => {
  it("exceção não capturada encerra o processo com código 1 (e não fica vivo em estado incerto)", async () => {
    const { spawn } = await import("node:child_process");
    const mod = new URL("../lifecycle.ts", import.meta.url).href;
    const script = `
      import http from "node:http";
      const { createLifecycle, installProcessHandlers } = await import(${JSON.stringify(mod)});
      const log = { error: (o, m) => console.log("ERR", m, JSON.stringify(o)), warn: () => {}, info: (o, m) => console.log("INFO", m) };
      const lc = createLifecycle({ logger: log });
      installProcessHandlers(lc, log);
      const s = http.createServer((_q, r) => r.end("ok")).listen(0, "127.0.0.1", () => {
        lc.attach(s);
        setTimeout(() => { throw new Error("falha simulada"); }, 20);
      });`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const code = await new Promise<number | null>((r) => child.on("exit", r));
    expect(code).toBe(1);
    expect(out).toMatch(/Erro fatal/);
    expect(out).toMatch(/Encerrando o servidor/);
  }, 20_000);
});
