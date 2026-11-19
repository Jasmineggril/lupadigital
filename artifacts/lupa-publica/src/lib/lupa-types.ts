/**
 * @file lupa-types.ts
 * @description Tipos das respostas da API do fluxo docente (espelham
 * artifacts/api-server/src/lib/lupa/types.ts).
 */

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

export interface Opportunity {
  id: string;
  source_id: string;
  canonical_url: string;
  edital_number: string | null;
  title: string;
  status: "aberta" | "encerrada" | "desconhecida";
  fields: OpportunityFields;
  missing_fields: string[];
  version: number;
  review_status: "pendente" | "revisado" | "rejeitado";
  first_seen_at: string;
  last_seen_at: string;
  captured_at: string;
  documents: Array<{ url: string; kind: "edital" | "anexo" | "retificacao" | "resultado" | "outro"; title: string }>;
  events: Array<{ kind: "retificacao" | "prorrogacao" | "resultado"; title: string; url: string | null; event_date: string | null; evidence: string }>;
}

export type EligibilityState = "atendida" | "nao_atendida" | "pendente_comprovacao";

export interface RecommendationResult {
  thematic: { score: number; level: "alta" | "media" | "baixa" | "indeterminada"; matches: Array<{ term: string; profile_field: string; evidence: string }> };
  eligibility: {
    overall: "sem_impedimento_conhecido" | "impedimento" | "pendente";
    checks: Array<{ requirement: string; evidence: string; source_url: string; state: EligibilityState; reason: string; profile_basis: string | null }>;
  };
  missing: string[];
  warnings: string[];
  summary: string;
}

export interface Recommendation {
  opportunity_id: string;
  opportunity_version: number;
  profile_version: number;
  computed_at: string;
  result: RecommendationResult;
  opportunity: Opportunity;
  feedback: { relevant: boolean } | null;
  saved: boolean;
}

export type FieldSource = "autodeclarado" | "importacao_json_provisoria" | "importacao_institucional" | "elattes";

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
  declared_degree: "graduacao" | "especializacao" | "mestrado" | "doutorado" | null;
  declared_bond: "efetivo" | "temporario" | "visitante" | "aposentado" | "sem_vinculo" | null;
  notification_prefs: { email: boolean; frequency: "diaria" | "semanal" | "nunca" };
  field_sources: Record<string, { source: FieldSource; updated_at: string }>;
  version: number;
  updated_at: string;
}

export const SOURCE_LABELS: Record<FieldSource, string> = {
  autodeclarado: "autodeclarado",
  importacao_json_provisoria: "importado de JSON (provisório)",
  importacao_institucional: "importação institucional",
  elattes: "eLattes",
};

export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  auxilio_pesquisa: "Auxílio à pesquisa",
  bolsa: "Bolsas",
  evento: "Eventos científicos",
  inovacao: "Inovação e empreendedorismo",
  publicacao: "Publicação",
  infraestrutura: "Infraestrutura e equipamentos",
  formacao: "Formação e capacitação",
};

export const FIELD_LABELS: Record<string, string> = {
  objeto: "Objeto",
  areas: "Áreas",
  elegibilidade: "Elegibilidade",
  requisitos: "Requisitos",
  valores: "Valores",
  documentos: "Documentos",
  datas: "Datas",
  restricoes: "Restrições",
};

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Prazo de submissão confirmado na fonte (com evidência), se houver. */
export function confirmedDeadline(o: Opportunity): { iso: string; evidence: string; url: string } | null {
  const dates = (o.fields.datas ?? []).filter((d) => d.iso && /^(inscri|submiss|propostas|envio|prazo|encerramento)/.test(d.label));
  if (!dates.length) return null;
  const last = dates.sort((a, b) => (a.iso as string).localeCompare(b.iso as string)).at(-1)!;
  return { iso: last.iso as string, evidence: last.evidence, url: last.source_url };
}
