import { supabase, isSupabaseConfigured, getSupabaseSessionToken } from "@/lib/supabase";
import type {
  AIAnalysis,
  LattesProfile,
  ArticleAnalysis,
  ResearchProject,
  PlanetariumContent,
  ChatMessage,
  DocumentRow as DocType,
} from "@/lib/supabase-types";

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

async function getAuthToken() {
  if (!isSupabaseConfigured || !supabase) return null;
  return getSupabaseSessionToken();
}

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

  try {
    const { data, error } = await supabase
      .from("edital_analyses")
      .insert({
        titulo: analise.titulo ?? null,
        conteudo_original: analise.conteudo_original ?? null,
        conteudo_simplificado: analise.conteudo_simplificado ?? null,
        categoria: analise.categoria ?? null,
        modo_analise: analise.modo_analise ?? null,
        indicadores: analise.indicadores ?? null,
        timeline: analise.timeline ?? null,
        recomendacoes: analise.recomendacoes ?? null,
        favorito: analise.favorito ?? false,
      })
      .select()
      .single();

    if (error) throw error;
    return (data ?? null) as AnaliseSalva;
  } catch {
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
}

export async function listarAnalises() {
  if (!isSupabaseConfigured || !supabase) {
    return readLocalAnalises();
  }

  try {
    const { data, error } = await supabase
      .from("edital_analyses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as AnaliseSalva[];
  } catch {
    return readLocalAnalises();
  }
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

  try {
    const { data, error } = await supabase
      .from("edital_analyses")
      .update({
        titulo: analise.titulo ?? null,
        conteudo_original: analise.conteudo_original ?? null,
        conteudo_simplificado: analise.conteudo_simplificado ?? null,
        categoria: analise.categoria ?? null,
        modo_analise: analise.modo_analise ?? null,
        indicadores: analise.indicadores ?? null,
        timeline: analise.timeline ?? null,
        recomendacoes: analise.recomendacoes ?? null,
        favorito: analise.favorito ?? false,
      })
      .eq("id", analise.id)
      .select()
      .single();

    if (error) throw error;
    return (data ?? analise) as AnaliseSalva;
  } catch {
    const items = readLocalAnalises().map((item) =>
      item.id === analise.id ? { ...item, ...analise, favorito: analise.favorito ?? item.favorito ?? false } : item
    );
    writeLocalAnalises(items);
    return items.find((item) => item.id === analise.id) ?? analise;
  }
}

export async function excluirAnalise(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocalAnalises().filter((item) => item.id !== id);
    writeLocalAnalises(items);
    return true;
  }

  try {
    const { error } = await supabase.from("edital_analyses").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch {
    const items = readLocalAnalises().filter((item) => item.id !== id);
    writeLocalAnalises(items);
    return true;
  }
}

export async function limparAnalises() {
  if (!isSupabaseConfigured || !supabase) {
    writeLocalAnalises([]);
    return true;
  }

  try {
    const { error } = await supabase.from("edital_analyses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw error;
    return true;
  } catch {
    writeLocalAnalises([]);
    return true;
  }
}

// ── Documents ───────────────────────────────────────────────────

export async function uploadDocument(doc: { filename: string; mime_type: string; size: number; metadata?: Record<string, unknown> }) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        filename: doc.filename,
        mime_type: doc.mime_type,
        size: doc.size,
        metadata: doc.metadata ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(next));
    return next[0];
  }
}

export async function listDocuments() {
  if (!isSupabaseConfigured || !supabase) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  }

  try {
    const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch {
    return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  }
}

export async function deleteDocument(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]").filter((d: any) => d.id !== id);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(items));
    return true;
  }

  try {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]").filter((d: any) => d.id !== id);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(items));
    return true;
  }
}

// ── AI Analyses ─────────────────────────────────────────────────
export async function saveAiAnalysis(a: AIAnalysis) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-ai-analyses", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase.from("ai_analyses").insert(a).select().single();
    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-ai-analyses", JSON.stringify(next));
    return next[0];
  }
}

export async function listAiAnalyses() {
  if (!isSupabaseConfigured || !supabase) return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");

  try {
    const { data, error } = await supabase.from("ai_analyses").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch {
    return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
  }
}

// ── Lattes Profiles ─────────────────────────────────────────────
export async function saveLattesProfile(p: LattesProfile) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase.from("lattes_profiles").insert(p).select().single();
    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(next));
    return next[0];
  }
}

export async function getLattesProfiles() {
  if (!isSupabaseConfigured || !supabase) return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");

  try {
    const { data, error } = await supabase.from("lattes_profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch {
    return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
  }
}

// ── Article analyses, projects, planetarium and chat messages (basic) ─
export async function saveArticleAnalysis(a: ArticleAnalysis) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-article-analyses", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase.from("article_analyses").insert(a).select().single();
    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-article-analyses", JSON.stringify(next));
    return next[0];
  }
}

export async function saveResearchProject(p: ResearchProject) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-research-projects", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase.from("research_projects").insert(p).select().single();
    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-research-projects", JSON.stringify(next));
    return next[0];
  }
}

export async function savePlanetariumContent(c: PlanetariumContent) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...c }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-planetarium", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase.from("planetarium_contents").insert(c).select().single();
    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...c }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-planetarium", JSON.stringify(next));
    return next[0];
  }
}

export async function saveChatMessage(m: ChatMessage) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-chat-messages") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...m }, ...items].slice(0, 500);
    window.localStorage.setItem("lupa-publica-chat-messages", JSON.stringify(next));
    return next[0];
  }

  try {
    const { data, error } = await supabase.from("chat_messages").insert(m).select().single();
    if (error) throw error;
    return data;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-chat-messages") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...m }, ...items].slice(0, 500);
    window.localStorage.setItem("lupa-publica-chat-messages", JSON.stringify(next));
    return next[0];
  }
}
