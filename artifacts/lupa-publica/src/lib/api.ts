/**
 * @file api.ts
 * @description Cliente da API do LUPA com o token da sessão Supabase.
 *
 * - Envia Authorization: Bearer <access_token> da sessão atual.
 * - 401 dispara o evento "lupa:session-expired" (o AuthProvider mostra o aviso e
 *   leva ao login preservando a página).
 * - Erros viram ApiError com mensagem segura para o usuário.
 */

import { getSupabaseSessionToken } from "./supabase";

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.auth !== false) {
    const token = await getSupabaseSessionToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.", 0);
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ??
      (res.status === 401
        ? "Sua sessão expirou. Entre novamente."
        : res.status === 403
          ? "Você não tem permissão para esta ação."
          : res.status >= 500
            ? "Serviço indisponível no momento. Tente novamente."
            : "Não foi possível concluir a operação.");
    if (res.status === 401 && init.auth !== false) window.dispatchEvent(new CustomEvent("lupa:session-expired"));
    throw new ApiError(message, res.status, body && typeof body === "object" && "details" in body ? (body as { details: unknown }).details : undefined);
  }
  return body as T;
}
