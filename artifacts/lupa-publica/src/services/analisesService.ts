/**
 * Serviço de persistência para análises (frontend).
 *
 * Responsabilidade:
 * - Encapsular chamadas à API autoritativa (`/api/resources/...`) para CRUD de análises;
 * - Fornecer fallback `localStorage` quando o backend não estiver disponível;
 * - Garantir que o frontend não grave diretamente nas tabelas protegidas do Supabase.
 *
 * Por que: manter a API como única fonte de escrita é essencial para
 * aplicar políticas, RLS e auditoria de forma centralizada no backend.
 */
import { getSupabaseSessionToken, isSupabaseConfigured } from "@/lib/supabase";
import type {
    AIAnalysis,
    ArticleAnalysis,
    ChatMessage,
    DocumentRow as DocType,
    LattesProfile,
    PlanetariumContent,
    ResearchProject,
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

const readLocalItems = <T>(key: string): T[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
};

const writeLocalItems = <T>(key: string, items: T[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(items));
};

const readLocalAnalises = (): AnaliseSalva[] => readLocalItems<AnaliseSalva>(STORAGE_KEY);
const writeLocalAnalises = (items: AnaliseSalva[]) => writeLocalItems(STORAGE_KEY, items);

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

async function getAuthHeaders() {
  if (!isSupabaseConfigured) return null;
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
  if (!isSupabaseConfigured) return false;
  const authHeaders = await getAuthHeaders();
  return Boolean(authHeaders);
}

function createFallbackItem<T extends { id?: string }>(item: T, fallbackKey: string, limit = 100) {
  const normalizedItem = {
    ...item,
    id: item.id ?? crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const next = [normalizedItem, ...readLocalItems<T>(fallbackKey)].slice(0, limit);
  writeLocalItems(fallbackKey, next);
  return next[0];
}

export async function salvarAnalise(analise: AnaliseSalva) {
  if (!(await useBackend())) {
    const fallback: AnaliseSalva = {
      ...analise,
      id: analise.id ?? crypto.randomUUID(),
      created_at: analise.created_at ?? new Date().toISOString(),
      favorito: analise.favorito ?? false,
    };
    const items = [fallback, ...readLocalAnalises()].slice(0, 50);
    writeLocalAnalises(items);
    return fallback;
  }

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
}

/**
 * Lista análises do usuário via API; usa fallback local quando offline.
 */
export async function listarAnalises() {
  if (!(await useBackend())) {
    return readLocalAnalises();
  }

  return await apiRequest<AnaliseSalva[]>("/resources/edital_analyses");
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
        .filter((item: AnaliseSalva) => Boolean(item.id))
        .map((item: AnaliseSalva) => apiRequest<void>(`/resources/edital_analyses/${item.id}`, { method: "DELETE" })),
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
    return createFallbackItem({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, "lupa-publica-documents") as DocType;
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
    return createFallbackItem({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...doc }, "lupa-publica-documents") as DocType;
  }
}

export async function listDocuments() {
  if (!(await useBackend())) {
    return readLocalItems<DocType>("lupa-publica-documents");
  }

  try {
    return await apiRequest<DocType[]>("/resources/documents");
  } catch {
    return readLocalItems<DocType>("lupa-publica-documents");
  }
}

export async function deleteDocument(id: string) {
  if (!(await useBackend())) {
    const items = readLocalItems<DocType>("lupa-publica-documents").filter((d) => d.id !== id);
    writeLocalItems("lupa-publica-documents", items);
    return true;
  }

  try {
    await apiRequest<void>(`/resources/documents/${id}`, { method: "DELETE" });
    return true;
  } catch {
    const items = readLocalItems<DocType>("lupa-publica-documents").filter((d) => d.id !== id);
    writeLocalItems("lupa-publica-documents", items);
    return true;
  }
}

// ── AI Analyses ─────────────────────────────────────────────────
export async function saveAiAnalysis(a: AIAnalysis) {
  if (!(await useBackend())) {
    return createFallbackItem(a, "lupa-publica-ai-analyses") as AIAnalysis;
  }

  try {
    return await apiRequest<AIAnalysis>("/resources/ai_analyses", {
      method: "POST",
      body: JSON.stringify(a),
    });
  } catch {
    return createFallbackItem(a, "lupa-publica-ai-analyses") as AIAnalysis;
  }
}

export async function listAiAnalyses() {
  if (!(await useBackend())) return readLocalItems<AIAnalysis>("lupa-publica-ai-analyses");

  try {
    return await apiRequest<AIAnalysis[]>("/resources/ai_analyses");
  } catch {
    return readLocalItems<AIAnalysis>("lupa-publica-ai-analyses");
  }
}

// ── Lattes Profiles ─────────────────────────────────────────────
export async function saveLattesProfile(p: LattesProfile) {
  if (!(await useBackend())) {
    return createFallbackItem(p, "lupa-publica-lattes", 50) as LattesProfile;
  }

  try {
    return await apiRequest<LattesProfile>("/resources/lattes_profiles", {
      method: "POST",
      body: JSON.stringify(p),
    });
  } catch {
    return createFallbackItem(p, "lupa-publica-lattes", 50) as LattesProfile;
  }
}

export async function getLattesProfiles() {
  if (!(await useBackend())) return readLocalItems<LattesProfile>("lupa-publica-lattes");

  try {
    return await apiRequest<LattesProfile[]>("/resources/lattes_profiles");
  } catch {
    return readLocalItems<LattesProfile>("lupa-publica-lattes");
  }
}

// ── Article analyses, projects, planetarium and chat messages (basic) ─
export async function saveArticleAnalysis(a: ArticleAnalysis) {
  if (!(await useBackend())) {
    return createFallbackItem(a, "lupa-publica-article-analyses") as ArticleAnalysis;
  }

  try {
    return await apiRequest<ArticleAnalysis>("/resources/article_analyses", {
      method: "POST",
      body: JSON.stringify(a),
    });
  } catch {
    return createFallbackItem(a, "lupa-publica-article-analyses") as ArticleAnalysis;
  }
}

export async function saveResearchProject(p: ResearchProject) {
  if (!(await useBackend())) {
    return createFallbackItem(p, "lupa-publica-research-projects") as ResearchProject;
  }

  try {
    return await apiRequest<ResearchProject>("/resources/research_projects", {
      method: "POST",
      body: JSON.stringify(p),
    });
  } catch {
    return createFallbackItem(p, "lupa-publica-research-projects") as ResearchProject;
  }
}

export async function savePlanetariumContent(c: PlanetariumContent) {
  if (!(await useBackend())) {
    return createFallbackItem(c, "lupa-publica-planetarium") as PlanetariumContent;
  }

  try {
    return await apiRequest<PlanetariumContent>("/resources/planetarium_contents", {
      method: "POST",
      body: JSON.stringify(c),
    });
  } catch {
    return createFallbackItem(c, "lupa-publica-planetarium") as PlanetariumContent;
  }
}

export async function saveChatMessage(m: ChatMessage) {
  if (!(await useBackend())) {
    return createFallbackItem(m, "lupa-publica-chat-messages", 500) as ChatMessage;
  }

  try {
    return await apiRequest<ChatMessage>("/resources/chat_messages", {
      method: "POST",
      body: JSON.stringify(m),
    });
  } catch {
    return createFallbackItem(m, "lupa-publica-chat-messages", 500) as ChatMessage;
  }
}
