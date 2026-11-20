/**
 * @file analisesService.ts
 * @description Camada de serviço para persistência de análises do usuário.
 *
 * Dois caminhos, escolhidos por `useBackend()`:
 *   1. Logado (JWT presente): API Express → Supabase. Se a API falhar, a função
 *      lança PersistError — a interface mostra a falha. Não há cópia silenciosa
 *      no navegador.
 *   2. Sem login: localStorage deste navegador (a interface deve dizer isso).
 *
 * Funções exportadas:
 *   - salvarAnalise(analise)     → salva edital analisado
 *   - listarAnalises()           → lista análises do usuário
 *   - deletarAnalise(id)         → remove análise por ID
 *   - toggleFavorito(id, val)    → alterna favorito de uma análise
 *   - salvarAgentResult(data)    → persiste resultado de agente especializado
 *   - listarAgentHistory()       → lista histórico de agentes
 *   - deletarAgentResult(id)     → remove resultado de agente
 *   - Funções análogas para NIASci: Lattes, Artigos, Projetos, Planetário, Chat
 *
 * Todos os tipos de resposta seguem os schemas Zod definidos em @workspace/api-zod.
 */

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

/** Chave usada para persistência de análises no localStorage (fallback offline) */
const STORAGE_KEY = "lupa-publica-analises";

/**
 * Lê a lista de análises salvas no localStorage.
 * Retorna array vazio em caso de parse error ou ambiente server-side.
 */
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

/**
 * URL base para chamadas à API do backend.
 * Resolve o BASE_URL do Vite para funcionar em dev e produção (Vercel).
 */
const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

/**
 * Retorna os headers de autenticação JWT para incluir nas chamadas à API.
 * Retorna null se o usuário não estiver autenticado (sem sessão Supabase ativa).
 * Quando null, as funções fazem fallback para localStorage.
 *
 * @returns Objeto { Authorization: "Bearer <jwt>" } ou null
 */
async function getAuthHeaders() {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const token = await getSupabaseSessionToken();
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  } catch {
    return null;
  }
}

/**
 * Wrapper genérico para chamadas à API backend.
 * Injeta automaticamente o header Authorization com o JWT Supabase se disponível.
 * Lança erro em respostas não-ok (4xx, 5xx) com o body da resposta.
 * Retorna null (como T) para respostas 204 No Content.
 *
 * @template T - Tipo esperado da resposta JSON
 * @param path - Caminho relativo à API_BASE (ex: "/resources/edital_analyses")
 * @param opts - Opções adicionais do fetch (method, body, etc.)
 * @returns Objeto tipado ou null para respostas sem corpo
 */
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
    if (response.status === 429) {
      let msg = "A IA está sobrecarregada agora. Aguarde alguns segundos e tente novamente.";
      try { msg = (JSON.parse(body) as { error?: string }).error ?? msg; } catch { /* usa padrão */ }
      throw new Error(`RATE_LIMIT: ${msg}`);
    }
    throw new Error(`API request failed (${response.status}) ${body}`);
  }

  const text = await response.text();
  if (!text) return null as unknown as T;
  return JSON.parse(text) as T;
}

/**
 * Decide se deve usar o backend (API + JWT) ou localStorage para a operação.
 * Retorna true se o Supabase está configurado E há sessão ativa (JWT disponível).
 * Retorna false para usuários não autenticados → operações vão para localStorage.
 */
async function useBackend(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const authHeaders = await getAuthHeaders();
    return Boolean(authHeaders);
  } catch {
    return false;
  }
}

/**
 * Salva uma análise de edital no backend (autenticado) ou localStorage (fallback).
 * Em caso de falha na API, salva localmente para não perder o trabalho do usuário.
 * Limita o localStorage a 50 itens (os mais recentes).
 *
 * @param analise - Dados da análise a salvar
 * @returns O objeto salvo com id e created_at preenchidos
 */
/**
 * Erro de persistência com mensagem clara para a interface. Usuário logado: os dados
 * vão para o servidor; se ele falhar, a operação FALHA (nada de guardar no navegador
 * sem avisar e mostrar "salvo"). Sem login, o armazenamento local é o caminho normal.
 */
export class PersistError extends Error {}
function persistError(err: unknown): PersistError {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith("RATE_LIMIT:")) return new PersistError(raw.replace("RATE_LIMIT: ", ""));
  return new PersistError("Não foi possível salvar no servidor. Nada foi gravado; tente novamente.");
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

export async function listarAnalises() {
  if (!(await useBackend())) {
    return readLocalAnalises();
  }

  try {
    return await apiRequest<AnaliseSalva[]>("/resources/edital_analyses");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

export async function listDocuments() {
  if (!(await useBackend())) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-documents") || "[]");
  }

  try {
    return await apiRequest<DocType[]>("/resources/documents");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

export async function listAiAnalyses() {
  if (!(await useBackend())) return JSON.parse(window.localStorage.getItem("lupa-publica-ai-analyses") || "[]");

  try {
    return await apiRequest<AIAnalysis[]>("/resources/ai_analyses");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

export async function getLattesProfiles() {
  if (!(await useBackend())) return JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]");

  try {
    return await apiRequest<LattesProfile[]>("/resources/lattes_profiles");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

// ── Funções de listagem dos módulos NIASci ───────────────────────────────────
// Cada função segue o mesmo padrão dual: Supabase preferido, localStorage fallback.

/**
 * Lista análises de artigos científicos salvas (módulo Artigos).
 * Retorna do Supabase se autenticado, senão do localStorage.
 */
export async function listArticleAnalyses(): Promise<ArticleAnalysis[]> {
  if (!(await useBackend())) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]");
  }
  try {
    return await apiRequest<ArticleAnalysis[]>("/resources/article_analyses");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Exclui uma análise de artigo por ID.
 */
export async function deleteArticleAnalysis(id: string): Promise<boolean> {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-article-analyses") || "[]")
      .filter((a: ArticleAnalysis) => a.id !== id);
    window.localStorage.setItem("lupa-publica-article-analyses", JSON.stringify(items));
    return true;
  }
  try {
    await apiRequest<void>(`/resources/article_analyses/${id}`, { method: "DELETE" });
    return true;
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Lista projetos de pesquisa salvos (módulo Projetos).
 */
export async function listResearchProjects(): Promise<ResearchProject[]> {
  if (!(await useBackend())) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]");
  }
  try {
    return await apiRequest<ResearchProject[]>("/resources/research_projects");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Exclui um projeto de pesquisa por ID.
 */
export async function deleteResearchProject(id: string): Promise<boolean> {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-research-projects") || "[]")
      .filter((p: ResearchProject) => p.id !== id);
    window.localStorage.setItem("lupa-publica-research-projects", JSON.stringify(items));
    return true;
  }
  try {
    await apiRequest<void>(`/resources/research_projects/${id}`, { method: "DELETE" });
    return true;
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Lista conteúdos do Planetário salvos.
 */
export async function listPlanetariumContents(): Promise<PlanetariumContent[]> {
  if (!(await useBackend())) {
    return JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]");
  }
  try {
    return await apiRequest<PlanetariumContent[]>("/resources/planetarium_contents");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Exclui um conteúdo do Planetário por ID.
 */
export async function deletePlanetariumContent(id: string): Promise<boolean> {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-planetarium") || "[]")
      .filter((c: PlanetariumContent) => c.id !== id);
    window.localStorage.setItem("lupa-publica-planetarium", JSON.stringify(items));
    return true;
  }
  try {
    await apiRequest<void>(`/resources/planetarium_contents/${id}`, { method: "DELETE" });
    return true;
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Lista mensagens do chat do Assistente IA por ID de conversa.
 */
export async function listChatMessages(conversationId?: string): Promise<ChatMessage[]> {
  if (!(await useBackend())) {
    const all = JSON.parse(window.localStorage.getItem("lupa-publica-chat-messages") || "[]") as ChatMessage[];
    return conversationId ? all.filter((m) => m.conversation_id === conversationId) : all;
  }
  try {
    return await apiRequest<ChatMessage[]>("/resources/chat_messages");
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}

/**
 * Exclui um perfil Lattes por ID (módulo e-Lattes).
 */
export async function deleteLattesProfile(id: string): Promise<boolean> {
  if (!(await useBackend())) {
    const items = JSON.parse(window.localStorage.getItem("lupa-publica-lattes") || "[]")
      .filter((p: LattesProfile) => p.id !== id);
    window.localStorage.setItem("lupa-publica-lattes", JSON.stringify(items));
    return true;
  }
  try {
    await apiRequest<void>(`/resources/lattes_profiles/${id}`, { method: "DELETE" });
    return true;
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
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
  } catch (err) {
    // Logado: falha do servidor é falha (sem cópia silenciosa no navegador)
    throw persistError(err);
  }
}
