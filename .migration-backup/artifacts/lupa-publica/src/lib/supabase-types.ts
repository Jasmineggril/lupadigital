export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface EditalAnalysis {
  id?: string;
  created_at?: string;
  titulo?: string | null;
  conteudo_original?: string | null;
  conteudo_simplificado?: string | null;
  categoria?: string | null;
  modo_analise?: string | null;
  indicadores?: Json | null;
  timeline?: Json | null;
  recomendacoes?: Json | null;
  favorito?: boolean | null;
}

export interface DocumentRow {
  id?: string;
  created_at?: string;
  filename?: string | null;
  mime_type?: string | null;
  size?: number | null;
  metadata?: Json | null;
}

export interface AIAnalysis {
  id?: string;
  created_at?: string;
  model?: string | null;
  input?: string | null;
  output?: Json | null;
  metadata?: Json | null;
}

export interface LattesProfile {
  id?: string;
  created_at?: string;
  name?: string | null;
  lattes_xml?: string | null;
  summary?: string | null;
  metadata?: Json | null;
}

export interface ArticleAnalysis {
  id?: string;
  created_at?: string;
  title?: string | null;
  authors?: string[] | null;
  summary?: string | null;
  metadata?: Json | null;
}

export interface ResearchProject {
  id?: string;
  created_at?: string;
  title?: string | null;
  description?: string | null;
  team?: Json | null;
  timeline?: Json | null;
}

export interface PlanetariumContent {
  id?: string;
  created_at?: string;
  title?: string | null;
  content?: string | null;
  audience?: string | null;
  metadata?: Json | null;
}

export interface ChatMessage {
  id?: string;
  created_at?: string;
  conversation_id?: string | null;
  role?: "user" | "assistant" | "system" | null;
  content?: string | null;
  metadata?: Json | null;
}

export interface AiUsageLog {
  id?: string;
  created_at?: string;
  user_id?: string | null;
  document_id?: string | null;
  module?: string | null;
  model?: string | null;
  latency_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  success?: boolean | null;
  error_message?: string | null;
}

export interface Database {
  public: {
    Tables: {
      documents: {
        Row: DocumentRow;
        Insert: Omit<DocumentRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<DocumentRow, "id" | "created_at">>;
      };
      ai_analyses: {
        Row: AIAnalysis;
        Insert: Omit<AIAnalysis, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<AIAnalysis, "id" | "created_at">>;
      };
      edital_analyses: {
        Row: EditalAnalysis;
        Insert: Omit<EditalAnalysis, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<EditalAnalysis, "id" | "created_at">>;
      };
      lattes_profiles: {
        Row: LattesProfile;
        Insert: Omit<LattesProfile, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<LattesProfile, "id" | "created_at">>;
      };
      article_analyses: {
        Row: ArticleAnalysis;
        Insert: Omit<ArticleAnalysis, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ArticleAnalysis, "id" | "created_at">>;
      };
      research_projects: {
        Row: ResearchProject;
        Insert: Omit<ResearchProject, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ResearchProject, "id" | "created_at">>;
      };
      planetarium_contents: {
        Row: PlanetariumContent;
        Insert: Omit<PlanetariumContent, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<PlanetariumContent, "id" | "created_at">>;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<ChatMessage, "id" | "created_at">>;
      };
      ai_usage_logs: {
        Row: AiUsageLog;
        Insert: Omit<AiUsageLog, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<AiUsageLog, "id" | "created_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
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
