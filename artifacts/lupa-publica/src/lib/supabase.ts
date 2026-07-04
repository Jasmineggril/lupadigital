import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      connected: false,
      message: "Supabase não está configurado neste ambiente.",
    };
  }

  const { error } = await supabase
    .from("edital_analises")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    return {
      connected: false,
      message: error.message,
    };
  }

  return {
    connected: true,
    message: "Conectado ao Supabase.",
  };
}
