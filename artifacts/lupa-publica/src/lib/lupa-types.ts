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
  contrapartidas?: Evidenced[];
  parcerias?: Evidenced[];
  criterios_avaliacao?: Evidenced[];
  canal_inscricao?: Evidenced[];
}

export type OpportunityStatus = "aberta" | "encerrada" | "suspensa" | "cancelada" | "desconhecida";

export interface Opportunity {
  id: string;
  source_id: string;
  canonical_url: string;
  edital_number: string | null;
  title: string;
  status: OpportunityStatus;
  fields: OpportunityFields;
  missing_fields: string[];
  version: number;
  review_status: "pendente" | "revisado" | "rejeitado";
  first_seen_at: string;
  last_seen_at: string;
  captured_at: string;
  documents: Array<{ url: string; kind: "edital" | "anexo" | "retificacao" | "resultado" | "outro"; title: string }>;
  events: Array<{ kind: "retificacao" | "prorrogacao" | "resultado"; title: string; url: string | null; event_date: string | null; evidence: string }>;
  /** Último prazo de submissão confirmado no texto oficial (calculado no servidor) */
  deadline?: string | null;
  /** Tipos inferidos do título/objeto (ex.: bolsa, evento) */
  types?: string[];
  interested?: boolean;
  changed_since_saved?: boolean;
}

export interface CatalogResponse {
  opportunities: Opportunity[];
  total: number;
  page: number;
  page_size: number;
  facets: { sources: string[]; areas: string[] };
  updated_at: string | null;
  /** Por que o catálogo está como está (ausente em servidores antigos) */
  coleta?: {
    situacao: "com_itens" | "nunca_coletado" | "coletando" | "coleta_falhou" | "coleta_sem_itens" | "desconhecida";
    ultima: { status: "running" | "succeeded" | "partial" | "failed"; iniciada_em: string; concluida_em: string | null; erros: number; motivo: string | null } | null;
    pendentes_revisao: number;
  };
}

/** Texto do catálogo vazio conforme o estado real da coleta (nunca "vazio" sem motivo). */
export function emptyCatalogMessage(c: CatalogResponse["coleta"]): { title: string; description: string } {
  const when = c?.ultima ? formatDateTime(c.ultima.concluida_em ?? c.ultima.iniciada_em) : "";
  switch (c?.situacao) {
    case "nunca_coletado":
      return { title: "Catálogo ainda não coletado", description: "Nenhuma coleta foi executada nas fontes oficiais até agora. Os editais aparecem aqui depois da primeira coleta." };
    case "coletando":
      return { title: "Coleta em andamento", description: `A coleta começou em ${when}. Volte em alguns minutos.` };
    case "coleta_falhou":
      return { title: "A última coleta falhou", description: `A coleta de ${when} não conseguiu ler a fonte oficial${c.ultima?.motivo ? ` (${c.ultima.motivo})` : ""}. O catálogo não tem editais confirmados por enquanto; a administração foi informada pelo registro da execução.` };
    case "coleta_sem_itens":
      return { title: "Nenhum edital encontrado na última coleta", description: `A coleta de ${when} terminou sem localizar editais na fonte oficial${c.ultima?.erros ? ` (${c.ultima.erros} página(s) com erro)` : ""}. Isso pode indicar mudança no site da fonte.` };
    default:
      return { title: "Catálogo vazio", description: "Ainda não há editais coletados. A administração executa a coleta das fontes oficiais." };
  }
}

export interface NotificationItem {
  id: string;
  kind: "recomendacao" | "mudanca_salvo";
  opportunity_id: string;
  opportunity_version: number;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export type EligibilityState = "atendida" | "nao_atendida" | "pendente_comprovacao";

export interface RecommendationResult {
  thematic: { score: number; level: "alta" | "media" | "baixa" | "indeterminada"; matches: Array<{ term: string; profile_field: string; evidence: string }> };
  eligibility: {
    overall: "sem_impedimento_conhecido" | "impedimento" | "pendente";
    checks: Array<{ requirement: string; evidence: string; source_url: string; state: EligibilityState; reason: string; profile_basis: string | null }>;
  };
  interest?: {
    opportunity_type: "corresponde" | "nao_corresponde" | "nao_informado";
    temporary_matches: string[];
    /** Preferências do perfil, comparadas só quando o edital informa; nunca eliminam */
    preferences?: Array<{ campo: "objetivos" | "modalidade" | "localizacao" | "formacao"; situacao: "corresponde" | "diverge" | "edital_nao_informa" | "perfil_nao_informa"; motivo: string }>;
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
  interested?: boolean;
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
  orcid: string | null;
  temporary_interests: string[];
  collaboration_role: "coordenar" | "colaborar" | "ambos" | null;
  vinculos?: string[];
  formacao_situacao?: "em_curso" | "concluida" | null;
  formacao_curso?: string | null;
  objetivos?: string[];
  objetivo_atual?: string | null;
  localizacao?: string | null;
  modalidade?: "presencial" | "remoto" | "hibrido" | "qualquer" | null;
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
  extensao: "Extensão",
  hackathon: "Hackathons",
  concurso: "Concursos e seleções",
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
  contrapartidas: "Contrapartidas",
  parcerias: "Parcerias",
  criterios_avaliacao: "Critérios de avaliação",
  canal_inscricao: "Canal de inscrição",
};

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  aberta: "Aberta",
  encerrada: "Encerrada",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
  desconhecida: "Situação não confirmada",
};

export const SOURCE_NAMES: Record<string, string> = { fapdf: "FAPDF" };

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
