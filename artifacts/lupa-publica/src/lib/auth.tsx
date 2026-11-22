/**
 * @file auth.tsx
 * @description Autenticação com Supabase Auth (única fonte de sessão).
 *
 * - Cadastro, login, logout, reenvio de confirmação, recuperação e redefinição de senha.
 * - Sessão persistida e renovada pelo SDK (autoRefreshToken); expiração detectada por
 *   SIGNED_OUT inesperado ou 401 da API (evento "lupa:session-expired").
 * - Papel de administrador vem do servidor (GET /api/me), nunca do cadastro ou do perfil.
 *
 * Nenhuma senha é armazenada ou manipulada fora do Supabase.
 */

import { purgeDrafts, purgeOtherUsersDrafts } from "./persistence";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthError, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured, hadStoredSessionAtLoad } from "./supabase";
import { apiFetch } from "./api";

export type ProfileType = "estudante" | "concurseiro" | "pesquisador" | "cidadao" | "docente";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  profileType: ProfileType;
  verified: boolean;
  plan: "gratuito" | "estudante" | "concurseiro" | "premium";
}

type Result = { ok: true } | { ok: false; error: string; code?: string };

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  /** true quando a sessão terminou sem o usuário ter saído */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
  login: (email: string, password: string) => Promise<Result>;
  /** `next`: página interna para onde voltar depois de confirmar o e-mail (já validada com safeNext) */
  register: (data: { name: string; email: string; password: string; next?: string }) => Promise<(Result & { needsConfirmation?: boolean })>;
  resendConfirmation: (email: string, next?: string) => Promise<Result>;
  requestPasswordReset: (email: string) => Promise<Result>;
  updatePassword: (password: string) => Promise<Result>;
  logout: () => Promise<void>;
  /** Evento PASSWORD_RECOVERY recebido (link de redefinição válido) */
  recoveryReady: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(u: User): AuthUser {
  const m = u.user_metadata ?? {};
  return {
    id: u.id,
    name: (m.name as string) || (u.email?.split("@")[0] ?? "Usuário"),
    email: u.email ?? "",
    profileType: (m.profileType as ProfileType) ?? "docente",
    verified: u.email_confirmed_at != null,
    plan: (m.plan as AuthUser["plan"]) ?? "gratuito",
  };
}

const NOT_CONFIGURED: Result = { ok: false, error: "Serviço de autenticação indisponível neste ambiente.", code: "not_configured" };

/** Mensagens claras para os erros do Supabase Auth. Exportado para testes. */
export function authErrorMessage(error: Pick<AuthError, "message" | "status"> & { code?: string }): { error: string; code: string } {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return { error: "E-mail ou senha incorretos.", code: "invalid_credentials" };
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return { error: "Seu e-mail ainda não foi confirmado. Abra o link que enviamos ou peça um novo envio.", code: "email_not_confirmed" };
  }
  if (code === "user_already_exists" || msg.includes("already registered")) {
    return { error: "Já existe uma conta com este e-mail. Entre ou recupere a senha.", code: "user_already_exists" };
  }
  if (code === "weak_password" || msg.includes("password should")) {
    return { error: "Senha fraca: use pelo menos 8 caracteres, com letras e números.", code: "weak_password" };
  }
  if (code === "same_password" || msg.includes("should be different")) {
    return { error: "A nova senha precisa ser diferente da atual.", code: "same_password" };
  }
  if (code.includes("otp_expired") || msg.includes("expired") || msg.includes("invalid") && msg.includes("token")) {
    return { error: "O link expirou ou já foi usado. Peça um novo link.", code: "link_expired" };
  }
  if (error.status === 429 || code.includes("rate_limit") || msg.includes("rate limit") || msg.includes("security purposes")) {
    return { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.", code: "rate_limited" };
  }
  if ((error.status ?? 0) >= 500 || msg.includes("fetch") || msg.includes("network")) {
    return { error: "O serviço de autenticação está indisponível. Tente novamente em instantes.", code: "unavailable" };
  }
  return { error: "Não foi possível concluir. Tente novamente.", code: "unknown" };
}

function siteUrl(path: string) {
  const base = ((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const explicitLogout = useRef(false);
  const hadSession = useRef(false);

  const refreshRole = useCallback(async (hasUser: boolean) => {
    if (!hasUser) {
      setIsAdmin(false);
      return;
    }
    try {
      const me = await apiFetch<{ is_admin: boolean }>("/me");
      setIsAdmin(Boolean(me.is_admin));
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      // Sessão salva que o SDK não conseguiu renovar ao carregar a página
      if (!u && hadStoredSessionAtLoad) setSessionExpired(true);
      hadSession.current = Boolean(u);
      setUser(u ? toAuthUser(u) : null);
      setIsLoading(false);
      void refreshRole(Boolean(u));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
      if (event === "SIGNED_OUT" && hadSession.current && !explicitLogout.current) setSessionExpired(true);
      if (event === "SIGNED_IN") setSessionExpired(false);
      hadSession.current = Boolean(u);
      explicitLogout.current = false;
      setUser(u ? toAuthUser(u) : null);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void refreshRole(Boolean(u));
    });
    const onExpired = () => {
      if (hadSession.current) setSessionExpired(true);
    };
    window.addEventListener("lupa:session-expired", onExpired);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("lupa:session-expired", onExpired);
    };
  }, [refreshRole]);

  const login: AuthContextValue["login"] = async (email, password) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) {
      setSessionExpired(false);
      return { ok: true };
    }
    return { ok: false, ...authErrorMessage(error) };
  };

  const register: AuthContextValue["register"] = async ({ name, email, password, next }) => {
    if (!supabase) return NOT_CONFIGURED;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // user_metadata: dados de exibição apenas. Papel de admin NÃO é definido aqui.
        data: { name: name.trim(), profileType: "docente", plan: "gratuito" },
        emailRedirectTo: siteUrl(next ?? "/perfil?boas-vindas=1"),
      },
    });
    if (error) return { ok: false, ...authErrorMessage(error) };
    // Com confirmação de e-mail ativa, não há sessão até o usuário abrir o link.
    // (Para e-mail já cadastrado o Supabase devolve user sem identities e sem sessão.)
    return { ok: true, needsConfirmation: !data.session };
  };

  const resendConfirmation: AuthContextValue["resendConfirmation"] = async (email, next) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: siteUrl(next ?? "/perfil?boas-vindas=1") },
    });
    if (error) return { ok: false, ...authErrorMessage(error) };
    return { ok: true };
  };

  const requestPasswordReset: AuthContextValue["requestPasswordReset"] = async (email) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl("/redefinir-senha") });
    // Não revela se o e-mail existe: só limite de frequência e indisponibilidade aparecem
    if (error) {
      const mapped = authErrorMessage(error);
      if (mapped.code === "rate_limited" || mapped.code === "unavailable") return { ok: false, ...mapped };
    }
    return { ok: true };
  };

  const updatePassword: AuthContextValue["updatePassword"] = async (password) => {
    if (!supabase) return NOT_CONFIGURED;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, ...authErrorMessage(error) };
    setRecoveryReady(false);
    return { ok: true };
  };

  useEffect(() => {
    if (user?.id) purgeOtherUsersDrafts(user.id);
  }, [user?.id]);

  const logout = async () => {
    explicitLogout.current = true;
    // Cópias de recuperação desta pessoa não ficam para a próxima conta neste aparelho
    purgeDrafts(user?.id ?? null);
    setSessionExpired(false);
    if (supabase) await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin,
        sessionExpired,
        dismissSessionExpired: () => setSessionExpired(false),
        login,
        register,
        resendConfirmation,
        requestPasswordReset,
        updatePassword,
        logout,
        recoveryReady,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
