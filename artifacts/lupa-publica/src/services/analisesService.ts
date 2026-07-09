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

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

async function getAuthHeaders() {
  if (!isSupabaseConfigured || !supabase) return null;
  const token = await getSupabaseSessionToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function apiRequest<T>(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) ?? {}),
  };

  const authHeaders = await getAuthHeaders();
  if (authHeaders) {
    Object.assign(headers, authHeaders);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API request failed (${response.status}) ${body}`);
  }

  const text = await response.text();
  if (!text) return null as any;
  return JSON.parse(text) as T;
}

async function useBackend(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  const authHeaders = await getAuthHeaders();
  return Boolean(authHeaders);
}

export async function salvarAnalise(analise: AnaliseSalva) {
  if (!(await useBackend())) {
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
    return await apiRequest<AnaliseSalva>(
      "/resources/edital_analyses",
      {
        method: "POST",
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
      },
    );
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
  if (!(await useBackend())) {
    return readLocalAnalises();
  }

  try {
    return await apiRequest<AnaliseSalva[]>("/resources/edital_analyses");
  } catch {
    return readLocalAnalises();
  }
}

export async function atualizarAnalise(analise: AnaliseSalva) {
  if (!analise.id) throw new Error("ID da análise é necessário para atualização.");

  if (!(await useBackend())) {
    const items = readLocalAnalises().map((item) =>
      item.id === analise.id ? { ...item, ...analise, favorito: analise.favorito ?? item.favorito ?? false } : item
    );
    writeLocalAnalises(items);
    return items.find((item) => item.id === analise.id) ?? analise;
  }

  try {
    return await apiRequest<AnaliseSalva>(
      `/resources/edital_analyses/${analise.id}`,
      {
        method: "PUT",
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
      },
    );
  } catch {
    const items = readLocalAnalises().map((item) =>
      item.id === analise.id ? { ...item, ...analise, favorito: analise.favorito ?? item.favorito ?? false } : item
    );
    writeLocalAnalises(items);
    return items.find((item) => item.id === analise.id) ?? analise;
  }
}

export async function excluirAnalise(id: string) {
  if (!(await useBackend())) {
    const items = readLocalAnalises().filter((item) => item.id !== id);
    writeLocalAnalises(items);
    return true;
  }

  try {
    await apiRequest<void>(`/resources/edital_analyses/${id}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    const items = readLocalAnalises().filter((item) => item.id !== id);
    writeLocalAnalises(items);
    return true;
  }
}

export async function limparAnalises() {
  if (!(await useBackend())) {
    writeLocalAnalises([]);
    return true;
  }

  try {
    const items = await apiRequest<AnaliseSalva[]>("/resources/edital_analyses");
    await Promise.all(
      items
        .filter((item) => item.id)
        .map((item) => apiRequest<void>(`/resources/edital_analyses/${item.id}`, { method: "DELETE" })),
    );
    return true;
  } catch {
    writeLocalAnalises([]);
    return true;
  }
}

// ── Documents ───────────────────────────────────────────────────

export async function uploadDocument(doc: { filename: string; mime_type: string; size: number; metadata?: Record<string, unknown> }) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<DocType>(
      "/resources/documents",
      {
        method: "POST",
        body: JSON.stringify({
          filename: doc.filename,
          mime_type: doc.mime_type,
          size: doc.size,
          metadata: doc.metadata ?? null,
        }),
      },
    );
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(next));
    return next[0];
  }
}

export async function listDocuments() {
  if (!(await useBackend())) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  }

  try {
    return await apiRequest<DocType[]>("/resources/documents");
  } catch {
    return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  }
}

export async function deleteDocument(id: string) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]").filter((d: any) => d.id !== id);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(items));
    return true;
  }

  try {
    await apiRequest<void>(`/resources/documents/${id}`, { method: "DELETE" });
    return true;
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]").filter((d: any) => d.id !== id);
    window.localStorage.setItem("lupa-publica-documents", JSON.stringify(items));
    return true;
  }
}

// ── AI Analyses ─────────────────────────────────────────────────
export async function saveAiAnalysis(a: AIAnalysis) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-ai-analyses", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<AIAnalysis>("/resources/ai_analyses", {
      method: "POST",
      body: JSON.stringify(a),
    });
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-ai-analyses", JSON.stringify(next));
    return next[0];
  }
}

export async function listAiAnalyses() {
  if (!(await useBackend())) return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");

  try {
    return await apiRequest<AIAnalysis[]>("/resources/ai_analyses");
  } catch {
    return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");
  }
}

// ── Lattes Profiles ─────────────────────────────────────────────
export async function saveLattesProfile(p: LattesProfile) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<LattesProfile>("/resources/lattes_profiles", {
      method: "POST",
      body: JSON.stringify(p),
    });
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 50);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(next));
    return next[0];
  }
}

export async function getLattesProfiles() {
  if (!(await useBackend())) return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");

  try {
    return await apiRequest<LattesProfile[]>("/resources/lattes_profiles");
  } catch {
    return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");
  }
}

// ── Article analyses, projects, planetarium and chat messages (basic) ─
export async function saveArticleAnalysis(a: ArticleAnalysis) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-article-analyses", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<ArticleAnalysis>("/resources/article_analyses", {
      method: "POST",
      body: JSON.stringify(a),
    });
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...a }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-article-analyses", JSON.stringify(next));
    return next[0];
  }
}

export async function saveResearchProject(p: ResearchProject) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-research-projects", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<ResearchProject>("/resources/research_projects", {
      method: "POST",
      body: JSON.stringify(p),
    });
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-research-projects", JSON.stringify(next));
    return next[0];
  }
}

export async function savePlanetariumContent(c: PlanetariumContent) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...c }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-planetarium", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<PlanetariumContent>("/resources/planetarium_contents", {
      method: "POST",
      body: JSON.stringify(c),
    });
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...c }, ...items].slice(0, 100);
    window.localStorage.setItem("lupa-publica-planetarium", JSON.stringify(next));
    return next[0];
  }
}

export async function saveChatMessage(m: ChatMessage) {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-chat-messages") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...m }, ...items].slice(0, 500);
    window.localStorage.setItem("lupa-publica-chat-messages", JSON.stringify(next));
    return next[0];
  }

  try {
    return await apiRequest<ChatMessage>("/resources/chat_messages", {
      method: "POST",
      body: JSON.stringify(m),
    });
  } catch {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-chat-messages") || "[]");
    const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...m }, ...items].slice(0, 500);
    window.localStorage.setItem("lupa-publica-chat-messages", JSON.stringify(next));
    return next[0];
  }
}
