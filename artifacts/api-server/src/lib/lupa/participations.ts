/**
 * @file lib/lupa/participations.ts
 * @description "Quero participar": espaço de trabalho da pessoa para UM edital.
 *
 * Organiza o trabalho (documentos, prazos, proposta, situação) — NÃO é inscrição
 * no site externo. Itens vindos do edital guardam o trecho de origem e ficam
 * separados das sugestões da plataforma e do que a pessoa acrescentou.
 *
 * Ao criar a partir de um edital do catálogo, guardamos um retrato (snapshot)
 * dos campos daquela versão. Quando o edital muda (retificação/nova versão),
 * `compareFields` mostra o que mudou e quais itens da participação são afetados
 * — sem alterar nada sozinho.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Opportunity, OpportunityFields } from "./types";
import { formatDeadline, officialSubmissionDeadline } from "./deadlines";

export const PARTICIPATION_STATUS = ["interesse", "preparando", "pronta_para_enviar", "enviada", "desisti"] as const;
export const PARTICIPATION_KIND = ["edital_pesquisa", "hackathon", "bolsa", "concurso", "evento", "outro"] as const;
export const PROPOSAL_SECTIONS = ["problema", "objetivos", "metodologia", "resultados", "orcamento", "cronograma", "equipe"] as const;

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
  data: string | null; // ISO yyyy-mm-dd quando confirmada
  /** Só quando o edital informa; nunca inventado */
  hora?: string | null;
  fuso?: string | null;
  origem: Origin;
  evidencia: string | null;
}

export type Proposal = Partial<Record<(typeof PROPOSAL_SECTIONS)[number], string>>;

export interface ProposalVersion {
  n: number;
  salvo_em: string;
  nota: string | null;
  proposta: Proposal;
}

export interface Participation {
  id: string;
  user_id: string;
  titulo: string;
  tipo: (typeof PARTICIPATION_KIND)[number];
  situacao: (typeof PARTICIPATION_STATUS)[number];
  opportunity_id: string | null;
  opportunity_version: number | null;
  agent_result_id: number | null;
  /** Retrato dos campos do edital na versão usada (para comparar com retificações). */
  fields_snapshot: OpportunityFields | null;
  exige_projeto: boolean;
  checklist: ChecklistItem[];
  prazos: DeadlineItem[];
  proposta: Proposal;
  versoes: ProposalVersion[];
  notas: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const MAX_PROPOSAL_VERSIONS = 20;
export const MAX_PARTICIPATIONS_PER_USER = 100;

const text = (max: number) => z.string().trim().max(max);

export const CreateParticipationSchema = z
  .object({
    opportunity_id: z.string().trim().min(1).max(120).optional(),
    agent_result_id: z.coerce.number().int().positive().optional(),
    titulo: text(300).min(3).optional(),
    tipo: z.enum(PARTICIPATION_KIND).optional(),
  })
  .strict()
  .refine((v) => v.opportunity_id || v.agent_result_id || v.titulo, { message: "Informe um edital, uma análise salva ou um título." });

const ChecklistInput = z.object({
  id: text(64).optional(),
  item: text(500).min(1),
  origem: z.enum(["edital", "analise", "usuario"]).optional(),
  evidencia: text(1000).nullable().optional(),
  feito: z.boolean(),
});

const DeadlineInput = z.object({
  id: text(64).optional(),
  rotulo: text(200).min(1),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  origem: z.enum(["edital", "analise", "usuario"]).optional(),
  evidencia: text(1000).nullable().optional(),
});

/** Campos que a pessoa pode alterar. id, user_id, origem do edital e versões são do servidor. */
export const UpdateParticipationSchema = z
  .object({
    expected_version: z.number().int().min(0),
    titulo: text(300).min(3).optional(),
    tipo: z.enum(PARTICIPATION_KIND).optional(),
    situacao: z.enum(PARTICIPATION_STATUS).optional(),
    exige_projeto: z.boolean().optional(),
    checklist: z.array(ChecklistInput).max(200).optional(),
    prazos: z.array(DeadlineInput).max(100).optional(),
    proposta: z.object(Object.fromEntries(PROPOSAL_SECTIONS.map((k) => [k, text(20_000).optional()])) as Record<(typeof PROPOSAL_SECTIONS)[number], z.ZodOptional<z.ZodString>>).strict().optional(),
    /** Guarda a proposta atual como nova versão (rascunho nomeado). */
    salvar_versao: z.object({ nota: text(200).nullable().optional() }).optional(),
    notas: text(10_000).nullable().optional(),
  })
  .strict();

export type UpdateParticipationInput = z.infer<typeof UpdateParticipationSchema>;


function guessKind(o: Pick<Opportunity, "title"> & { fields?: OpportunityFields }): Participation["tipo"] {
  const t = `${o.title} ${o.fields?.objeto?.value ?? ""}`.toLowerCase();
  if (/hackathon|maratona/.test(t)) return "hackathon";
  if (/concurso p[uú]blico|processo seletivo simplificado/.test(t)) return "concurso";
  if (/bolsa/.test(t)) return "bolsa";
  if (/evento|congresso|semin[aá]rio/.test(t)) return "evento";
  return "edital_pesquisa";
}

/** Concursos e bolsas normalmente não pedem projeto; editais de pesquisa e hackathons sim. */
export function kindRequiresProject(kind: Participation["tipo"]): boolean {
  return kind === "edital_pesquisa" || kind === "hackathon";
}

function base(userId: string, now: string): Omit<Participation, "titulo" | "tipo" | "exige_projeto"> {
  return {
    id: randomUUID(),
    user_id: userId,
    situacao: "interesse",
    opportunity_id: null,
    opportunity_version: null,
    agent_result_id: null,
    fields_snapshot: null,
    checklist: [],
    prazos: [],
    proposta: {},
    versoes: [],
    notas: null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

/** Participação a partir de um edital do catálogo (campos com evidência da versão atual). */
export function fromOpportunity(userId: string, o: Opportunity, now = new Date().toISOString()): Participation {
  const tipo = guessKind(o);
  return {
    ...base(userId, now),
    titulo: o.title,
    tipo,
    exige_projeto: kindRequiresProject(tipo),
    opportunity_id: o.id,
    opportunity_version: o.version,
    fields_snapshot: structuredClone(o.fields),
    checklist: (o.fields.documentos ?? []).map((d) => ({ id: randomUUID(), item: d.value, origem: "edital" as const, evidencia: d.evidence, feito: false })),
    prazos: (o.fields.datas ?? []).map((d) => ({ id: randomUUID(), rotulo: d.label, data: d.iso, hora: d.hora ?? null, fuso: d.fuso ?? null, origem: "edital" as const, evidencia: d.evidence })),
  };
}

interface AnalysisBaseLike {
  objeto?: { texto?: string } | null;
  documentos?: Array<{ texto?: string; trecho?: string }>;
  datas?: Array<{ rotulo?: string; iso?: string | null; trecho?: string }>;
}

/** Participação a partir de uma análise salva do próprio usuário (base documental do /testar). */
export function fromAnalysis(userId: string, analysisId: number, title: string, b: AnalysisBaseLike | null, now = new Date().toISOString()): Participation {
  const tipo = guessKind({ title, fields: b?.objeto?.texto ? { objeto: { value: b.objeto.texto, evidence: "", source_url: "" } } : undefined });
  return {
    ...base(userId, now),
    titulo: title.slice(0, 300) || "Participação",
    tipo,
    exige_projeto: kindRequiresProject(tipo),
    agent_result_id: analysisId,
    checklist: (b?.documentos ?? [])
      .filter((d) => d.texto)
      .map((d) => ({ id: randomUUID(), item: String(d.texto), origem: "analise" as const, evidencia: d.trecho ?? null, feito: false })),
    prazos: (b?.datas ?? [])
      .filter((d) => d.rotulo)
      .map((d) => ({ id: randomUUID(), rotulo: String(d.rotulo), data: d.iso ?? null, origem: "analise" as const, evidencia: d.trecho ?? null })),
  };
}

export function blankParticipation(userId: string, titulo: string, tipo: Participation["tipo"] = "outro", now = new Date().toISOString()): Participation {
  return { ...base(userId, now), titulo, tipo, exige_projeto: kindRequiresProject(tipo) };
}

/**
 * Aplica a alteração. Itens vindos do edital/análise mantêm a origem e o trecho:
 * a pessoa pode marcar como feito, mas não "transformar" um item seu em exigência do edital.
 */
export function applyUpdate(current: Participation, input: UpdateParticipationInput, now = new Date().toISOString()): Participation {
  const next: Participation = structuredClone(current);
  if (input.titulo !== undefined) next.titulo = input.titulo;
  if (input.tipo !== undefined) next.tipo = input.tipo;
  if (input.situacao !== undefined) next.situacao = input.situacao;
  if (input.exige_projeto !== undefined) next.exige_projeto = input.exige_projeto;
  if (input.notas !== undefined) next.notas = input.notas;
  if (input.checklist) {
    const known = new Map(current.checklist.map((c) => [c.id, c]));
    next.checklist = input.checklist.map((c) => {
      const prev = c.id ? known.get(c.id) : undefined;
      return prev && prev.origem !== "usuario"
        ? { ...prev, feito: c.feito }
        : { id: prev?.id ?? randomUUID(), item: c.item, origem: "usuario" as const, evidencia: null, feito: c.feito };
    });
  }
  if (input.prazos) {
    const known = new Map(current.prazos.map((d) => [d.id, d]));
    next.prazos = input.prazos.map((d) => {
      const prev = d.id ? known.get(d.id) : undefined;
      return prev && prev.origem !== "usuario" ? prev : { id: prev?.id ?? randomUUID(), rotulo: d.rotulo, data: d.data, origem: "usuario" as const, evidencia: null };
    });
  }
  if (input.proposta) {
    next.proposta = Object.fromEntries(Object.entries({ ...current.proposta, ...input.proposta }).filter(([, v]) => typeof v === "string" && v.length > 0));
  }
  if (input.salvar_versao) {
    const n = (current.versoes.at(-1)?.n ?? 0) + 1;
    next.versoes = [...current.versoes, { n, salvo_em: now, nota: input.salvar_versao.nota ?? null, proposta: structuredClone(next.proposta) }].slice(-MAX_PROPOSAL_VERSIONS);
  }
  next.version = current.version + 1;
  next.updated_at = now;
  return next;
}

// ── Conferência determinística (sem IA) ─────────────────────────────────────

export interface CheckResult {
  id: string;
  nivel: "ok" | "atencao" | "impeditivo" | "desconhecido";
  mensagem: string;
  evidencia?: string | null;
}

/** Prazo OFICIAL de inscrição (regra única de deadlines.ts). Tarefas pessoais não contam. */
export function submissionDate(p: Participation, today?: string): string | null {
  return officialSubmissionDeadline(p.prazos, today)?.iso ?? null;
}

/**
 * Confere só o que dá para verificar com certeza: documentos marcados, prazo,
 * seções da proposta preenchidas (quando o edital pede projeto) e mudança de versão do edital.
 * Não avalia qualidade — isso é outra etapa, com critérios explícitos.
 */
export function deterministicCheck(p: Participation, currentOpportunityVersion: number | null, today = new Date().toISOString().slice(0, 10)): CheckResult[] {
  const out: CheckResult[] = [];
  const pend = p.checklist.filter((c) => !c.feito);
  if (p.checklist.length === 0) out.push({ id: "documentos", nivel: "desconhecido", mensagem: "Nenhum documento exigido foi identificado. Confira a lista no edital oficial." });
  else if (pend.length) out.push({ id: "documentos", nivel: "atencao", mensagem: `${pend.length} de ${p.checklist.length} documento(s) ainda não marcado(s) como prontos.` });
  else out.push({ id: "documentos", nivel: "ok", mensagem: "Todos os documentos da lista estão marcados como prontos." });

  const official = officialSubmissionDeadline(p.prazos, today);
  if (!official) out.push({ id: "prazo", nivel: "desconhecido", mensagem: "Prazo oficial de inscrição não confirmado no texto. Confira no edital oficial." });
  else {
    const days = Math.round((Date.parse(official.iso) - Date.parse(today)) / 86_400_000);
    const quando = formatDeadline(official);
    const extra = `${official.prorrogado ? " Prazo prorrogado pelo edital." : ""}${official.fases.length > 1 && !official.prorrogado ? ` O edital tem ${official.fases.length} datas de inscrição (fases); esta é a próxima.` : ""}`;
    if (days < 0) out.push({ id: "prazo", nivel: "impeditivo", mensagem: `O prazo oficial de inscrição (${quando}) já passou.${extra}`, evidencia: official.evidencia });
    else if (days <= 7) out.push({ id: "prazo", nivel: "atencao", mensagem: `Faltam ${days} dia(s) para o prazo oficial de inscrição (${quando}).${extra}`, evidencia: official.evidencia });
    else out.push({ id: "prazo", nivel: "ok", mensagem: `Prazo oficial de inscrição: ${quando} (faltam ${days} dias).${extra}`, evidencia: official.evidencia });
    // Tarefas pessoais nunca mudam o prazo oficial; avisamos se estão depois dele
    const late = p.prazos.filter((d) => d.origem === "usuario" && d.data && d.data > official.iso);
    if (late.length) {
      out.push({ id: "tarefas", nivel: "atencao", mensagem: `${late.length} tarefa(s) sua(s) com data depois do prazo oficial (${late.map((d) => d.rotulo).join(", ")}). Elas não mudam o prazo do edital.` });
    }
  }

  if (p.exige_projeto) {
    const empty = PROPOSAL_SECTIONS.filter((s) => !(p.proposta[s] ?? "").trim());
    if (empty.length) out.push({ id: "proposta", nivel: "atencao", mensagem: `Seções da proposta sem conteúdo: ${empty.join(", ")}.` });
    else out.push({ id: "proposta", nivel: "ok", mensagem: "Todas as seções da proposta têm conteúdo (a qualidade não é avaliada aqui)." });
  }

  if (p.opportunity_id && currentOpportunityVersion != null && p.opportunity_version != null && currentOpportunityVersion > p.opportunity_version) {
    out.push({
      id: "versao",
      nivel: "atencao",
      mensagem: `O edital mudou desde que você começou (versão ${p.opportunity_version} → ${currentOpportunityVersion}). Veja o que mudou antes de continuar.`,
    });
  }
  return out;
}

// ── Retificação: o que mudou e o que é afetado ──────────────────────────────

export interface FieldChange {
  campo: string;
  rotulo: string;
  antes: string[];
  depois: string[];
  /** Partes da participação que podem precisar de revisão. */
  afeta: string[];
}

const FIELD_LABELS: Record<string, { rotulo: string; afeta: string[] }> = {
  datas: { rotulo: "Datas e prazos", afeta: ["prazos"] },
  documentos: { rotulo: "Documentos exigidos", afeta: ["checklist"] },
  requisitos: { rotulo: "Requisitos", afeta: ["elegibilidade", "proposta"] },
  elegibilidade: { rotulo: "Quem pode participar", afeta: ["elegibilidade"] },
  valores: { rotulo: "Valores", afeta: ["proposta (orçamento)"] },
  restricoes: { rotulo: "Vedações", afeta: ["elegibilidade"] },
  criterios_avaliacao: { rotulo: "Critérios de avaliação", afeta: ["proposta"] },
  canal_inscricao: { rotulo: "Canal de inscrição", afeta: ["envio"] },
  objeto: { rotulo: "Objeto", afeta: ["proposta"] },
};

function render(v: unknown): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .map((x) => {
      const e = x as { value?: unknown; evidence?: string; label?: string; iso?: string | null };
      const val = Array.isArray(e.value) ? e.value.join(", ") : String(e.value ?? "");
      return e.label ? `${e.label}: ${e.iso ?? val}` : e.evidence || val;
    })
    .filter(Boolean)
    .sort();
}

/** Compara o retrato guardado com a versão atual do edital. */
export function compareFields(before: OpportunityFields | null, after: OpportunityFields): FieldChange[] {
  if (!before) return [];
  const out: FieldChange[] = [];
  for (const [campo, meta] of Object.entries(FIELD_LABELS)) {
    const a = render((before as Record<string, unknown>)[campo]);
    const b = render((after as Record<string, unknown>)[campo]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ campo, rotulo: meta.rotulo, antes: a, depois: b, afeta: meta.afeta });
  }
  return out;
}
