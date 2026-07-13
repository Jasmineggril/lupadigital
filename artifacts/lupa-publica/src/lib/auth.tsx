import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

export type ProfileType = "estudante" | "concurseiro" | "pesquisador" | "cidadao";

/**
 * Perfil do usuário autenticado exposto pelo contexto de auth.
 * Os campos são mapeados a partir dos metadados salvos no Supabase.
 */
export interface AuthUser {
  name: string;
  email: string;
  profileType: ProfileType;
  verified: boolean;
  plan: "gratuito" | "estudante" | "concurseiro" | "premium";
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  profileType: ProfileType;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Autentica com e-mail e senha. Retorna { ok, error? }. */
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Cria uma nova conta. Retorna { ok, error? }. */
  register: (data: RegisterData) => Promise<{ ok: boolean; error?: string }>;
  /** Encerra a sessão atual. */
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Converte um objeto User do Supabase para o formato AuthUser do sistema.
 *
 * Os campos extras (name, profileType, plan) são gravados em user_metadata
 * durante o cadastro via supabase.auth.signUp({ options: { data: {...} } }).
 *
 * @param u - Usuário retornado pela API do Supabase
 * @returns Perfil normalizado para uso no frontend
 */
function toAuthUser(u: User): AuthUser {
  const m = u.user_metadata ?? {};
  return {
    name: (m.name as string) || (u.email?.split("@")[0] ?? "Usuário"),
    email: u.email ?? "",
    profileType: (m.profileType as ProfileType) ?? "cidadao",
    verified: u.email_confirmed_at != null,
    plan: (m.plan as AuthUser["plan"]) ?? "gratuito",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Se o Supabase não estiver configurado, não há sessão a recuperar
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    // Recupera a sessão já existente (ex: usuário que recarregou a página)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser(toAuthUser(data.session.user));
      setIsLoading(false);
    });

    // Escuta eventos de auth: login, logout, refresh automático de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAuthUser(session.user) : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Autentica o usuário com e-mail e senha via Supabase Auth.
   *
   * Erros do Supabase são convertidos em mensagens amigáveis em português.
   *
   * @param email - E-mail do usuário
   * @param password - Senha em texto plano (Supabase valida e armazena com hash)
   * @returns { ok: true } em caso de sucesso, ou { ok: false, error } com mensagem
   */
  const login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      return { ok: false, error: "Serviço de autenticação não configurado." };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { ok: true };

    if (error.message.includes("Invalid login credentials")) {
      return { ok: false, error: "E-mail ou senha incorretos." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { ok: false, error: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada." };
    }
    if (error.message.includes("rate limit") || error.status === 429) {
      return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    }
    return { ok: false, error: "Erro ao entrar. Tente novamente." };
  };

  /**
   * Cria uma nova conta no Supabase Auth.
   *
   * Os metadados extras (name, profileType, plan) são passados em options.data
   * para que fiquem disponíveis em user.user_metadata após o login.
   *
   * @param data - Dados do formulário de cadastro
   * @returns { ok: true } em caso de sucesso, ou { ok: false, error } com mensagem
   */
  const register = async (data: RegisterData): Promise<{ ok: boolean; error?: string }> => {
    if (!isSupabaseConfigured || !supabase) {
      return { ok: false, error: "Serviço de autenticação não configurado." };
    }
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          profileType: data.profileType,
          plan: "gratuito",
        },
      },
    });
    if (!error) return { ok: true };

    if (error.message.includes("already registered") || error.message.includes("User already registered")) {
      return { ok: false, error: "Este e-mail já está cadastrado." };
    }
    if (error.message.includes("Password should be at least")) {
      return { ok: false, error: "A senha deve ter pelo menos 6 caracteres." };
    }
    if (error.message.includes("rate limit") || error.status === 429) {
      return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    }
    return { ok: false, error: "Erro ao criar conta. Tente novamente." };
  };

  /**
   * Encerra a sessão do usuário atual e limpa o estado local.
   * O signOut é chamado de forma assíncrona sem bloquear a UI.
   */
  const logout = () => {
    if (supabase) supabase.auth.signOut().catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook para acessar o contexto de autenticação em qualquer componente filho.
 * Lança erro se usado fora do AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
