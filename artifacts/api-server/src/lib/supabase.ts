/**
 * @file lib/supabase.ts (backend)
 * @description Configuração do cliente Supabase Admin e middleware de autenticação JWT.
 *
 * Este arquivo implementa 3 responsabilidades distintas:
 *
 * 1. CLIENTE ADMIN (getSupabaseAdmin)
 *    Instância singleton do Supabase com a service role key, que tem acesso total ao banco.
 *    Usada apenas no backend — nunca exposta ao frontend.
 *    Variáveis necessárias: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY)
 *
 * 2. VERIFICAÇÃO JWT (verifySupabaseJwt / getSupabaseJwks)
 *    Valida tokens JWT emitidos pelo Supabase Auth usando RS256 com JWKS remoto.
 *    JWKS (JSON Web Key Set) contém a chave pública do Supabase para verificar assinaturas.
 *    Variáveis necessárias: SUPABASE_JWKS_URL
 *    Opcionais: SUPABASE_JWT_ISSUER, SUPABASE_JWT_AUDIENCE
 *
 * 3. MIDDLEWARES EXPRESS (supabaseAuthMiddleware / requireAuth / getReqUserId)
 *    - supabaseAuthMiddleware(): extrai e valida o Bearer token; popula req.user se válido
 *      (não bloqueia — rotas públicas continuam funcionando mesmo sem token)
 *    - requireAuth(): bloqueia a rota com 401 se req.user não estiver populado
 *    - getReqUserId(): helper para extrair o userId de req de forma segura
 *
 * Padrão de uso nas rotas:
 *   app.use(supabaseAuthMiddleware())  // aplicado globalmente em app.ts
 *   router.post("/rota", requireAuth(), handler)  // aplicado por rota
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";

let _supabase: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  // Suporte ao nome canônico (SUPABASE_SERVICE_ROLE_KEY) com fallback para o nome legado
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados no servidor",
    );
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
