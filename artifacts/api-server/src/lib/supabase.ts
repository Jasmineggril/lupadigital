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
 *    Valida tokens JWT emitidos pelo Supabase Auth usando RS256 (chaves RSA) ou ES256 (chaves EC/P-256)
 *    com JWKS remoto.
 *    JWKS (JSON Web Key Set) contém a chave pública do Supabase para verificar assinaturas.
 *    Variáveis necessárias: SUPABASE_JWKS_URL
 *    Opcionais: SUPABASE_JWT_ISSUER, SUPABASE_JWT_AUDIENCE
 *    Se a verificação local falhar (ex.: projeto com segredo HS256 legado, sem JWKS),
 *    o token é validado pelo próprio Supabase Auth (verifyViaSupabaseAuth).
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
import { createHash } from "node:crypto";

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
function deriveSupabaseJwksUrl(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const url = new URL(supabaseUrl);
    url.pathname = `${url.pathname.replace(/\/+$|\/$/, "")}/auth/v1/.well-known/jwks.json`;
    return url.toString();
  } catch {
    return null;
  }
}

export function getSupabaseJwks() {
  if (_jwks) return _jwks;
  const jwksUrl = process.env.SUPABASE_JWKS_URL || deriveSupabaseJwksUrl(process.env.SUPABASE_URL);
  if (!jwksUrl) {
    throw new Error(
      "SUPABASE_JWKS_URL não está configurado e não foi possível derivar a URL a partir de SUPABASE_URL.",
    );
  }
  _jwks = createRemoteJWKSet(new URL(jwksUrl));
  return _jwks;
}

export async function verifySupabaseJwt(token: string) {
  const jwks = getSupabaseJwks();
  const options: any = {
    // Supabase usa RS256 (chaves RSA) e ES256 (chaves EC/P-256) dependendo do projeto.
    // Rejeitar ES256 fazia TODO JWT válido do projeto falhar com ERR_JOSE_ALG_NOT_ALLOWED.
    algorithms: ["RS256", "ES256"],
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

/**
 * Fallback de verificação: GET /auth/v1/user no Supabase Auth com o token do usuário.
 * Cobre projetos que ainda assinam com o segredo HS256 legado (sem chave pública no JWKS).
 * Só confia no que o Supabase devolve; app_metadata (papel) vem do servidor de Auth.
 * Cache curto por hash do token para não chamar o Auth a cada requisição.
 */
const AUTH_CACHE_MS = 60_000;
const AUTH_CACHE_MAX = 500;
const authCache = new Map<string, { at: number; payload: Record<string, unknown> | null }>();

export function clearAuthFallbackCache() {
  authCache.clear();
}

export async function verifyViaSupabaseAuth(
  token: string,
  getUser: (t: string) => Promise<{ data: { user: any } | null; error: unknown }> = (t) =>
    getSupabaseAdmin().auth.getUser(t) as any,
  now = Date.now(),
): Promise<Record<string, unknown> | null> {
  const key = createHash("sha256").update(token).digest("hex");
  const hit = authCache.get(key);
  if (hit && now - hit.at < AUTH_CACHE_MS) return hit.payload;
  let payload: Record<string, unknown> | null = null;
  try {
    const { data, error } = await getUser(token);
    const u = data?.user;
    if (!error && u?.id) {
      payload = {
        sub: u.id,
        email: u.email,
        role: u.role ?? "authenticated",
        aud: u.aud,
        app_metadata: u.app_metadata ?? {},
        user_metadata: u.user_metadata ?? {},
      };
    }
  } catch {
    // Falha de rede/Auth fora do ar: não guarda em cache para não "travar" a recusa.
    return null;
  }
  if (authCache.size >= AUTH_CACHE_MAX) authCache.delete(authCache.keys().next().value as string);
  authCache.set(key, { at: now, payload });
  return payload;
}

// Express middleware helper
import type { RequestHandler } from "express";

export function supabaseAuthMiddleware(): RequestHandler {
  return async (req, res, next) => {
    const auth = (req.headers["authorization"] as string) || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (!token) return next();

    let payload: Record<string, unknown> | null = null;
    try {
      payload = await verifySupabaseJwt(token);
    } catch (err) {
      // Verificação local falhou: chave HS256 legada (sem JWKS), JWKS de outro projeto
      // ou token inválido. Pergunta ao próprio Supabase Auth, que é a fonte de verdade.
      payload = await verifyViaSupabaseAuth(token);
      if (!payload) {
        req.log?.warn(
          { code: "AUTH_JWT_REJECTED", reason: (err as { code?: string })?.code ?? (err as Error)?.name },
          "JWT recusado",
        );
      }
    }
    if (payload) {
      (req as any).supabaseUser = payload;
      if ((payload as any).sub) {
        (req as any).user = { id: String((payload as any).sub), ...(payload as object) };
      }
    }
    // Sem payload: não bloqueia rotas públicas; requireAuth() bloqueia as que exigem login.
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
