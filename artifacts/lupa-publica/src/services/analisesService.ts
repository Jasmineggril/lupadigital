import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface AnaliseSalva {
  id?: string;
  created_at?: string;
  titulo?: string;
  conteudo_original?: string;
  conteudo_simplificado?: string;
  categoria?: string;
  modo_analise?: string;
  indicadores?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  recomendacoes?: Record<string, unknown>;
  favorito?: boolean;
}

const STORAGE_KEY = "lupa-publica-analises";

const readLocalAnalises = (): AnaliseSalva[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as AnaliseSalva[];
  } catch {
    return [];
  }
};

const writeLocalAnalises = (items: AnaliseSalva[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export async function salvarAnalise(analise: AnaliseSalva) {
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocalAnalises();
    const next = [{
      ...analise,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      favorito: analise.favorito ?? false,
    }, ...items].slice(0, 50);
    writeLocalAnalises(next);
    return next[0];
  }

  const { data, error } = await supabase.from("edital_analises").insert({
    titulo: analise.titulo ?? null,
    conteudo_original: analise.conteudo_original ?? null,
    conteudo_simplificado: analise.conteudo_simplificado ?? null,
    categoria: analise.categoria ?? null,
    modo_analise: analise.modo_analise ?? null,
    indicadores: analise.indicadores ?? null,
    timeline: analise.timeline ?? null,
    recomendacoes: analise.recomendacoes ?? null,
    favorito: analise.favorito ?? false,
  }).select().single();

  if (error) throw error;
  return data;
}

export async function listarAnalises() {
  if (!isSupabaseConfigured || !supabase) {
    return readLocalAnalises();
  }

  const { data, error } = await supabase.from("edital_analises").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AnaliseSalva[];
}

export async function atualizarAnalise(analise: AnaliseSalva) {
  if (!analise.id) throw new Error("ID da análise é necessário para atualização.");

  if (!isSupabaseConfigured || !supabase) {
    const items = readLocalAnalises().map((item) =>
      item.id === analise.id ? { ...item, ...analise, favorito: analise.favorito ?? item.favorito ?? false } : item
    );
    writeLocalAnalises(items);
    return items.find((item) => item.id === analise.id) ?? analise;
  }

  const { data, error } = await supabase.from("edital_analises").update({
    titulo: analise.titulo ?? null,
    conteudo_original: analise.conteudo_original ?? null,
    conteudo_simplificado: analise.conteudo_simplificado ?? null,
    categoria: analise.categoria ?? null,
    modo_analise: analise.modo_analise ?? null,
    indicadores: analise.indicadores ?? null,
    timeline: analise.timeline ?? null,
    recomendacoes: analise.recomendacoes ?? null,
    favorito: analise.favorito ?? false,
  }).eq("id", analise.id).select().single();

  if (error) throw error;
  return data;
}

export async function excluirAnalise(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocalAnalises().filter((item) => item.id !== id);
    writeLocalAnalises(items);
    return true;
  }

  const { error } = await supabase.from("edital_analises").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function limparAnalises() {
  if (!isSupabaseConfigured || !supabase) {
    writeLocalAnalises([]);
    return true;
  }

  const { error } = await supabase.from("edital_analises").delete().gt("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
  return true;
}
