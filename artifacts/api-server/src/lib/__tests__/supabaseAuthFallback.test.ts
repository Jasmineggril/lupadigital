/**
 * Regressão: projeto Supabase que assina tokens com o segredo HS256 legado (sem chave
 * pública no JWKS) fazia toda rota autenticada responder 401 "Authentication required".
 * Agora o token recusado localmente é validado pelo próprio Supabase Auth.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthFallbackCache, verifyViaSupabaseAuth } from "../supabase";

beforeEach(() => clearAuthFallbackCache());

const user = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "docente@exemplo.org",
  role: "authenticated",
  aud: "authenticated",
  app_metadata: { role: "admin" },
  user_metadata: { nome: "Docente", role: "admin" },
};

describe("verifyViaSupabaseAuth", () => {
  it("token aceito pelo Supabase Auth → payload com sub e app_metadata do servidor", async () => {
    const getUser = vi.fn(async () => ({ data: { user }, error: null }));
    const p = await verifyViaSupabaseAuth("tok-a", getUser);
    expect(p).toMatchObject({ sub: user.id, email: user.email, app_metadata: { role: "admin" } });
    expect(getUser).toHaveBeenCalledWith("tok-a");
  });

  it("token recusado → null", async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: new Error("invalid JWT") }));
    expect(await verifyViaSupabaseAuth("tok-b", getUser)).toBeNull();
  });

  it("resultado fica em cache por 60 s (não chama o Auth a cada requisição)", async () => {
    const getUser = vi.fn(async () => ({ data: { user }, error: null }));
    await verifyViaSupabaseAuth("tok-c", getUser, 1_000);
    await verifyViaSupabaseAuth("tok-c", getUser, 30_000);
    expect(getUser).toHaveBeenCalledTimes(1);
    await verifyViaSupabaseAuth("tok-c", getUser, 62_000);
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("falha de rede → null, sem guardar em cache", async () => {
    const getUser = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ data: { user }, error: null });
    expect(await verifyViaSupabaseAuth("tok-d", getUser as any)).toBeNull();
    expect(await verifyViaSupabaseAuth("tok-d", getUser as any)).toMatchObject({ sub: user.id });
  });
});
