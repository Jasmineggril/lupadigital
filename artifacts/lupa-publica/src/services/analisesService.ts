import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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
  // Use server endpoint to create resource (server will set user_id)
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) {
    // no authenticated user — fallback to local
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

  const res = await fetch(`/api/resources/edital_analises`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      titulo: analise.titulo ?? null,
      conteudo_original: analise.conteudo_original ?? null,
      conteudo_simplificado: analise.conteudo_simplificado ?? null,
      categoria: analise.categoria ?? null,
      modo_analise: analise.modo_analise ?? null,
      indicadores: analise.indicadores ?? null,
      timeline: analise.timeline ?? null,
      recomendacoes: analise.recomendacoes ?? null,
      favorito: analise.favorito ?? false,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listarAnalises() {
  if (!isSupabaseConfigured || !supabase) {
    return readLocalAnalises();
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) return readLocalAnalises();

  const res = await fetch(`/api/resources/edital_analises`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to list analyses: ${res.status}`);
  return (await res.json()) as AnaliseSalva[];
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
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) throw new Error("Authentication required");

  const res = await fetch(`/api/resources/edital_analises/${analise.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      titulo: analise.titulo ?? null,
      conteudo_original: analise.conteudo_original ?? null,
      conteudo_simplificado: analise.conteudo_simplificado ?? null,
      categoria: analise.categoria ?? null,
      modo_analise: analise.modo_analise ?? null,
      indicadores: analise.indicadores ?? null,
      timeline: analise.timeline ?? null,
      recomendacoes: analise.recomendacoes ?? null,
      favorito: analise.favorito ?? false,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function excluirAnalise(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = readLocalAnalises().filter((item) => item.id !== id);
    writeLocalAnalises(items);
    return true;
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`/api/resources/edital_analises/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return true;
}

export async function limparAnalises() {
  if (!isSupabaseConfigured || !supabase) {
    writeLocalAnalises([]);
    return true;
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`/api/resources/edital_analises`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to clear analyses: ${res.status}`);
  return true;
}

// ── Documents ───────────────────────────────────────────────────

export async function uploadDocument(doc: { filename: string; mime_type: string; size: number; metadata?: Record<string, unknown> }) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(next));
    return next[0];
  }

  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(next));
    return next[0];
  }
  const res = await fetch(`/api/resources/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listDocuments() {
  if (!isSupabaseConfigured || !supabase) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  const res = await fetch(`/api/resources/documents`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to list documents: ${res.status}`);
  return res.json();
}

export async function deleteDocument(id: string) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]").filter((d: any) => d.id !== id);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(items));
    return true;
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) throw new Error("Authentication required");
  const res = await fetch(`/api/resources/documents/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return true;
}

// ── AI Analyses ─────────────────────────────────────────────────
export async function saveAiAnalysis(a: AIAnalysis) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-ai-analyses", JSON.stringify(next));
    return next[0];
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-ai-analyses", JSON.stringify(next));
    return next[0];
  }
  const res = await fetch(`/api/resources/ai_analyses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(a),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listAiAnalyses() {
  if (!isSupabaseConfigured || !supabase) return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
  const res = await fetch(`/api/resources/ai_analyses`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to list ai analyses: ${res.status}`);
  return res.json();
}

// ── Lattes Profiles ─────────────────────────────────────────────
export async function saveLattesProfile(p: LattesProfile) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(next));
    return next[0];
  }
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(next));
    return next[0];
  }
  const res = await fetch(`/api/resources/lattes_profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(p),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error || err?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getLattesProfiles() {
  if (!isSupabaseConfigured || !supabase) return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
  const tokenRes = await supabase.auth.getSession();
  const token = tokenRes?.data?.session?.access_token;
  if (!token) return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
  const res = await fetch(`/api/resources/lattes_profiles`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to list lattes profiles: ${res.status}`);
  return res.json();
}

// ── Article analyses, projects, planetarium and chat messages (basic) ─
export async function saveArticleAnalysis(a: ArticleAnalysis) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-article-analyses", JSON.stringify(next));
    return next[0];
  }
  const { data, error } = await supabase.from("article_analyses").insert([a]).select().single();
  if (error) throw error;
  return data;
}

export async function saveResearchProject(p: ResearchProject) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-research-projects", JSON.stringify(next));
    return next[0];
  }
  const { data, error } = await supabase.from("research_projects").insert([p]).select().single();
  if (error) throw error;
  return data;
}

export async function savePlanetariumContent(c: PlanetariumContent) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...c }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-planetarium", JSON.stringify(next));
    return next[0];
  }
  const { data, error } = await supabase.from("planetarium_contents").insert([c]).select().single();
  if (error) throw error;
  return data;
}

export async function saveChatMessage(m: ChatMessage) {
  if (!isSupabaseConfigured || !supabase) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-chat-messages") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...m }, ...items].slice(0, 500);
    window.localStorage.setItem("lupa-publica-chat-messages", JSON.stringify(next));
    return next[0];
  }
  const { data, error } = await supabase.from("chat_messages").insert([m]).select().single();
  if (error) throw error;
  return data;
}
