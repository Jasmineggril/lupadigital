/**
 * Contrato ÚNICO do plano de projeto (Projetos / NIASci) entre tela, API e banco.
 *
 * Antes: a tela mandava `team`/`timeline` como LISTAS e a API só aceitava OBJETOS
 * (400 "Expected object, received array"); objetivos, etapas, indicadores, riscos,
 * pendências e próximas ações não eram gravados; reabrir procurava `metadata.result`,
 * que nunca existia. Agora o plano inteiro vai em `plan` (jsonb), validado aqui.
 */
import { z } from "zod";

export const PROJECT_CONTRACT_VERSION = 1;

const str = (max = 4000) => z.string().trim().max(max);

export const ProjectPlanSchema = z.object({
  titulo: str(300).optional(),
  resumo: str(8000).optional(),
  objetivos: z.array(str(1000)).max(50).optional(),
  equipe: z.array(z.object({ papel: str(200), responsabilidades: str(2000) })).max(50).optional(),
  cronograma: z.array(z.object({ fase: str(200), duracao: str(100), descricao: str(2000) })).max(60).optional(),
  etapas: z.array(z.object({ nome: str(200), descricao: str(2000), entregavel: str(1000) })).max(60).optional(),
  indicadores: z.array(z.object({ nome: str(200), meta: str(500), metodologia: str(1000) })).max(50).optional(),
  riscos: z.array(z.object({ risco: str(500), probabilidade: str(50), mitigacao: str(1000) })).max(50).optional(),
  pendencias: z.array(str(1000)).max(50).optional(),
  proximasAcoes: z.array(str(1000)).max(50).optional(),
  alertas: z.array(str(1000)).max(50).optional(),
});
export type ProjectPlan = z.infer<typeof ProjectPlanSchema>;

/** Contexto que gerou o plano (quando veio de uma participação). Só ids — nada pessoal. */
export const ProjectOriginSchema = z.object({
  participation_id: z.string().uuid().nullable().optional(),
  opportunity_id: z.string().uuid().nullable().optional(),
  opportunity_version: z.number().int().nullable().optional(),
  agent_result_id: z.number().int().nullable().optional(),
});

/** Projeto cadastrado à mão no gerenciador (etapas com prazo e situação). */
export const ManualProjectSchema = z.object({
  id: z.string().max(80).optional(),
  title: str(300),
  objective: str(4000).default(""),
  description: str(8000).default(""),
  status: z.enum(["planejamento", "em andamento", "concluído", "pausado"]),
  startDate: str(20).default(""),
  endDate: str(20).default(""),
  stages: z
    .array(z.object({ id: str(80), name: str(300), description: str(2000).default(""), deadline: str(20).default(""), status: z.enum(["pendente", "em andamento", "concluída"]) }))
    .max(100)
    .default([]),
  createdAt: str(40).optional(),
});
export type ManualProject = z.infer<typeof ManualProjectSchema>;

/** Corpo aceito em POST/PUT /resources/research_projects. */
export const ResearchProjectWriteSchema = z.object({
  title: str(300).optional(),
  description: str(8000).nullable().optional(),
  // Registros antigos gravavam objetos; a tela atual manda listas. Os dois são aceitos.
  team: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).nullable().optional(),
  timeline: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).nullable().optional(),
  plan: ProjectPlanSchema.nullable().optional(),
  /** Projeto manual (source = "manual"); antes ficava só no localStorage, sem dono */
  manual: ManualProjectSchema.nullable().optional(),
  source: z.enum(["ia", "manual"]).optional(),
  origin: ProjectOriginSchema.nullable().optional(),
  contract_version: z.number().int().optional(),
});
export type ResearchProjectWrite = z.infer<typeof ResearchProjectWriteSchema>;

export interface ResearchProjectRecord extends ResearchProjectWrite {
  id: string;
  user_id: string;
  created_at: string;
  updated_at?: string | null;
}

/**
 * Plano a exibir ao reabrir um registro. Registros novos: `plan` completo.
 * Registros antigos (só título/resumo/equipe/cronograma): reconstrói o que existe e
 * marca `parcial` — a tela diz que o resto não foi salvo na época.
 */
export function planFromRecord(r: Partial<ResearchProjectRecord>): { plan: ProjectPlan; parcial: boolean } {
  if (r.plan && typeof r.plan === "object") {
    const parsed = ProjectPlanSchema.safeParse(r.plan);
    if (parsed.success) return { plan: parsed.data, parcial: false };
  }
  const asList = <T>(v: unknown, guard: (x: unknown) => x is T): T[] => (Array.isArray(v) ? v.filter(guard) : []);
  const isTeam = (x: unknown): x is { papel: string; responsabilidades: string } => !!x && typeof x === "object" && "papel" in (x as object);
  const isPhase = (x: unknown): x is { fase: string; duracao: string; descricao: string } => !!x && typeof x === "object" && "fase" in (x as object);
  return {
    plan: {
      titulo: r.title ?? undefined,
      resumo: r.description ?? undefined,
      equipe: asList(r.team, isTeam),
      cronograma: asList(r.timeline, isPhase),
    },
    parcial: true,
  };
}

/** Corpo de gravação a partir do plano gerado (a MESMA estrutura exibida e exportada). */
export function recordFromPlan(plan: ProjectPlan, origin?: z.infer<typeof ProjectOriginSchema> | null): ResearchProjectWrite {
  return {
    title: plan.titulo?.slice(0, 300) || "Projeto sem título",
    description: plan.resumo ?? "",
    team: plan.equipe ?? [],
    timeline: plan.cronograma ?? [],
    plan,
    source: "ia",
    origin: origin ?? null,
    contract_version: PROJECT_CONTRACT_VERSION,
  };
}

export type ProjectOrigin = z.infer<typeof ProjectOriginSchema>;
