/**
 * Testes das regras de acesso (lib/accessPolicy.ts): CORS e limite de IA sem login.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { createAnonHourlyLimiter, isOriginAllowed, parseAllowedOrigins } from "../accessPolicy";

describe("isOriginAllowed", () => {
  const base = { allowlist: [] as string[], nodeEnv: "production", requestHost: "lupa-digital.vercel.app" };

  it("aceita requisições sem Origin", () => {
    expect(isOriginAllowed({ ...base, origin: undefined })).toBe(true);
  });

  it("aceita a mesma origem do deploy, sem configuração (inclui previews)", () => {
    expect(isOriginAllowed({ ...base, origin: "https://lupa-digital.vercel.app" })).toBe(true);
    expect(
      isOriginAllowed({ ...base, requestHost: "lupa-digital-git-x.vercel.app", origin: "https://lupa-digital-git-x.vercel.app" }),
    ).toBe(true);
  });

  it("recusa origem desconhecida mesmo com allowlist vazia (antes era aceita)", () => {
    expect(isOriginAllowed({ ...base, origin: "https://site-malicioso.com" })).toBe(false);
  });

  it("aceita origem da allowlist (com ou sem barra final)", () => {
    const allowlist = parseAllowedOrigins("https://lupadigital.com.br/, https://outro.app");
    expect(isOriginAllowed({ ...base, allowlist, origin: "https://lupadigital.com.br" })).toBe(true);
    expect(isOriginAllowed({ ...base, allowlist, origin: "https://outro.app" })).toBe(true);
  });

  it("não confunde subdomínio com o host", () => {
    expect(isOriginAllowed({ ...base, origin: "https://lupa-digital.vercel.app.evil.com" })).toBe(false);
  });

  it("libera tudo em desenvolvimento", () => {
    expect(isOriginAllowed({ ...base, nodeEnv: "development", origin: "http://localhost:5173" })).toBe(true);
  });
});

describe("createAnonHourlyLimiter", () => {
  let server: Server;
  let url = "";

  beforeAll(async () => {
    const app = express();
    // Simula o supabaseAuthMiddleware: header x-test-user vira req.user
    app.use((req, _res, next) => {
      const u = req.headers["x-test-user"];
      if (typeof u === "string") (req as any).user = { id: u };
      next();
    });
    app.use("/ai", createAnonHourlyLimiter(2, "limite sem login"));
    app.post("/ai", (_req, res) => res.json({ ok: true }));
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ai`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("visitante sem login é bloqueado após o limite, com dica para entrar", async () => {
    expect((await fetch(url, { method: "POST" })).status).toBe(200);
    expect((await fetch(url, { method: "POST" })).status).toBe(200);
    const blocked = await fetch(url, { method: "POST" });
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { code?: string; loginHint?: boolean };
    expect(body.code).toBe("ANON_LIMIT");
    expect(body.loginHint).toBe(true);
  });

  it("usuário logado não é afetado pelo limite de visitante", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(url, { method: "POST", headers: { "x-test-user": "user-1" } });
      expect(r.status).toBe(200);
    }
  });
});
