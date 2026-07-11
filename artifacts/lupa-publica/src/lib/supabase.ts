import type { Database } from "@/lib/supabase-types";
import { createClient } from "@supabase/supabase-js";

/**
 * Helper de autenticação do frontend.
 * O cliente Supabase é mantido apenas para obter sessão e token
 * quando a autenticação estiver disponível; nenhuma gravação direta é feita aqui.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY || "";

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export async function getSupabaseSessionToken() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      message: "Supabase não está configurado neste ambiente.",
    };
  }

  try {
    const response = await fetch(`${API_BASE}/healthz`);
    if (!response.ok) {
      const text = await response.text();
      return {
        connected: false,
        message: `Health check failed: ${response.status} ${text}`,
      };
    }

    return {
      connected: true,
      message: "Conectado ao backend da API.",
    };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
