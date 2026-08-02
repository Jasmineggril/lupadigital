// Tipos e contratos para a pipeline de ingestão unificada (texto / url / pdf)

export type InputSourceType = "text" | "url" | "pdf";

export type IngestRequest = {
  id?: string; // opcional, gerado pelo sistema
  sourceType: InputSourceType;
  content?: string; // texto colado
  url?: string; // quando sourceType === 'url'
  fileBuffer?: Buffer | null; // quando já recebeu bytes (pdf)
  filename?: string;
  userId?: string | null;
  meta?: Record<string, any>;
};

export type RawDocument = {
  id: string;
  sourceType: InputSourceType;
  originalText?: string; // quando extraído
  html?: string; // quando aplicável
  pages?: number; // para PDFs
  metadata?: Record<string, any>;
};

export type ExtractedDocument = {
  id: string;
  text: string;
  title?: string | null;
  authors?: string[];
  pages?: number;
  metadata?: Record<string, any>;
};

export type NormalizedDocument = {
  id: string;
  canonicalText: string; // texto limpo e normalizado
  tokensEstimate: number;
  metadata?: Record<string, any>;
};

export type Chunk = {
  id: string;
  index: number;
  text: string;
  tokensEstimate: number;
  metadata?: Record<string, any>;
};

export type ChunkedDocument = {
  id: string;
  chunks: Chunk[];
  originalTokensEstimate: number;
};

export type CanonicalAnalysis = {
  id: string;
  interpretation: any; // estrutura canônica (ver buildCanonicalAnalysis)
  timeline: any;
  checklist: any;
  eligibility: any;
  chatContext?: any;
  history?: any[];
  exports?: Record<string, any>;
  metadata?: Record<string, any>;
};

export type IngestError = {
  code: string;
  message: string;
  details?: any;
};

export type IngestResult =
  | { success: true; canonical: CanonicalAnalysis }
  | { success: false; error: IngestError };

export default {};
