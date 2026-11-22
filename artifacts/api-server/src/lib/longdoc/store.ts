/**
 * @file lib/longdoc/store.ts
 * @description Persistência das análises longas (tabelas analysis_jobs e analysis_job_chunks).
 *
 *   - SupabaseJobStore: produção (service role, só no servidor). A reserva da tarefa é atômica
 *     (função SQL analysis_job_claim): dois processadores nunca trabalham na mesma tarefa.
 *   - MemoryJobStore: testes e pilha E2E (LUPA_STORE=memory). Recusado em produção.
 *
 * Nada do andamento fica só na memória da função: cada parte concluída é gravada na hora.
 */
import getSupabaseAdmin from "../supabase";

export type JobStatus = "pendente" | "processando" | "aguardando_cota" | "concluida" | "parcial" | "falhou" | "cancelada";
export type ChunkStatus = "pendente" | "processando" | "concluida" | "falhou";
export const ACTIVE_STATUSES: JobStatus[] = ["pendente", "processando", "aguardando_cota"];

export interface AnalysisJob {
  id: string;
  user_id: string;
  agent_id: string;
  status: JobStatus;
  document_hash: string;
  document_text: string | null;
  chars: number;
  pages: number | null;
  total_chunks: number;
  done_chunks: number;
  failed_chunks: number;
  profile: unknown;
  result: Record<string, unknown> | null;
  error: string | null;
  tokens_used: number;
  ai_calls: number;
  estimated_tokens: number;
  lease_owner: string | null;
  lease_until: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  expires_at: string;
}

export interface JobChunk {
  job_id: string;
  idx: number;
  start_offset: number;
  end_offset: number;
  ctx_start: number;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  content_hash: string;
  status: ChunkStatus;
  attempts: number;
  facts: unknown;
  error: string | null;
  tokens: number | null;
  next_attempt_at: string | null;
  updated_at: string;
}

export interface JobStore {
  readonly kind: "memory" | "supabase";
  createJob(job: AnalysisJob, chunks: JobChunk[]): Promise<void>;
  getJob(id: string): Promise<AnalysisJob | null>;
  listJobs(userId: string, limit?: number): Promise<AnalysisJob[]>;
  countJobsSince(userId: string, sinceIso: string): Promise<number>;
  /** Tarefas ativas cuja próxima tentativa já pode acontecer (agendador / servidor próprio) */
  listRunnable(nowIso: string, limit: number): Promise<AnalysisJob[]>;
  /** Reserva atômica: devolve a tarefa reservada, ou null se outro processador a tem */
  claim(id: string, owner: string, leaseSeconds: number): Promise<AnalysisJob | null>;
  updateJob(id: string, patch: Partial<AnalysisJob>): Promise<void>;
  listChunks(jobId: string): Promise<JobChunk[]>;
  updateChunk(jobId: string, idx: number, patch: Partial<JobChunk>): Promise<void>;
  /** Apaga o texto de tarefas vencidas (retenção). Devolve quantas foram limpas. */
  purgeExpired(nowIso: string): Promise<number>;
}

const now = () => new Date().toISOString();

export class MemoryJobStore implements JobStore {
  readonly kind = "memory" as const;
  private jobs = new Map<string, AnalysisJob>();
  private chunks = new Map<string, JobChunk[]>();
  async createJob(job: AnalysisJob, chunks: JobChunk[]) {
    this.jobs.set(job.id, structuredClone(job));
    this.chunks.set(job.id, structuredClone(chunks));
  }
  async getJob(id: string) {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }
  async listJobs(userId: string, limit = 20) {
    return [...this.jobs.values()].filter((j) => j.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((j) => structuredClone(j));
  }
  async countJobsSince(userId: string, sinceIso: string) {
    return [...this.jobs.values()].filter((j) => j.user_id === userId && j.created_at >= sinceIso).length;
  }
  async listRunnable(nowIso: string, limit: number) {
    return [...this.jobs.values()]
      .filter((j) => ACTIVE_STATUSES.includes(j.status) && (!j.next_attempt_at || j.next_attempt_at <= nowIso) && (!j.lease_until || j.lease_until < nowIso))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit)
      .map((j) => structuredClone(j));
  }
  async claim(id: string, owner: string, leaseSeconds: number) {
    const j = this.jobs.get(id);
    const t = now();
    if (!j || !["pendente", "processando", "aguardando_cota", "parcial"].includes(j.status)) return null;
    if (j.lease_until && j.lease_until >= t && j.lease_owner !== owner) return null;
    j.lease_owner = owner;
    j.lease_until = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    if (j.status === "pendente") j.status = "processando";
    j.updated_at = t;
    return structuredClone(j);
  }
  async updateJob(id: string, patch: Partial<AnalysisJob>) {
    const j = this.jobs.get(id);
    if (j) Object.assign(j, structuredClone(patch), { updated_at: now() });
  }
  async listChunks(jobId: string) {
    return structuredClone(this.chunks.get(jobId) ?? []);
  }
  async updateChunk(jobId: string, idx: number, patch: Partial<JobChunk>) {
    const c = this.chunks.get(jobId)?.find((x) => x.idx === idx);
    if (c) Object.assign(c, structuredClone(patch), { updated_at: now() });
  }
  async purgeExpired(nowIso: string) {
    let n = 0;
    for (const j of this.jobs.values()) {
      if (j.expires_at < nowIso && j.document_text !== null) {
        j.document_text = null;
        if (ACTIVE_STATUSES.includes(j.status)) j.status = "falhou";
        j.error = j.error ?? "Prazo de retenção do documento vencido.";
        n += 1;
      }
    }
    return n;
  }
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export class SupabaseJobStore implements JobStore {
  readonly kind = "supabase" as const;
  private get db() {
    return getSupabaseAdmin();
  }
  async createJob(job: AnalysisJob, chunks: JobChunk[]) {
    check(await this.db.from("analysis_jobs").insert(job));
    // Partes em lotes (1 milhão de caracteres ≈ 70 partes; o lote evita corpo grande demais)
    for (let i = 0; i < chunks.length; i += 200) check(await this.db.from("analysis_job_chunks").insert(chunks.slice(i, i + 200)));
  }
  async getJob(id: string) {
    return (check(await this.db.from("analysis_jobs").select("*").eq("id", id).maybeSingle()) ?? null) as AnalysisJob | null;
  }
  async listJobs(userId: string, limit = 20) {
    // Lista sem o texto e sem o resultado (pesados)
    const cols = "id,user_id,agent_id,status,document_hash,chars,pages,total_chunks,done_chunks,failed_chunks,error,tokens_used,ai_calls,estimated_tokens,next_attempt_at,created_at,updated_at,finished_at,expires_at";
    return (check(await this.db.from("analysis_jobs").select(cols).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)) ?? []) as unknown as AnalysisJob[];
  }
  async countJobsSince(userId: string, sinceIso: string) {
    const r = await this.db.from("analysis_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  }
  async listRunnable(nowIso: string, limit: number) {
    return (check(
      await this.db
        .from("analysis_jobs")
        .select("id,user_id,status,next_attempt_at,lease_until,created_at")
        .in("status", ACTIVE_STATUSES)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
        .order("created_at", { ascending: true })
        .limit(limit),
    ) ?? []) as unknown as AnalysisJob[];
  }
  async claim(id: string, owner: string, leaseSeconds: number) {
    const rows = check(await this.db.rpc("analysis_job_claim", { p_id: id, p_owner: owner, p_lease_seconds: leaseSeconds })) as AnalysisJob[] | null;
    return rows?.[0] ?? null;
  }
  async updateJob(id: string, patch: Partial<AnalysisJob>) {
    check(await this.db.from("analysis_jobs").update({ ...patch, updated_at: now() }).eq("id", id));
  }
  async listChunks(jobId: string) {
    return (check(await this.db.from("analysis_job_chunks").select("*").eq("job_id", jobId).order("idx")) ?? []) as JobChunk[];
  }
  async updateChunk(jobId: string, idx: number, patch: Partial<JobChunk>) {
    check(await this.db.from("analysis_job_chunks").update({ ...patch, updated_at: now() }).eq("job_id", jobId).eq("idx", idx));
  }
  async purgeExpired(nowIso: string) {
    const rows = check(
      await this.db
        .from("analysis_jobs")
        .update({ document_text: null, updated_at: now() })
        .lt("expires_at", nowIso)
        .not("document_text", "is", null)
        .select("id"),
    ) as Array<{ id: string }> | null;
    // Tarefas ativas vencidas não podem continuar sem o texto
    check(await this.db.from("analysis_jobs").update({ status: "falhou", error: "Prazo de retenção do documento vencido." }).lt("expires_at", nowIso).in("status", ACTIVE_STATUSES));
    return rows?.length ?? 0;
  }
}

let instance: JobStore | null = null;
export function getJobStore(): JobStore {
  if (instance) return instance;
  if (process.env.LUPA_STORE === "memory") {
    if (process.env.NODE_ENV === "production") throw new Error("LUPA_STORE=memory não é permitido em produção.");
    instance = new MemoryJobStore();
  } else instance = new SupabaseJobStore();
  return instance;
}
export function setJobStoreForTests(s: JobStore | null) {
  instance = s;
}
