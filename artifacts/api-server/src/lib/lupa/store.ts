/**
 * @file lib/lupa/store.ts
 * @description Repositório do fluxo docente (perfis, catálogo, execuções, recomendações).
 *
 * Duas implementações:
 *   - SupabaseStore: produção, via service role (somente no servidor).
 *   - MemoryStore:   MODO TEMPORÁRIO DE DESENVOLVIMENTO / TESTES. Os dados somem
 *                    ao reiniciar o processo. Nunca é usado em produção:
 *                    getStore() recusa LUPA_STORE=memory com NODE_ENV=production.
 */

import { randomUUID } from "node:crypto";
import getSupabaseAdmin from "../supabase";
import type {
  CollectionRun,
  Opportunity,
  OpportunityDocument,
  OpportunityEvent,
  OpportunitySource,
  Recommendation,
  TeacherProfile,
} from "./types";

export type OpportunityUpsert = Omit<
  Opportunity,
  "id" | "version" | "review_status" | "reviewed_by" | "reviewed_at" | "first_seen_at" | "last_seen_at" | "captured_at"
>;

export interface UpsertOutcome {
  opportunity: Opportunity;
  created: boolean;
  changed: boolean;
}

export class ConcurrentRunError extends Error {
  constructor(sourceId: string) {
    super(`Já existe uma coleta em andamento para a fonte ${sourceId}.`);
  }
}

export interface LupaStore {
  readonly kind: "supabase" | "memory";
  getProfile(userId: string): Promise<TeacherProfile | null>;
  saveProfile(profile: TeacherProfile): Promise<TeacherProfile>;
  listProfiles(): Promise<TeacherProfile[]>;

  listSources(): Promise<OpportunitySource[]>;
  getSource(id: string): Promise<OpportunitySource | null>;
  updateSource(id: string, patch: Partial<OpportunitySource>): Promise<OpportunitySource | null>;

  listOpportunities(opts?: { includeRejected?: boolean }): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  upsertOpportunity(data: OpportunityUpsert): Promise<UpsertOutcome>;
  reviewOpportunity(id: string, status: Opportunity["review_status"], reviewer: string): Promise<Opportunity | null>;

  startRun(sourceId: string, trigger: CollectionRun["trigger"], triggeredBy: string | null): Promise<CollectionRun>;
  finishRun(id: string, patch: Pick<CollectionRun, "status" | "stats" | "errors">): Promise<CollectionRun>;
  listRuns(limit?: number): Promise<CollectionRun[]>;

  getRecommendations(userId: string): Promise<Recommendation[]>;
  saveRecommendation(rec: Recommendation): Promise<void>;
  saveFeedback(userId: string, opportunityId: string, relevant: boolean, comment: string | null): Promise<void>;
  getFeedback(userId: string): Promise<Array<{ opportunity_id: string; relevant: boolean; comment: string | null }>>;

  listSaved(userId: string): Promise<string[]>;
  setSaved(userId: string, opportunityId: string, saved: boolean): Promise<void>;
}

/** Fonte FAPDF padrão (a URL inicial precisa ser confirmada no site real; ver docs). */
export function defaultSources(now = new Date().toISOString()): OpportunitySource[] {
  return [
    {
      id: "fapdf",
      name: "FAPDF — Fundação de Apoio à Pesquisa do Distrito Federal",
      base_url: "https://www.fap.df.gov.br",
      start_urls: ["https://www.fap.df.gov.br/editais/"],
      allowed_hosts: ["www.fap.df.gov.br", "fap.df.gov.br"],
      max_depth: 2,
      max_pages: 60,
      time_budget_ms: 120_000,
      request_delay_ms: 1_500,
      frequency_minutes: 1_440,
      enabled: true,
      updated_at: now,
    },
  ];
}

function sameContent(a: OpportunityUpsert, b: Opportunity): boolean {
  return (
    a.content_hash === b.content_hash &&
    JSON.stringify(a.documents) === JSON.stringify(b.documents) &&
    JSON.stringify(a.events) === JSON.stringify(b.events) &&
    a.status === b.status
  );
}

// ── Memória (desenvolvimento/testes) ────────────────────────────────────────

export class MemoryStore implements LupaStore {
  readonly kind = "memory" as const;
  profiles = new Map<string, TeacherProfile>();
  sources = new Map<string, OpportunitySource>(defaultSources().map((s) => [s.id, s]));
  opportunities = new Map<string, Opportunity>();
  versions: Array<{ opportunity_id: string; version: number; content_hash: string }> = [];
  runs: CollectionRun[] = [];
  recs = new Map<string, Recommendation>();
  feedback = new Map<string, { opportunity_id: string; relevant: boolean; comment: string | null }>();
  saved = new Map<string, Set<string>>();

  async getProfile(userId: string) {
    const p = this.profiles.get(userId);
    return p ? structuredClone(p) : null;
  }
  async saveProfile(profile: TeacherProfile) {
    this.profiles.set(profile.user_id, structuredClone(profile));
    return structuredClone(profile);
  }
  async listProfiles() {
    return [...this.profiles.values()].map((p) => structuredClone(p));
  }

  async listSources() {
    return [...this.sources.values()].map((s) => structuredClone(s));
  }
  async getSource(id: string) {
    const s = this.sources.get(id);
    return s ? structuredClone(s) : null;
  }
  async updateSource(id: string, patch: Partial<OpportunitySource>) {
    const s = this.sources.get(id);
    if (!s) return null;
    const next = { ...s, ...patch, id: s.id, updated_at: new Date().toISOString() };
    this.sources.set(id, next);
    return structuredClone(next);
  }

  async listOpportunities(opts?: { includeRejected?: boolean }) {
    return [...this.opportunities.values()]
      .filter((o) => opts?.includeRejected || o.review_status !== "rejeitado")
      .map((o) => structuredClone(o));
  }
  async getOpportunity(id: string) {
    const o = this.opportunities.get(id);
    return o ? structuredClone(o) : null;
  }
  async upsertOpportunity(data: OpportunityUpsert): Promise<UpsertOutcome> {
    const now = new Date().toISOString();
    const existing = [...this.opportunities.values()].find((o) => o.canonical_url === data.canonical_url);
    if (!existing) {
      const created: Opportunity = {
        ...structuredClone(data),
        id: randomUUID(),
        version: 1,
        review_status: "pendente",
        reviewed_by: null,
        reviewed_at: null,
        first_seen_at: now,
        last_seen_at: now,
        captured_at: now,
      };
      this.opportunities.set(created.id, created);
      this.versions.push({ opportunity_id: created.id, version: 1, content_hash: created.content_hash });
      return { opportunity: structuredClone(created), created: true, changed: true };
    }
    if (sameContent(data, existing)) {
      existing.last_seen_at = now;
      return { opportunity: structuredClone(existing), created: false, changed: false };
    }
    const updated: Opportunity = {
      ...existing,
      ...structuredClone(data),
      id: existing.id,
      version: existing.version + 1,
      // Conteúdo mudou: volta para revisão
      review_status: existing.review_status === "rejeitado" ? "rejeitado" : "pendente",
      last_seen_at: now,
      captured_at: now,
    };
    this.opportunities.set(existing.id, updated);
    this.versions.push({ opportunity_id: updated.id, version: updated.version, content_hash: updated.content_hash });
    return { opportunity: structuredClone(updated), created: false, changed: true };
  }
  async reviewOpportunity(id: string, status: Opportunity["review_status"], reviewer: string) {
    const o = this.opportunities.get(id);
    if (!o) return null;
    o.review_status = status;
    o.reviewed_by = reviewer;
    o.reviewed_at = new Date().toISOString();
    return structuredClone(o);
  }

  async startRun(sourceId: string, trigger: CollectionRun["trigger"], triggeredBy: string | null) {
    if (this.runs.some((r) => r.source_id === sourceId && r.status === "running")) {
      throw new ConcurrentRunError(sourceId);
    }
    const run: CollectionRun = {
      id: randomUUID(),
      source_id: sourceId,
      trigger,
      triggered_by: triggeredBy,
      status: "running",
      started_at: new Date().toISOString(),
      finished_at: null,
      stats: {},
      errors: [],
    };
    this.runs.unshift(run);
    return structuredClone(run);
  }
  async finishRun(id: string, patch: Pick<CollectionRun, "status" | "stats" | "errors">) {
    const run = this.runs.find((r) => r.id === id);
    if (!run) throw new Error("Execução não encontrada");
    Object.assign(run, patch, { finished_at: new Date().toISOString() });
    return structuredClone(run);
  }
  async listRuns(limit = 20) {
    return this.runs.slice(0, limit).map((r) => structuredClone(r));
  }

  async getRecommendations(userId: string) {
    return [...this.recs.values()].filter((r) => r.user_id === userId).map((r) => structuredClone(r));
  }
  async saveRecommendation(rec: Recommendation) {
    this.recs.set(`${rec.user_id}:${rec.opportunity_id}`, structuredClone(rec));
  }
  async saveFeedback(userId: string, opportunityId: string, relevant: boolean, comment: string | null) {
    this.feedback.set(`${userId}:${opportunityId}`, { opportunity_id: opportunityId, relevant, comment });
  }
  async getFeedback(userId: string) {
    return [...this.feedback.entries()].filter(([k]) => k.startsWith(`${userId}:`)).map(([, v]) => ({ ...v }));
  }

  async listSaved(userId: string) {
    return [...(this.saved.get(userId) ?? [])];
  }
  async setSaved(userId: string, opportunityId: string, saved: boolean) {
    const set = this.saved.get(userId) ?? new Set<string>();
    if (saved) set.add(opportunityId);
    else set.delete(opportunityId);
    this.saved.set(userId, set);
  }
}

// ── Supabase (produção) ─────────────────────────────────────────────────────

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const err = new Error(res.error.message) as Error & { code?: string };
    err.code = res.error.code;
    throw err;
  }
  return res.data;
}

export class SupabaseStore implements LupaStore {
  readonly kind = "supabase" as const;
  private get db() {
    return getSupabaseAdmin();
  }

  async getProfile(userId: string) {
    const data = check(await this.db.from("teacher_profiles").select("*").eq("user_id", userId).maybeSingle());
    return (data as TeacherProfile | null) ?? null;
  }
  async saveProfile(profile: TeacherProfile) {
    const data = check(await this.db.from("teacher_profiles").upsert(profile, { onConflict: "user_id" }).select().single());
    return data as TeacherProfile;
  }
  async listProfiles() {
    return (check(await this.db.from("teacher_profiles").select("*")) ?? []) as TeacherProfile[];
  }

  async listSources() {
    return (check(await this.db.from("opportunity_sources").select("*").order("id")) ?? []) as OpportunitySource[];
  }
  async getSource(id: string) {
    return (check(await this.db.from("opportunity_sources").select("*").eq("id", id).maybeSingle()) ?? null) as OpportunitySource | null;
  }
  async updateSource(id: string, patch: Partial<OpportunitySource>) {
    const { id: _ignored, ...rest } = patch;
    const data = check(
      await this.db.from("opportunity_sources").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id).select().maybeSingle(),
    );
    return (data ?? null) as OpportunitySource | null;
  }

  private async hydrate(rows: Array<Omit<Opportunity, "documents" | "events">>): Promise<Opportunity[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const docs = (check(await this.db.from("opportunity_documents").select("opportunity_id,url,kind,title").in("opportunity_id", ids)) ?? []) as Array<
      OpportunityDocument & { opportunity_id: string }
    >;
    const evs = (check(
      await this.db.from("opportunity_events").select("opportunity_id,kind,title,url,event_date,evidence").in("opportunity_id", ids),
    ) ?? []) as Array<OpportunityEvent & { opportunity_id: string }>;
    return rows.map((r) => ({
      ...r,
      documents: docs.filter((d) => d.opportunity_id === r.id).map(({ opportunity_id: _o, ...d }) => d),
      events: evs.filter((e) => e.opportunity_id === r.id).map(({ opportunity_id: _o, ...e }) => e),
    }));
  }

  async listOpportunities(opts?: { includeRejected?: boolean }) {
    let q = this.db.from("opportunities").select("*").order("last_seen_at", { ascending: false });
    if (!opts?.includeRejected) q = q.neq("review_status", "rejeitado");
    return this.hydrate((check(await q) ?? []) as Array<Omit<Opportunity, "documents" | "events">>);
  }
  async getOpportunity(id: string) {
    const row = check(await this.db.from("opportunities").select("*").eq("id", id).maybeSingle());
    if (!row) return null;
    const [o] = await this.hydrate([row as Omit<Opportunity, "documents" | "events">]);
    return o;
  }
  async upsertOpportunity(data: OpportunityUpsert): Promise<UpsertOutcome> {
    const now = new Date().toISOString();
    const { documents, events, ...row } = data;
    const existing = (check(await this.db.from("opportunities").select("*").eq("canonical_url", data.canonical_url).maybeSingle()) ??
      null) as Omit<Opportunity, "documents" | "events"> | null;
    let saved: Omit<Opportunity, "documents" | "events">;
    let created = false;
    let changed = true;
    if (!existing) {
      saved = check(await this.db.from("opportunities").insert({ ...row, version: 1 }).select().single()) as typeof saved;
      created = true;
    } else {
      const [current] = await this.hydrate([existing]);
      if (sameContent(data, current)) {
        await this.db.from("opportunities").update({ last_seen_at: now }).eq("id", existing.id);
        return { opportunity: { ...current, last_seen_at: now }, created: false, changed: false };
      }
      saved = check(
        await this.db
          .from("opportunities")
          .update({
            ...row,
            version: existing.version + 1,
            review_status: existing.review_status === "rejeitado" ? "rejeitado" : "pendente",
            last_seen_at: now,
            captured_at: now,
          })
          .eq("id", existing.id)
          .select()
          .single(),
      ) as typeof saved;
    }
    check(
      await this.db
        .from("opportunity_versions")
        .upsert({ opportunity_id: saved.id, version: saved.version, content_hash: saved.content_hash, snapshot: data }, { onConflict: "opportunity_id,version" }),
    );
    if (documents.length) {
      check(
        await this.db
          .from("opportunity_documents")
          .upsert(documents.map((d) => ({ ...d, opportunity_id: saved.id })), { onConflict: "opportunity_id,url" }),
      );
    }
    if (events.length) {
      check(
        await this.db
          .from("opportunity_events")
          .upsert(events.map((e) => ({ ...e, opportunity_id: saved.id })), { onConflict: "opportunity_id,kind,title" }),
      );
    }
    return { opportunity: { ...saved, documents, events }, created, changed };
  }
  async reviewOpportunity(id: string, status: Opportunity["review_status"], reviewer: string) {
    const row = check(
      await this.db
        .from("opportunities")
        .update({ review_status: status, reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .maybeSingle(),
    );
    if (!row) return null;
    return this.getOpportunity(id);
  }

  async startRun(sourceId: string, trigger: CollectionRun["trigger"], triggeredBy: string | null) {
    const res = await this.db
      .from("collection_runs")
      .insert({ source_id: sourceId, trigger, triggered_by: triggeredBy, status: "running" })
      .select()
      .single();
    // 23505 = violação do índice único parcial uq_collection_runs_running
    if (res.error?.code === "23505") throw new ConcurrentRunError(sourceId);
    return check(res) as CollectionRun;
  }
  async finishRun(id: string, patch: Pick<CollectionRun, "status" | "stats" | "errors">) {
    return check(
      await this.db.from("collection_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id).select().single(),
    ) as CollectionRun;
  }
  async listRuns(limit = 20) {
    return (check(await this.db.from("collection_runs").select("*").order("started_at", { ascending: false }).limit(limit)) ??
      []) as CollectionRun[];
  }

  async getRecommendations(userId: string) {
    return (check(await this.db.from("recommendations").select("*").eq("user_id", userId)) ?? []) as Recommendation[];
  }
  async saveRecommendation(rec: Recommendation) {
    check(await this.db.from("recommendations").upsert(rec, { onConflict: "user_id,opportunity_id" }));
  }
  async saveFeedback(userId: string, opportunityId: string, relevant: boolean, comment: string | null) {
    check(
      await this.db
        .from("recommendation_feedback")
        .upsert({ user_id: userId, opportunity_id: opportunityId, relevant, comment }, { onConflict: "user_id,opportunity_id" }),
    );
  }
  async getFeedback(userId: string) {
    return (check(await this.db.from("recommendation_feedback").select("opportunity_id,relevant,comment").eq("user_id", userId)) ??
      []) as Array<{ opportunity_id: string; relevant: boolean; comment: string | null }>;
  }

  async listSaved(userId: string) {
    const rows = (check(await this.db.from("saved_opportunities").select("opportunity_id").eq("user_id", userId)) ?? []) as Array<{
      opportunity_id: string;
    }>;
    return rows.map((r) => r.opportunity_id);
  }
  async setSaved(userId: string, opportunityId: string, saved: boolean) {
    if (saved) {
      check(await this.db.from("saved_opportunities").upsert({ user_id: userId, opportunity_id: opportunityId }, { onConflict: "user_id,opportunity_id" }));
    } else {
      check(await this.db.from("saved_opportunities").delete().eq("user_id", userId).eq("opportunity_id", opportunityId));
    }
  }
}

// ── Seleção ──────────────────────────────────────────────────────────────────

let current: LupaStore | null = null;

/**
 * LUPA_STORE=memory → MemoryStore (só fora de produção, com aviso no log).
 * Caso contrário → SupabaseStore.
 */
export function getStore(): LupaStore {
  if (current) return current;
  if (process.env.LUPA_STORE === "memory") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("LUPA_STORE=memory não é permitido em produção.");
    }
    current = new MemoryStore();
    return current;
  }
  current = new SupabaseStore();
  return current;
}

/** Só para testes. */
export function setStoreForTests(store: LupaStore | null) {
  current = store;
}
