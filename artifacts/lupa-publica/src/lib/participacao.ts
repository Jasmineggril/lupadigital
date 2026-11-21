/**
 * @file lib/participacao.ts
 * @description Tipos e rótulos do espaço "Quero participar" (espelham a API /participations).
 */

export type Origin = "edital" | "analise" | "usuario";

export interface ChecklistItem {
  id: string;
  item: string;
  origem: Origin;
  evidencia: string | null;
  feito: boolean;
}

export interface DeadlineItem {
  id: string;
  rotulo: string;
  data: string | null;
  /** Só quando o edital informa */
  hora?: string | null;
  fuso?: string | null;
  origem: Origin;
  evidencia: string | null;
}

export const PROPOSAL_SECTIONS = [
  { id: "problema", rotulo: "Problema", ajuda: "Qual situação o projeto pretende resolver ou compreender? Para quem?" },
  { id: "objetivos", rotulo: "Objetivos", ajuda: "Objetivo geral e objetivos específicos, verificáveis." },
  { id: "metodologia", rotulo: "Metodologia", ajuda: "Como você vai alcançar os objetivos: etapas, métodos, dados." },
  { id: "resultados", rotulo: "Resultados esperados", ajuda: "O que será entregue e como medir." },
  { id: "orcamento", rotulo: "Orçamento", ajuda: "Itens e valores. Estimativas devem ser marcadas como estimativas." },
  { id: "cronograma", rotulo: "Cronograma", ajuda: "Etapas e meses, dentro do prazo de execução do edital." },
  { id: "equipe", rotulo: "Equipe", ajuda: "Pessoas reais que aceitaram participar e o papel de cada uma." },
] as const;

export type SectionId = (typeof PROPOSAL_SECTIONS)[number]["id"];
export type Proposal = Partial<Record<SectionId, string>>;

export interface Participation {
  id: string;
  titulo: string;
  tipo: "edital_pesquisa" | "hackathon" | "bolsa" | "concurso" | "evento" | "outro";
  situacao: "interesse" | "preparando" | "pronta_para_enviar" | "enviada" | "desisti";
  opportunity_id: string | null;
  opportunity_version: number | null;
  agent_result_id: number | null;
  exige_projeto: boolean;
  checklist: ChecklistItem[];
  prazos: DeadlineItem[];
  proposta: Proposal;
  versoes: Array<{ n: number; salvo_em: string; nota: string | null; proposta: Proposal }>;
  notas: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  versoes_total?: number;
}

export interface CheckResult {
  id: string;
  nivel: "ok" | "atencao" | "impeditivo" | "desconhecido";
  mensagem: string;
}

export interface FieldChange {
  campo: string;
  rotulo: string;
  antes: string[];
  depois: string[];
  afeta: string[];
}

export interface ParticipationDetail {
  participation: Participation;
  edital: { id: string; title: string; version: number; status: string; canonical_url: string; captured_at: string } | null;
  conferencia: CheckResult[];
  mudancas: FieldChange[];
}

export const STATUS_LABEL: Record<Participation["situacao"], string> = {
  interesse: "Tenho interesse",
  preparando: "Preparando",
  pronta_para_enviar: "Pronta para enviar",
  enviada: "Enviada (no canal oficial)",
  desisti: "Desisti",
};

export const KIND_LABEL: Record<Participation["tipo"], string> = {
  edital_pesquisa: "Edital de pesquisa",
  hackathon: "Hackathon",
  bolsa: "Bolsa",
  concurso: "Concurso / seleção",
  evento: "Evento",
  outro: "Outro",
};

export const ORIGIN_LABEL: Record<Origin, string> = {
  edital: "do edital",
  analise: "da análise",
  usuario: "seu",
};

export const LEVEL_LABEL: Record<CheckResult["nivel"], string> = {
  ok: "OK",
  atencao: "Atenção",
  impeditivo: "Impede",
  desconhecido: "Não confirmado",
};
