import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { JWK } from "jose";

async function signToken(privateKey: unknown, alg: string, subject = "test-user") {
  return new SignJWT({ sub: subject, role: "authenticated" })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey as never);
}

const openServers = new Set<ReturnType<typeof createServer>>();

async function serveJwks(publicKeys: Array<unknown>): Promise<string> {
  const keys: JWK[] = [];
  for (const key of publicKeys) {
    keys.push((await exportJWK(key as never)) as JWK);
  }
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  openServers.add(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/.well-known/jwks.json`;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const server of openServers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  openServers.clear();
});

async function verifyWithLocalJwks(token: string): Promise<Record<string, unknown>> {
  const { verifySupabaseJwt } = await import("../supabase");
  return (await verifySupabaseJwt(token)) as Record<string, unknown>;
}

describe("verifySupabaseJwt", () => {
  it("aceita token ES256 (chaves EC/P-256, como no JWKS deste projeto)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwksUrl = await serveJwks([publicKey]);
    vi.stubEnv("SUPABASE_JWKS_URL", jwksUrl);

    const token = await signToken(privateKey, "ES256");
    const payload = await verifyWithLocalJwks(token);

    expect(payload.sub).toBe("test-user");
  });

  it("continua aceitando token RS256 (chaves RSA)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwksUrl = await serveJwks([publicKey]);
    vi.stubEnv("SUPABASE_JWKS_URL", jwksUrl);

    const token = await signToken(privateKey, "RS256");
    const payload = await verifyWithLocalJwks(token);

    expect(payload.sub).toBe("test-user");
  });

  it("rejeita token assinado com chave fora do JWKS", async () => {
    const trusted = await generateKeyPair("ES256");
    const attacker = await generateKeyPair("ES256");
    const jwksUrl = await serveJwks([trusted.publicKey]);
    vi.stubEnv("SUPABASE_JWKS_URL", jwksUrl);

    const token = await signToken(attacker.privateKey, "ES256");
    await expect(verifyWithLocalJwks(token)).rejects.toThrow();
  });

  it("rejeita token malformado", async () => {
    const { publicKey } = await generateKeyPair("ES256");
    const jwksUrl = await serveJwks([publicKey]);
    vi.stubEnv("SUPABASE_JWKS_URL", jwksUrl);

    await expect(verifyWithLocalJwks("not-a-jwt")).rejects.toThrow();
  });

  it("rejeita token cujo algoritmo não está na lista permitida (HS256)", async () => {
    const { publicKey } = await generateKeyPair("ES256");
    const jwksUrl = await serveJwks([publicKey]);
    vi.stubEnv("SUPABASE_JWKS_URL", jwksUrl);

    const secret = new TextEncoder().encode("secret-key");
    const token = await new SignJWT({ sub: "test-user" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    await expect(verifyWithLocalJwks(token)).rejects.toThrow();
  });
});
