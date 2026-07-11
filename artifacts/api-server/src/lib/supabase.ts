import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";

let _supabase: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  /**
   * Retorna o cliente Supabase com privilégios de administração usado no backend.
   *
   * Por que: o backend precisa de um cliente com privilégios para gravação e
   * administração (ex.: gravar `ai_usage_logs`). As credenciais devem ser
   * mantidas no ambiente do servidor e NÃO expostas ao frontend.
   */
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set on the server");
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _supabase;
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
export function getSupabaseJwks() {
  if (_jwks) return _jwks;
  const jwksUrl = process.env.SUPABASE_JWKS_URL;
  if (!jwksUrl) throw new Error("SUPABASE_JWKS_URL is not configured");
  _jwks = createRemoteJWKSet(new URL(jwksUrl));
  return _jwks;
}

export async function verifySupabaseJwt(token: string) {
  const jwks = getSupabaseJwks();
  const options: any = {
    algorithms: ["RS256"],
    clockTolerance: "5m",
  };

  if (process.env.SUPABASE_JWT_ISSUER) {
    options.issuer = process.env.SUPABASE_JWT_ISSUER;
  }

  if (process.env.SUPABASE_JWT_AUDIENCE) {
    options.audience = process.env.SUPABASE_JWT_AUDIENCE;
  }

  const { payload } = await jwtVerify(token, jwks, options);
  return payload as Record<string, unknown>;
}

// Express middleware helper
import type { RequestHandler } from "express";

export function supabaseAuthMiddleware(): RequestHandler {
  /**
   * Middleware que, quando presente, tenta validar o JWT do Supabase (se houver)
   * e anexa o payload decodificado em `req.supabaseUser` e `req.user`.
   *
   * Nota arquitetural: este middleware não exige autenticação — ele apenas
   * decodifica o token quando fornecido. Rotas que exigem autenticação devem
   * usar `requireAuth()` explícito.
   */
  return async (req, res, next) => {
    const auth = (req.headers["authorization"] as string) || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (!token) return next();

    try {
      const payload = await verifySupabaseJwt(token);
      (req as any).supabaseUser = payload;
      if ((payload as any).sub) {
        (req as any).user = { id: String((payload as any).sub), ...(payload as object) };
      }
      return next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: "Authentication failed", details: message });
      return;
    }
  };
}

export function requireAuth(): RequestHandler {
  /**
   * Middleware que exige autenticação. Verifica se `req.supabaseUser` existe e
   * normaliza `req.user` para uso pelas rotas. Retorna 401 caso não autenticado.
   */
  return (req, res, next) => {
    const user = (req as any).supabaseUser;
    if (!user || !user.sub) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // normalize user
    (req as any).user = { id: String((user as any).sub), ...(user as object) };
    next();
  };
}

export function getReqUserId(req: any) {
  return req?.user?.id ?? req?.supabaseUser?.sub ?? null;
}

export default getSupabaseAdmin;
