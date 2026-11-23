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

/** Tarefa da equipe (meta PESSOAL: o prazo aqui nunca substitui o prazo oficial do edital). */
export interface TaskItem {
  id: string;
  titulo: string;
  responsavel: string | null;
  prazo: string | null; // yyyy-mm-dd, meta pessoal
  feito: boolean;
}

export const RESULT_STATUS = ["aguardando", "aprovada", "nao_aprovada", "lista_espera"] as const;

/** Registro de envio e resultado — SEMPRE informado pela pessoa (o LUPA não confirma sozinho). */
export interface SubmissionRecord {
  enviada_em: string | null; // yyyy-mm-dd informado pela pessoa
  protocolo: string | null;
  resultado: (typeof RESULT_STATUS)[number] | null;
  resultado_em: string | null;
  observacao: string | null;
  informado_em: string; // quando a pessoa registrou (servidor)
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
  /** Projeto (Projetos/NIASci) vinculado a esta participação — um só, sem duplicar */
  project_id?: string | null;
  /** Retrato dos campos do edital na versão usada (para comparar com retificações). */
  fields_snapshot: OpportunityFields | null;
  exige_projeto: boolean;
  checklist: ChecklistItem[];
  prazos: DeadlineItem[];
  proposta: Proposal;
  versoes: ProposalVersion[];
  /** Tarefas e responsáveis (registros antigos podem não ter o campo) */
  tarefas?: TaskItem[];
  /** Envio e resultado informados pela pessoa */
  submissao?: SubmissionRecord | null;
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

const TaskInput = z.object({
  id: text(64).optional(),
  titulo: text(300).min(1),
  responsavel: text(120).nullable().optional(),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  feito: z.boolean(),
});

const SubmissionInput = z
  .object({
    enviada_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    protocolo: text(200).nullable().optional(),
    resultado: z.enum(RESULT_STATUS).nullable().optional(),
    resultado_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    observacao: text(2000).nullable().optional(),
  })
  .strict();

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
    tarefas: z.array(TaskInput).max(200).optional(),
    /** null apaga o registro de envio */
    submissao: SubmissionInput.nullable().optional(),
  })
  .strict();

/** Envio/resultado só valem com informação da pessoa: "enviada" exige a data do envio. */
export class ParticipationRuleError extends Error {}

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
    project_id: null,
    fields_snapshot: null,
    checklist: [],
    prazos: [],
    proposta: {},
    versoes: [],
    tarefas: [],
    submissao: null,
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
  if (input.tarefas) {
    next.tarefas = input.tarefas.map((t) => ({
      id: t.id ?? randomUUID(),
      titulo: t.titulo,
      responsavel: t.responsavel?.trim() || null,
      prazo: t.prazo ?? null,
      feito: t.feito,
    }));
  }
  if (input.submissao !== undefined) {
    if (input.submissao === null) next.submissao = null;
    else {
      const prev = current.submissao ?? null;
      const merged = {
        enviada_em: input.submissao.enviada_em !== undefined ? input.submissao.enviada_em : (prev?.enviada_em ?? null),
        protocolo: input.submissao.protocolo !== undefined ? input.submissao.protocolo?.trim() || null : (prev?.protocolo ?? null),
        resultado: input.submissao.resultado !== undefined ? input.submissao.resultado : (prev?.resultado ?? null),
        resultado_em: input.submissao.resultado_em !== undefined ? input.submissao.resultado_em : (prev?.resultado_em ?? null),
        observacao: input.submissao.observacao !== undefined ? input.submissao.observacao?.trim() || null : (prev?.observacao ?? null),
        informado_em: now,
      };
      if (merged.resultado && merged.resultado !== "aguardando" && !merged.enviada_em) {
        throw new ParticipationRuleError("Para registrar o resultado, informe primeiro a data em que a proposta foi enviada.");
      }
      next.submissao = merged;
      // Registrou a data de envio agora: a situação passa a "enviada" (informado pela pessoa)
      if (merged.enviada_em && input.situacao === undefined && next.situacao !== "desisti") next.situacao = "enviada";
    }
  }
  // "Enviada" só com a data de envio informada pela pessoa (o LUPA não confirma envio sozinho)
  if (next.situacao === "enviada" && current.situacao !== "enviada" && !next.submissao?.enviada_em) {
    throw new ParticipationRuleError("Para marcar como enviada, informe a data em que você enviou a proposta (e o protocolo, se tiver).");
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


// ── Contexto para preparar o projeto (Projetos) ─────────────────────────────

export interface ProjectContext {
  participacao: { id: string; titulo: string; tipo: string; project_id: string | null };
  edital: { id: string | null; titulo: string; versao: number | null } | null;
  /** O que o EDITAL exige/informa — texto oficial, com o trecho. Nunca é sugestão do LUPA. */
  exigencias: Array<{ tipo: string; texto: string }>;
  /** Seções da proposta que a pessoa já escreveu */
  proposta: Array<{ secao: string; texto: string }>;
  /** Dados confirmados no perfil (autodeclarados) que serão usados */
  perfil: Array<{ campo: string; valor: string }>;
  /** O que falta e será perguntado */
  faltando: string[];
}

const PROFILE_FIELDS: Array<[keyof TeacherProfileLike, string]> = [
  ["areas", "Áreas"],
  ["research_topics", "Temas de pesquisa"],
  ["competencies", "Competências"],
  ["institution", "Instituição"],
  ["declared_degree", "Titulação (autodeclarada)"],
  ["collaboration_role", "Papel desejado"],
];
interface TeacherProfileLike {
  areas?: string[];
  research_topics?: string[];
  competencies?: string[];
  institution?: string | null;
  declared_degree?: string | null;
  collaboration_role?: string | null;
}

export function projectContext(p: Participation, o: Opportunity | null, profile: TeacherProfileLike | null): ProjectContext {
  const fields = (o?.fields ?? p.fields_snapshot ?? {}) as OpportunityFields;
  const exig: ProjectContext["exigencias"] = [];
  const push = (tipo: string, list?: Array<{ evidence: string }>) => list?.forEach((x) => exig.push({ tipo, texto: x.evidence }));
  if (fields.objeto) exig.push({ tipo: "Objeto", texto: fields.objeto.evidence });
  push("Quem pode participar", fields.elegibilidade);
  push("Requisito", fields.requisitos);
  push("Critério de avaliação", fields.criterios_avaliacao);
  push("Valor", fields.valores);
  push("Documento exigido", fields.documentos);
  push("Vedação", fields.restricoes);
  for (const d of p.prazos.filter((x) => x.origem !== "usuario" && x.data)) exig.push({ tipo: `Prazo (${d.rotulo})`, texto: d.evidencia ?? d.data! });
  const proposta = Object.entries(p.proposta)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([secao, texto]) => ({ secao, texto: String(texto) }));
  const perfil: ProjectContext["perfil"] = [];
  for (const [k, label] of PROFILE_FIELDS) {
    const v = profile?.[k];
    const txt = Array.isArray(v) ? v.join(", ") : v ?? "";
    if (txt) perfil.push({ campo: label, valor: String(txt) });
  }
  const faltando: string[] = [];
  if (!p.proposta.problema?.trim()) faltando.push("Qual problema o projeto quer resolver (com suas palavras)");
  if (!perfil.some((x) => x.campo === "Áreas" || x.campo === "Temas de pesquisa")) faltando.push("Sua área ou tema de pesquisa");
  if (exig.length === 0) faltando.push("O edital não trouxe exigências legíveis: confira o documento oficial");
  return {
    participacao: { id: p.id, titulo: p.titulo, tipo: p.tipo, project_id: p.project_id ?? null },
    edital: o ? { id: o.id, titulo: o.title, versao: o.version } : p.opportunity_id ? { id: p.opportunity_id, titulo: p.titulo, versao: p.opportunity_version } : null,
    exigencias: exig.slice(0, 40),
    proposta,
    perfil,
    faltando,
  };
}

/** Texto do contexto para o gerador de projeto — exigências separadas do que é sugestão. */
export function projectContextPrompt(c: ProjectContext): string {
  const lines: string[] = [];
  if (c.edital) lines.push(`EDITAL: ${c.edital.titulo}${c.edital.versao ? ` (versão ${c.edital.versao})` : ""}`);
  if (c.exigencias.length) {
    lines.push("EXIGÊNCIAS E INFORMAÇÕES DO EDITAL (texto oficial — respeite; não altere nem invente outras):");
    for (const e of c.exigencias) lines.push(`- [${e.tipo}] ${e.texto.slice(0, 500)}`);
  }
  if (c.perfil.length) {
    lines.push("PERFIL CONFIRMADO PELA PESSOA (autodeclarado):");
    for (const x of c.perfil) lines.push(`- ${x.campo}: ${x.valor}`);
  }
  if (c.proposta.length) {
    lines.push("O QUE A PESSOA JÁ ESCREVEU NA PROPOSTA (preserve as decisões dela):");
    for (const x of c.proposta) lines.push(`- ${x.secao}: ${x.texto.slice(0, 1500)}`);
  }
  lines.push(
    "REGRAS: não invente integrantes, experiências, resultados, referências ou valores. Na equipe, descreva PAPÉIS necessários, não pessoas. Estimativas devem ser marcadas como estimativas. Em 'alertas', diga o que é exigência do edital e o que é sugestão sua, e o que falta confirmar.",
  );
  return lines.join("\n");
}

/**
 * Contexto de uma participação para o Assistente: o que a pessoa organizou e o que falta.
 * Prazos OFICIAIS (edital/análise) separados das metas pessoais; nada é inventado.
 */
export function participationAssistantContext(p: Participation, today = new Date().toISOString().slice(0, 10)): string {
  const L: string[] = [];
  L.push(`PARTICIPAÇÃO SELECIONADA PELA PESSOA: "${p.titulo}" (tipo: ${p.tipo}; situação: ${p.situacao}).`);
  const oficial = officialSubmissionDeadline(p.prazos, today);
  if (oficial) L.push(`PRAZO OFICIAL DE INSCRIÇÃO: ${formatDeadline(oficial)}${oficial.evidencia ? ` — trecho: "${oficial.evidencia.slice(0, 200)}"` : ""}`);
  else L.push("PRAZO OFICIAL DE INSCRIÇÃO: não identificado no edital (diga que precisa ser conferido).");
  const prazosOficiais = p.prazos.filter((d) => d.origem !== "usuario");
  if (prazosOficiais.length) L.push(`OUTRAS DATAS DO EDITAL: ${prazosOficiais.slice(0, 15).map((d) => `${d.rotulo}: ${d.data ?? "sem data"}`).join("; ")}`);
  const metas = [...p.prazos.filter((d) => d.origem === "usuario").map((d) => `${d.rotulo} (${d.data ?? "sem data"})`), ...(p.tarefas ?? []).filter((t) => t.prazo).map((t) => `${t.titulo} (${t.prazo})`)];
  if (metas.length) L.push(`METAS PESSOAIS (não são prazos do edital): ${metas.slice(0, 15).join("; ")}`);
  const faltam = p.checklist.filter((c) => !c.feito);
  const prontos = p.checklist.filter((c) => c.feito);
  L.push(`DOCUMENTOS: ${prontos.length} prontos, ${faltam.length} faltando.`);
  if (faltam.length) L.push(`DOCUMENTOS QUE FALTAM: ${faltam.slice(0, 25).map((c) => `${c.item}${c.origem === "usuario" ? " (acrescentado pela pessoa)" : ""}`).join("; ")}`);
  const tarefas = (p.tarefas ?? []).filter((t) => !t.feito);
  if (tarefas.length) L.push(`TAREFAS EM ABERTO: ${tarefas.slice(0, 20).map((t) => `${t.titulo}${t.responsavel ? ` — ${t.responsavel}` : ""}`).join("; ")}`);
  const secoes = Object.entries(p.proposta).filter(([, v]) => v && v.trim()).map(([k]) => k);
  if (p.exige_projeto) L.push(`PROPOSTA: seções já escritas: ${secoes.length ? secoes.join(", ") : "nenhuma"}.`);
  if (p.submissao?.enviada_em) L.push(`ENVIO INFORMADO PELA PESSOA: ${p.submissao.enviada_em}${p.submissao.resultado ? `; resultado informado: ${p.submissao.resultado}` : ""}.`);
  L.push(`ONDE CONTINUAR: /participar/${p.id} (documentos, prazos, tarefas, proposta e envio)${p.exige_projeto ? `; projeto: /niasci/projetos?participacao=${p.id}` : ""}.`);
  L.push("REGRAS: use só estes dados; não confirme envio ou aprovação que a pessoa não informou; se algo não está aqui, diga que não sabe e onde conferir.");
  return L.join("\n");
}
