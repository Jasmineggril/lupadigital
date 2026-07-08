import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";

let _supabase: SupabaseClient | null = null;

export function getSupabaseAdmin() {
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
  const { payload } = await jwtVerify(token, jwks, {
    // Accept typical Supabase algs; audience/issuer checks can be added if needed
  } as any);
  return payload as Record<string, unknown>;
}

// Express middleware helper
import type { RequestHandler } from "express";

export function supabaseAuthMiddleware(): RequestHandler {
  return async (req, _res, next) => {
    try {
      const auth = (req.headers["authorization"] as string) || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
      if (!token) return next();
      const payload = await verifySupabaseJwt(token);
      // attach to request
      (req as any).supabaseUser = payload;
      // normalize user as `req.user` for convenience
      if ((payload as any).sub) {
        (req as any).user = { id: String((payload as any).sub), ...(payload as object) };
      }
    } catch (err) {
      // ignore verification errors and continue unauthenticated
    }
    return next();
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
