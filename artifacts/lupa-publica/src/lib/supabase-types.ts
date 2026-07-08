// Types for Supabase tables used by the frontend

export interface EditalAnalysis {
  id?: string;
  created_at?: string;
  titulo?: string | null;
  conteudo_original?: string | null;
  conteudo_simplificado?: string | null;
  categoria?: string | null;
  modo_analise?: string | null;
  indicadores?: Record<string, unknown> | null;
  timeline?: Record<string, unknown> | null;
  recomendacoes?: Record<string, unknown> | null;
  favorito?: boolean | null;
}

export interface DocumentRow {
  id?: string;
  created_at?: string;
  filename?: string;
  mime_type?: string;
  size?: number;
  metadata?: Record<string, unknown> | null;
}

export interface AIAnalysis {
  id?: string;
  created_at?: string;
  model?: string;
  input?: string;
  output?: Record<string, unknown> | string | null;
  metadata?: Record<string, unknown> | null;
}

export interface LattesProfile {
  id?: string;
  created_at?: string;
  name?: string;
  lattes_xml?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ArticleAnalysis {
  id?: string;
  created_at?: string;
  title?: string;
  authors?: string[] | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ResearchProject {
  id?: string;
  created_at?: string;
  title?: string;
  description?: string | null;
  team?: Record<string, unknown>[] | null;
  timeline?: Record<string, unknown> | null;
}

export interface PlanetariumContent {
  id?: string;
  created_at?: string;
  title?: string;
  content?: string | null;
  audience?: string | null;
}

export interface ChatMessage {
  id?: string;
  created_at?: string;
  conversation_id?: string | null;
  role?: "user" | "assistant" | "system";
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type SupabaseTables = {
  documents: DocumentRow;
  ai_analyses: AIAnalysis;
  edital_analyses: EditalAnalysis;
  lattes_profiles: LattesProfile;
  article_analyses: ArticleAnalysis;
  research_projects: ResearchProject;
  planetarium_contents: PlanetariumContent;
  chat_messages: ChatMessage;
};

export default {};
