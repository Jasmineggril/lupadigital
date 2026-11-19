/**
 * @file lib/lupa/roles.ts
 * @description Papel de administrador definido por informação controlada pelo servidor.
 *
 * Um usuário é administrador quando:
 *   - o JWT verificado traz app_metadata.role === "admin". No Supabase, app_metadata
 *     só pode ser alterado com a service role (painel ou Admin API) — o usuário não
 *     consegue mudá-lo pelo cadastro nem pelo perfil (user_metadata é ignorado); ou
 *   - o id do usuário está em LUPA_ADMIN_USER_IDS (variável do servidor, CSV).
 *
 * Campos do perfil docente NUNCA concedem papel.
 */

import type { Request, RequestHandler } from "express";

type Claims = { sub?: unknown; app_metadata?: { role?: unknown; roles?: unknown } };

export function adminIdsFromEnv(): Set<string> {
  return new Set(
    (process.env.LUPA_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAdminClaims(claims: Claims | null | undefined, adminIds = adminIdsFromEnv()): boolean {
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return false;
  if (adminIds.has(claims.sub)) return true;
  const meta = claims.app_metadata;
  if (!meta || typeof meta !== "object") return false;
  if (meta.role === "admin") return true;
  return Array.isArray(meta.roles) && meta.roles.includes("admin");
}

export function getClaims(req: Request): Claims | null {
  return ((req as unknown as { supabaseUser?: Claims }).supabaseUser ?? null) as Claims | null;
}

export function getUserId(req: Request): string | null {
  const sub = getClaims(req)?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

/** 401 sem login; 403 para usuário comum. */
export function requireAdmin(): RequestHandler {
  return (req, res, next) => {
    const claims = getClaims(req);
    if (!claims?.sub) {
      res.status(401).json({ error: "Autenticação necessária." });
      return;
    }
    if (!isAdminClaims(claims)) {
      res.status(403).json({ error: "Acesso restrito à administração." });
      return;
    }
    next();
  };
}
