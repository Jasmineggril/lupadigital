/**
 * @file lib/lupa/types.ts
 * @description Tipos do fluxo docente: fonte oficial → edital estruturado →
 * perfil docente → recomendação explicada.
 */

import { z } from "zod";

// ── Perfil docente ───────────────────────────────────────────────────────────

/** Origem de um dado do perfil. Nenhuma origem comprova elegibilidade sozinha. */
export type FieldSource = "autodeclarado" | "importacao_json_provisoria" | "importacao_institucional" | "elattes";

export const OPPORTUNITY_TYPES = [
  "auxilio_pesquisa",
  "bolsa",
  "evento",
  "inovacao",
  "publicacao",
  "infraestrutura",
  "formacao",
] as const;

const termList = z
  .array(z.string().trim().min(1).max(120))
  .max(40)
  .transform((items) => Array.from(new Set(items.map((s) => s.trim()))));

/** Campos que o próprio docente pode editar. Papel/admin NÃO está aqui. */
export const ProfileInputSchema = z
  .object({
    display_name: z.string().trim().max(160).nullable().optional(),
    institution: z.string().trim().max(200).nullable().optional(),
    unit: z.string().trim().max(200).nullable().optional(),
    areas: termList.optional(),
    competencies: termList.optional(),
    research_topics: termList.optional(),
    keywords: termList.optional(),
    current_projects: z.string().trim().max(4000).nullable().optional(),
    opportunity_types: z.array(z.enum(OPPORTUNITY_TYPES)).max(OPPORTUNITY_TYPES.length).optional(),
    lattes_id: z
      .string()
      .trim()
      .regex(/^\d{16}$/, "O identificador Lattes tem 16 dígitos.")
      .nullable()
      .optional(),
    lattes_url: z
      .string()
      .trim()
      .url()
      .refine((u) => /^https?:\/\/(lattes\.cnpq\.br|buscatextual\.cnpq\.br)\//.test(u), "Use um endereço do Lattes (lattes.cnpq.br).")
      .nullable()
      .optional(),
    declared_degree: z.enum(["graduacao", "especializacao", "mestrado", "doutorado"]).nullable().optional(),
    declared_bond: z.enum(["efetivo", "temporario", "visitante", "aposentado", "sem_vinculo"]).nullable().optional(),
    notification_prefs: z
      .object({
        email: z.boolean(),
        frequency: z.enum(["diaria", "semanal", "nunca"]),
      })
      .optional(),
  })
  .strict();

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export interface TeacherProfile {
  user_id: string;
  display_name: string | null;
  institution: string | null;
  unit: string | null;
  areas: string[];
  competencies: string[];
  research_topics: string[];
  keywords: string[];
  current_projects: string | null;
  opportunity_types: string[];
  lattes_id: string | null;
  lattes_url: string | null;
  declared_degree: string | null;
  declared_bond: string | null;
  notification_prefs: { email: boolean; frequency: "diaria" | "semanal" | "nunca" };
  field_sources: Record<string, { source: FieldSource; updated_at: string }>;
  version: number;
  created_at: string;
  updated_at: string;
}

export function emptyProfile(userId: string, now = new Date().toISOString()): TeacherProfile {
  return {
    user_id: userId,
    display_name: null,
    institution: null,
    unit: null,
    areas: [],
    competencies: [],
    research_topics: [],
    keywords: [],
    current_projects: null,
    opportunity_types: [],
    lattes_id: null,
    lattes_url: null,
    declared_degree: null,
    declared_bond: null,
    notification_prefs: { email: false, frequency: "semanal" },
    field_sources: {},
    version: 0,
    created_at: now,
    updated_at: now,
  };
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

/** Um valor extraído do documento, sempre com a evidência (trecho) e a URL de origem. */
export interface Evidenced<T = string> {
  value: T;
  evidence: string;
  source_url: string;
}

export interface OpportunityFields {
  objeto?: Evidenced;
  areas?: Evidenced<string[]>;
  elegibilidade?: Evidenced[];
  requisitos?: Evidenced[];
  valores?: Evidenced[];
  documentos?: Evidenced[];
  datas?: Array<Evidenced & { label: string; iso: string | null }>;
  restricoes?: Evidenced[];
}

/** Campos que aparecem como "não encontrado / pendente de verificação" quando ausentes. */
export const EXTRACTED_FIELD_KEYS = [
  "objeto",
  "areas",
  "elegibilidade",
  "requisitos",
  "valores",
  "documentos",
  "datas",
  "restricoes",
] as const;

export type DocumentKind = "edital" | "anexo" | "retificacao" | "resultado" | "outro";
export type EventKind = "retificacao" | "prorrogacao" | "resultado";

export interface OpportunityDocument {
  url: string;
  kind: DocumentKind;
  title: string;
}

export interface OpportunityEvent {
  kind: EventKind;
  title: string;
  url: string | null;
  event_date: string | null;
  evidence: string;
}

export interface Opportunity {
  id: string;
  source_id: string;
  canonical_url: string;
  edital_number: string | null;
  title: string;
  status: "aberta" | "encerrada" | "desconhecida";
  fields: OpportunityFields;
  missing_fields: string[];
  content_hash: string;
  version: number;
  review_status: "pendente" | "revisado" | "rejeitado";
  reviewed_by: string | null;
  reviewed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  captured_at: string;
  documents: OpportunityDocument[];
  events: OpportunityEvent[];
}

export interface OpportunitySource {
  id: string;
  name: string;
  base_url: string;
  start_urls: string[];
  allowed_hosts: string[];
  max_depth: number;
  max_pages: number;
  time_budget_ms: number;
  request_delay_ms: number;
  frequency_minutes: number;
  enabled: boolean;
  updated_at: string;
}

export const SourceUpdateSchema = z
  .object({
    start_urls: z.array(z.string().url()).min(1).max(10).optional(),
    max_depth: z.number().int().min(0).max(4).optional(),
    max_pages: z.number().int().min(1).max(300).optional(),
    time_budget_ms: z.number().int().min(5_000).max(600_000).optional(),
    request_delay_ms: z.number().int().min(500).max(30_000).optional(),
    frequency_minutes: z.number().int().min(60).max(60 * 24 * 30).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export interface CollectionRun {
  id: string;
  source_id: string;
  trigger: "manual" | "hermes";
  triggered_by: string | null;
  status: "running" | "succeeded" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  stats: Record<string, number>;
  errors: Array<{ url: string; message: string }>;
}

// ── Recomendação ─────────────────────────────────────────────────────────────

export type EligibilityState = "atendida" | "nao_atendida" | "pendente_comprovacao";

export interface EligibilityCheck {
  requirement: string;
  evidence: string;
  source_url: string;
  state: EligibilityState;
  reason: string;
  /** Dado do perfil usado (sempre autodeclarado ou importado — nunca prova). */
  profile_basis: string | null;
}

export interface RecommendationResult {
  thematic: {
    score: number; // 0–100, aderência temática (não é probabilidade de aprovação)
    level: "alta" | "media" | "baixa" | "indeterminada";
    matches: Array<{ term: string; profile_field: string; evidence: string }>;
  };
  eligibility: {
    overall: "sem_impedimento_conhecido" | "impedimento" | "pendente";
    checks: EligibilityCheck[];
  };
  missing: string[];
  warnings: string[];
  summary: string;
}

export interface Recommendation {
  user_id: string;
  opportunity_id: string;
  opportunity_version: number;
  profile_version: number;
  result: RecommendationResult;
  computed_at: string;
}
