/**
 * @file routes/lupa.ts
 * @description Rotas do fluxo docente: perfil, catálogo, recomendações, salvos,
 * administração da coleta e contratos de integração (Hermes, eLattes).
 *
 * Autorização:
 *   - Perfil/recomendações/salvos: sempre do usuário do JWT (req.supabaseUser.sub).
 *     Não existe parâmetro de rota com user_id → um usuário não alcança dados de outro.
 *   - /api/admin/*: requireAdmin() (papel vem de app_metadata ou LUPA_ADMIN_USER_IDS).
 *   - Catálogo (GET /api/opportunities): leitura pública de editais oficiais, sem
 *     itens rejeitados pela revisão.
 *
 * Erros de banco nunca são repassados ao cliente (mensagem genérica + log).
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/supabase";
import { getStore, ConcurrentRunError } from "../lib/lupa/store";
import { logger } from "../lib/logger";
import { getUserId, isAdminClaims, getClaims, requireAdmin } from "../lib/lupa/roles";
import {
  emptyProfile,
  ProfileInputSchema,
  SourceUpdateSchema,
  type CollectionRun,
  type FieldSource,
  type Opportunity,
  type ProfileInput,
  type Recommendation,
  type TeacherProfile,
} from "../lib/lupa/types";
import { RECOMMENDATION_RULE_VERSION, computeRecommendation, inferOpportunityTypes, normalizeText } from "../lib/lupa/matching";
import type { NotificationDraft } from "../lib/lupa/store";
import { createSafeDocumentFetcher, createSafeFetcher, runCollection, type PageFetcher } from "../lib/lupa/collector/crawler";
import type { DocumentFetcher } from "../lib/lupa/collector/documents";
import { InstitutionalImportSchema, LattesSummarySchema, getLattesProvider, type LattesSummary } from "../lib/lupa/integrations/lattes";
import { HERMES_STATUS, hermesConfigured, verifyHermesSecret } from "../lib/lupa/integrations/hermes";
import { STALE_RUN_MS, cronConfigured, dueSources, verifyCronSecret } from "../lib/lupa/integrations/cron";
import {
  CreateParticipationSchema,
  MAX_PARTICIPATIONS_PER_USER,
  ParticipationRuleError,
  UpdateParticipationSchema,
  applyUpdate,
  blankParticipation,
  compareFields,
  deterministicCheck,
  fromAnalysis,
  fromOpportunity,
  projectContext,
} from "../lib/lupa/participations";
import { ownsResource } from "./resources";
import { httpSelectTwoFilters } from "../lib/db-http";
import { officialSubmissionDeadline } from "../lib/lupa/deadlines";
import { datesAsCandidates } from "../lib/lupa/collector/parse";
import { deleteUserData, exportUserData } from "../lib/userData";
import { deleteAuthUser } from "../lib/accountClosure";

const router = Router();

function fail(req: Request, res: Response, err: unknown, context: string) {
  req.log?.error({ context, error: err instanceof Error ? err.message : String(err) }, "lupa:error");
  res.status(503).json({ error: "Serviço de dados indisponível no momento. Tente novamente." });
}

/** Permite trocar o fetcher da coleta em testes (sem rede). */
let fetcherFactory: (allowedHosts: string[]) => PageFetcher = createSafeFetcher;
let documentFetcherFactory: (allowedHosts: string[]) => DocumentFetcher = createSafeDocumentFetcher;
export function setDocumentFetcherFactoryForTests(f: ((allowedHosts: string[]) => DocumentFetcher) | null) {
  documentFetcherFactory = f ?? createSafeDocumentFetcher;
}
export function setFetcherFactoryForTests(f: ((allowedHosts: string[]) => PageFetcher) | null) {
  fetcherFactory = f ?? createSafeFetcher;
}

// ── Perfil ───────────────────────────────────────────────────────────────────

/** Aplica alterações, registrando origem e data por campo, e incrementa a versão. */
export function applyProfileInput(current: TeacherProfile, input: ProfileInput, source: FieldSource, now = new Date().toISOString()): TeacherProfile {
  const next: TeacherProfile = { ...current, field_sources: { ...current.field_sources } };
  let changed = false;
  for (const [key, value] of Object.entries(input) as Array<[keyof ProfileInput, unknown]>) {
    if (value === undefined) continue;
    if (JSON.stringify((current as unknown as Record<string, unknown>)[key]) === JSON.stringify(value)) continue;
    (next as unknown as Record<string, unknown>)[key] = value;
    if (key !== "notification_prefs") next.field_sources[key] = { source, updated_at: now };
    changed = true;
  }
  if (!changed && current.version > 0) return current;
  next.version = current.version + 1;
  next.updated_at = now;
  return next;
}

function summaryToInput(s: LattesSummary): ProfileInput {
  return {
    display_name: s.nome,
    institution: s.instituicao ?? undefined,
    unit: s.unidade ?? undefined,
    areas: s.areas,
    competencies: s.competencias,
    research_topics: s.temas,
    keywords: s.palavras_chave,
    lattes_id: s.lattes_id,
    orcid: s.orcid ?? undefined,
    declared_degree: s.titulacao ?? undefined,
    current_projects: s.evidencias.filter((e) => e.tipo === "projeto").map((e) => e.descricao).join("\n") || undefined,
  };
}

router.get("/me", requireAuth(), (req, res) => {
  const claims = getClaims(req) as { sub: string; email?: string } | null;
  res.json({ id: claims?.sub, email: claims?.email ?? null, is_admin: isAdminClaims(claims) });
});

router.get("/profile", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const profile = (await getStore().getProfile(userId)) ?? emptyProfile(userId);
    res.json({ profile, lattes_integration: { configured: getLattesProvider().configured } });
  } catch (err) {
    fail(req, res, err, "profile:get");
  }
});

router.put("/profile", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  const parsed = ProfileInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Dados do perfil inválidos.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const store = getStore();
    const current = (await store.getProfile(userId)) ?? emptyProfile(userId);
    const next = applyProfileInput(current, parsed.data, "autodeclarado");
    const saved = next === current ? current : await store.saveProfile(next);
    res.json({ profile: saved });
  } catch (err) {
    fail(req, res, err, "profile:put");
  }
});

/**
 * Diferenças entre o perfil atual e a importação. Campos já confirmados pela pessoa
 * (origem "autodeclarado") e diferentes do importado ficam como CONFLITO: só são
 * substituídos se ela marcar explicitamente (body.substituir).
 */
export function lattesImportPlan(current: TeacherProfile, input: ProfileInput) {
  const changes: Array<{ campo: string; atual: unknown; novo: unknown; origem_atual: string | null; conflito: boolean }> = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const atual = (current as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(atual) === JSON.stringify(value)) continue;
    const origem = current.field_sources[key]?.source ?? null;
    const vazio = atual == null || (Array.isArray(atual) && atual.length === 0) || atual === "";
    changes.push({ campo: key, atual: atual ?? null, novo: value, origem_atual: origem, conflito: !vazio && origem === "autodeclarado" });
  }
  return changes;
}

/**
 * Importação PROVISÓRIA do resumo Lattes em JSON — só para o próprio perfil.
 *   ?previa=1 → mostra o que mudaria (nada é gravado).
 *   Sem previa → grava; conflitos com dados confirmados só entram se listados em `substituir`.
 */
router.post("/profile/lattes-import", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const substituir = Array.isArray(body.substituir) ? body.substituir.filter((x): x is string => typeof x === "string").slice(0, 40) : [];
  const { substituir: _s, ...summary } = body;
  const parsed = LattesSummarySchema.safeParse(summary);
  if (!parsed.success) {
    res.status(400).json({ error: "JSON do resumo Lattes inválido.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const store = getStore();
    const current = (await store.getProfile(userId)) ?? emptyProfile(userId);
    const input = ProfileInputSchema.parse(Object.fromEntries(Object.entries(summaryToInput(parsed.data)).filter(([, v]) => v !== undefined)));
    const plan = lattesImportPlan(current, input);
    const origem = { fonte: "Resumo Lattes (JSON, importação provisória)", atualizado_em: parsed.data.atualizado_em ?? null };
    if (req.query.previa === "1") {
      res.json({ previa: true, mudancas: plan, origem });
      return;
    }
    const allowed = Object.fromEntries(
      Object.entries(input).filter(([k]) => {
        const c = plan.find((p) => p.campo === k);
        return c && (!c.conflito || substituir.includes(k));
      }),
    ) as ProfileInput;
    const next = applyProfileInput(current, allowed, "importacao_json_provisoria");
    const saved = next === current ? current : await store.saveProfile(next);
    const mantidos = plan.filter((p) => p.conflito && !substituir.includes(p.campo)).map((p) => p.campo);
    res.json({ profile: saved, provisional: true, lattes_updated_at: parsed.data.atualizado_em, mantidos, origem });
  } catch (err) {
    fail(req, res, err, "profile:lattes-import");
  }
});

// ── Catálogo ─────────────────────────────────────────────────────────────────

/** Prazo oficial de inscrição (regra única de deadlines.ts), em ISO, se confirmado no texto. */
export function submissionDeadline(o: Opportunity, today?: string): string | null {
  return officialSubmissionDeadline(datesAsCandidates(o.fields), today)?.iso ?? null;
}

function publicOpportunity(o: Opportunity) {
  const { reviewed_by: _r, ...rest } = o;
  // Texto por página fica no servidor (pesado); a resposta diz se foi lido e quantas páginas
  const documents = o.documents.map(({ pages: _p, ...d }) => d);
  return { ...rest, documents, deadline: submissionDeadline(o), types: inferOpportunityTypes(o) };
}

const CatalogQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  area: z.string().trim().max(120).optional(),
  source: z.string().trim().max(40).optional(),
  status: z.enum(["aberta", "encerrada", "suspensa", "cancelada", "desconhecida"]).optional(),
  /** Só com prazo confirmado até N dias a partir de hoje */
  prazo_dias: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(["recentes", "prazo", "titulo"]).default("recentes"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});

export function filterCatalog(list: Opportunity[], query: z.infer<typeof CatalogQuerySchema>, today = new Date().toISOString().slice(0, 10)) {
  const q = query.q ? normalizeText(query.q) : "";
  const area = query.area ? normalizeText(query.area) : "";
  const limit = query.prazo_dias ? new Date(Date.parse(today) + query.prazo_dias * 86_400_000).toISOString().slice(0, 10) : null;
  let items = list.filter((o) => {
    if (query.source && o.source_id !== query.source) return false;
    if (query.status && o.status !== query.status) return false;
    const hay = normalizeText(`${o.title} ${o.edital_number ?? ""} ${o.fields.objeto?.evidence ?? ""} ${(o.fields.areas?.value ?? []).join(" ")}`);
    if (q && !q.split(" ").every((t) => hay.includes(t))) return false;
    if (area && !normalizeText(`${(o.fields.areas?.value ?? []).join(" ")} ${o.fields.areas?.evidence ?? ""}`).includes(area)) return false;
    if (limit) {
      const d = submissionDeadline(o);
      if (!d || d < today || d > limit) return false;
    }
    return true;
  });
  if (query.sort === "titulo") items = items.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  else if (query.sort === "prazo") {
    // Prazos futuros primeiro (mais próximos), depois sem prazo / vencidos
    const key = (o: Opportunity) => {
      const d = submissionDeadline(o);
      return d && d >= today ? `0${d}` : `1${o.last_seen_at}`;
    };
    items = items.sort((a, b) => key(a).localeCompare(key(b)));
  } else items = items.sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at));
  const total = items.length;
  const start = (query.page - 1) * query.page_size;
  return { items: items.slice(start, start + query.page_size), total };
}

export type CatalogCollectionState = {
  situacao: "com_itens" | "nunca_coletado" | "coletando" | "coleta_falhou" | "coleta_sem_itens" | "desconhecida";
  ultima: { status: CollectionRun["status"]; iniciada_em: string; concluida_em: string | null; erros: number; motivo: string | null } | null;
  pendentes_revisao: number;
};

/** Por que o catálogo está como está: nunca coletado, coleta em andamento/falhou/sem itens. */
export function catalogCollectionState(list: Opportunity[], runs: CollectionRun[]): CatalogCollectionState {
  const last = [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
  const ultima = last
    ? {
        status: last.status,
        iniciada_em: last.started_at,
        concluida_em: last.finished_at,
        erros: last.errors.length,
        // Mensagem curta, sem URL (o detalhe fica na administração)
        motivo: last.errors[0]?.message ? last.errors[0].message.replace(/https?:\/\/\S+/g, "[endereço]").slice(0, 160) : null,
      }
    : null;
  const pendentes_revisao = list.filter((o) => o.review_status === "pendente").length;
  if (list.length > 0) return { situacao: "com_itens", ultima, pendentes_revisao };
  if (!last) return { situacao: "nunca_coletado", ultima, pendentes_revisao };
  if (last.status === "running") return { situacao: "coletando", ultima, pendentes_revisao };
  if (last.status === "failed") return { situacao: "coleta_falhou", ultima, pendentes_revisao };
  return { situacao: "coleta_sem_itens", ultima, pendentes_revisao };
}

router.get("/opportunities", async (req, res) => {
  const parsed = CatalogQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Filtro inválido." });
    return;
  }
  try {
    const list = await getStore().listOpportunities();
    const { items, total } = filterCatalog(list, parsed.data);
    const sources = [...new Set(list.map((o) => o.source_id))];
    const areas = [...new Set(list.flatMap((o) => o.fields.areas?.value ?? []))].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 80);
    // Estado da coleta, para o catálogo vazio dizer POR QUE está vazio (sem expor URLs internas)
    let coleta: CatalogCollectionState;
    try {
      coleta = catalogCollectionState(list, await getStore().listRuns(5));
    } catch {
      coleta = { situacao: "desconhecida", ultima: null, pendentes_revisao: list.filter((o) => o.review_status === "pendente").length };
    }
    res.json({
      coleta,
      opportunities: items.map(publicOpportunity),
      total,
      page: parsed.data.page,
      page_size: parsed.data.page_size,
      facets: { sources, areas },
      updated_at: list.reduce<string | null>((m, o) => (!m || o.last_seen_at > m ? o.last_seen_at : m), null),
    });
  } catch (err) {
    fail(req, res, err, "opportunities:list");
  }
});

router.get("/opportunities/:id", async (req, res) => {
  try {
    const o = await getStore().getOpportunity(String(req.params.id));
    if (!o || o.review_status === "rejeitado") {
      res.status(404).json({ error: "Oportunidade não encontrada." });
      return;
    }
    res.json({ opportunity: publicOpportunity(o) });
  } catch (err) {
    fail(req, res, err, "opportunities:get");
  }
});

// ── Recomendações ────────────────────────────────────────────────────────────

const OVERALL_ORDER = { sem_impedimento_conhecido: 0, pendente: 1, impedimento: 2 } as const;

/** Recalcula quando a versão do edital ou do perfil mudou. Exportado para testes. */
export async function refreshRecommendations(userId: string) {
  const store = getStore();
  const profile = (await store.getProfile(userId)) ?? emptyProfile(userId);
  const [opportunities, existing, feedback, savedItems] = await Promise.all([
    store.listOpportunities(),
    store.getRecommendations(userId),
    store.getFeedback(userId),
    store.listSavedItems(userId),
  ]);
  const saved = savedItems.map((i) => i.opportunity_id);
  const byOpp = new Map(existing.map((r) => [r.opportunity_id, r]));
  const out: Array<Recommendation & { opportunity: ReturnType<typeof publicOpportunity>; feedback: { relevant: boolean } | null; saved: boolean; interested: boolean; recomputed: boolean }> = [];
  for (const o of opportunities) {
    let rec = byOpp.get(o.id);
    let recomputed = false;
    // Também recalcula quando a REGRA mudou (recomendações antigas não ficam com critérios velhos)
    if (!rec || rec.opportunity_version !== o.version || rec.profile_version !== profile.version || rec.result.rule_version !== RECOMMENDATION_RULE_VERSION) {
      rec = {
        user_id: userId,
        opportunity_id: o.id,
        opportunity_version: o.version,
        profile_version: profile.version,
        result: computeRecommendation(profile, o),
        computed_at: new Date().toISOString(),
      };
      await store.saveRecommendation(rec);
      recomputed = true;
    }
    const fb = feedback.find((f) => f.opportunity_id === o.id);
    const item = savedItems.find((i) => i.opportunity_id === o.id);
    out.push({
      ...rec,
      opportunity: publicOpportunity(o),
      feedback: fb ? { relevant: fb.relevant } : null,
      saved: Boolean(item),
      interested: Boolean(item?.interested),
      recomputed,
    });
  }
  await store.addNotifications(buildNotifications(profile, out, opportunities, savedItems));
  out.sort(
    (a, b) =>
      OVERALL_ORDER[a.result.eligibility.overall] - OVERALL_ORDER[b.result.eligibility.overall] ||
      b.result.thematic.score - a.result.thematic.score,
  );
  return { profile, recommendations: out };
}

/**
 * Avisos internos (sem e-mail): gerados ao recalcular as recomendações.
 *   - recomendacao: edital aberto, com aderência alta/média e sem impedimento conhecido.
 *   - mudanca_salvo: edital salvo ganhou versão nova desde que foi salvo/visto.
 * A chave única (usuário, tipo, oportunidade, versão) impede duplicação.
 * Preferência "nunca" desliga os avisos de recomendação (mudanças em salvos continuam,
 * porque foram pedidas explicitamente ao salvar).
 */
export function buildNotifications(
  profile: TeacherProfile,
  recs: Array<{ opportunity_id: string; opportunity_version: number; result: Recommendation["result"] }>,
  opportunities: Opportunity[],
  savedItems: Array<{ opportunity_id: string; seen_version: number | null }>,
): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  if (profile.version > 0 && profile.notification_prefs?.frequency !== "nunca") {
    for (const r of recs) {
      const o = byId.get(r.opportunity_id);
      if (!o || o.status !== "aberta" || o.review_status === "rejeitado") continue;
      if (r.result.eligibility.overall === "impedimento") continue;
      if (r.result.thematic.level !== "alta" && r.result.thematic.level !== "media") continue;
      out.push({
        user_id: profile.user_id,
        kind: "recomendacao",
        opportunity_id: o.id,
        opportunity_version: o.version,
        title: `Novo edital compatível: ${o.title}`.slice(0, 200),
        body: r.result.summary.slice(0, 500),
      });
    }
  }
  for (const s of savedItems) {
    const o = byId.get(s.opportunity_id);
    if (!o || s.seen_version == null || o.version <= s.seen_version) continue;
    out.push({
      user_id: profile.user_id,
      kind: "mudanca_salvo",
      opportunity_id: o.id,
      opportunity_version: o.version,
      title: `Edital salvo foi alterado: ${o.title}`.slice(0, 200),
      body: "A página oficial mudou desde que você salvou. Confira a nova versão e o histórico.",
    });
  }
  return out;
}

router.get("/recommendations", requireAuth(), async (req, res) => {
  try {
    const { profile, recommendations } = await refreshRecommendations(getUserId(req) as string);
    res.json({
      profile_version: profile.version,
      criteria_doc: "O índice de aderência temática não é probabilidade de aprovação. Elegibilidade é avaliada separadamente.",
      recommendations,
    });
  } catch (err) {
    fail(req, res, err, "recommendations:list");
  }
});

const FeedbackSchema = z.object({ relevant: z.boolean(), comment: z.string().trim().max(1000).nullable().optional() }).strict();

router.post("/recommendations/:opportunityId/feedback", requireAuth(), async (req, res) => {
  const parsed = FeedbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Feedback inválido." });
    return;
  }
  try {
    const store = getStore();
    const o = await store.getOpportunity(String(req.params.opportunityId));
    if (!o) {
      res.status(404).json({ error: "Oportunidade não encontrada." });
      return;
    }
    await store.saveFeedback(getUserId(req) as string, o.id, parsed.data.relevant, parsed.data.comment ?? null);
    res.status(204).end();
  } catch (err) {
    fail(req, res, err, "recommendations:feedback");
  }
});

// ── Salvos ───────────────────────────────────────────────────────────────────

router.get("/saved-opportunities", requireAuth(), async (req, res) => {
  try {
    const store = getStore();
    const saved = await store.listSavedItems(getUserId(req) as string);
    const items = (await Promise.all(saved.map((s) => store.getOpportunity(s.opportunity_id)))).filter((o): o is Opportunity => Boolean(o));
    res.json({
      opportunities: items.map((o) => {
        const s = saved.find((x) => x.opportunity_id === o.id);
        return { ...publicOpportunity(o), interested: Boolean(s?.interested), changed_since_saved: s?.seen_version != null && o.version > s.seen_version };
      }),
    });
  } catch (err) {
    fail(req, res, err, "saved:list");
  }
});

router.put("/saved-opportunities/:opportunityId", requireAuth(), async (req, res) => {
  try {
    const store = getStore();
    const o = await store.getOpportunity(String(req.params.opportunityId));
    if (!o) {
      res.status(404).json({ error: "Oportunidade não encontrada." });
      return;
    }
    await store.setSaved(getUserId(req) as string, o.id, true);
    res.status(204).end();
  } catch (err) {
    fail(req, res, err, "saved:add");
  }
});

const InterestSchema = z.object({ interested: z.boolean() }).strict();

/** "Demonstrar interesse": salva o edital (se ainda não estiver) e registra o interesse. */
router.put("/saved-opportunities/:opportunityId/interest", requireAuth(), async (req, res) => {
  const parsed = InterestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Requisição inválida." });
    return;
  }
  try {
    const store = getStore();
    const o = await store.getOpportunity(String(req.params.opportunityId));
    if (!o || o.review_status === "rejeitado") {
      res.status(404).json({ error: "Oportunidade não encontrada." });
      return;
    }
    await store.setInterest(getUserId(req) as string, o.id, parsed.data.interested, o.version);
    res.json({ saved: true, interested: parsed.data.interested });
  } catch (err) {
    fail(req, res, err, "saved:interest");
  }
});

/** Marca a versão atual do edital salvo como vista (some o aviso de "alterado"). */
router.post("/saved-opportunities/:opportunityId/seen", requireAuth(), async (req, res) => {
  try {
    const store = getStore();
    const o = await store.getOpportunity(String(req.params.opportunityId));
    if (!o) {
      res.status(404).json({ error: "Oportunidade não encontrada." });
      return;
    }
    await store.markSavedSeen(getUserId(req) as string, o.id, o.version);
    res.status(204).end();
  } catch (err) {
    fail(req, res, err, "saved:seen");
  }
});

// ── Avisos (central interna) ─────────────────────────────────────────────────

router.get("/notifications", requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req) as string;
    await refreshRecommendations(userId); // gera avisos pendentes (deduplicados)
    const items = await getStore().listNotifications(userId, 50);
    res.json({ notifications: items, unread: items.filter((n) => !n.read_at).length });
  } catch (err) {
    fail(req, res, err, "notifications:list");
  }
});

const ReadSchema = z.union([z.object({ all: z.literal(true) }).strict(), z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict()]);

router.post("/notifications/read", requireAuth(), async (req, res) => {
  const parsed = ReadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Requisição inválida." });
    return;
  }
  try {
    const n = await getStore().markNotificationsRead(getUserId(req) as string, "all" in parsed.data ? "all" : parsed.data.ids);
    res.json({ marked: n });
  } catch (err) {
    fail(req, res, err, "notifications:read");
  }
});

// ── Quero participar ────────────────────────────────────────────────────────
// Organiza o trabalho da pessoa para um edital. Não inscreve em site externo.

router.get("/participations", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const list = await getStore().listParticipations(userId);
    res.json({
      participations: list.map(({ fields_snapshot: _f, versoes, ...p }) => ({ ...p, versoes_total: versoes.length })),
    });
  } catch (err) {
    fail(req, res, err, "participations:list");
  }
});

router.post("/participations", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  const parsed = CreateParticipationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  try {
    const store = getStore();
    const existing = await store.listParticipations(userId);
    // Um espaço por edital/análise: repetir o clique reabre o mesmo, não duplica
    const same = existing.find(
      (p) => (parsed.data.opportunity_id && p.opportunity_id === parsed.data.opportunity_id) || (parsed.data.agent_result_id && p.agent_result_id === parsed.data.agent_result_id),
    );
    if (same) {
      res.status(200).json({ participation: same, existente: true });
      return;
    }
    if (existing.length >= MAX_PARTICIPATIONS_PER_USER) {
      res.status(409).json({ error: `Limite de ${MAX_PARTICIPATIONS_PER_USER} participações atingido. Exclua alguma antes de criar outra.` });
      return;
    }
    let created;
    if (parsed.data.opportunity_id) {
      const o = await store.getOpportunity(parsed.data.opportunity_id);
      if (!o || o.review_status === "rejeitado") {
        res.status(404).json({ error: "Edital não encontrado." });
        return;
      }
      created = fromOpportunity(userId, o);
    } else if (parsed.data.agent_result_id) {
      // Só análises DESTA pessoa (owner check no servidor)
      const rows = await httpSelectTwoFilters<Record<string, unknown>>("agent_results", "id", parsed.data.agent_result_id, "user_id", userId, { limit: 1 });
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Análise não encontrada." });
        return;
      }
      const result = (row.resultJson ?? {}) as Record<string, unknown>;
      created = fromAnalysis(userId, Number(row.id), String(parsed.data.titulo ?? row.title ?? "Participação"), (result.base ?? null) as never);
    } else {
      created = blankParticipation(userId, parsed.data.titulo as string, parsed.data.tipo);
    }
    if (parsed.data.tipo) {
      created.tipo = parsed.data.tipo;
    }
    const saved = await store.createParticipation(created);
    res.status(201).json({ participation: saved, existente: false });
  } catch (err) {
    fail(req, res, err, "participations:create");
  }
});

router.get("/participations/:id", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const store = getStore();
    const p = await store.getParticipation(userId, req.params.id as string);
    if (!p) {
      res.status(404).json({ error: "Participação não encontrada." });
      return;
    }
    const o = p.opportunity_id ? await store.getOpportunity(p.opportunity_id) : null;
    res.json({
      participation: p,
      edital: o ? { id: o.id, title: o.title, version: o.version, status: o.status, canonical_url: o.canonical_url, captured_at: o.captured_at } : null,
      conferencia: deterministicCheck(p, o?.version ?? null),
      mudancas: o && p.opportunity_version != null && o.version > p.opportunity_version ? compareFields(p.fields_snapshot, o.fields) : [],
    });
  } catch (err) {
    fail(req, res, err, "participations:get");
  }
});

router.patch("/participations/:id", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  const parsed = UpdateParticipationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos. Campos como id, dono e origem do edital não podem ser alterados.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const store = getStore();
    const current = await store.getParticipation(userId, req.params.id as string);
    if (!current) {
      res.status(404).json({ error: "Participação não encontrada." });
      return;
    }
    if (current.version !== parsed.data.expected_version) {
      res.status(409).json({ error: "Esta participação foi alterada em outra aba ou dispositivo. Recarregue para ver a versão mais recente; seu texto continua na tela.", atual: current });
      return;
    }
    let next;
    try {
      next = applyUpdate(current, parsed.data);
    } catch (e) {
      if (e instanceof ParticipationRuleError) {
        res.status(422).json({ error: e.message, code: "REGRA_PARTICIPACAO" });
        return;
      }
      throw e;
    }
    const saved = await store.updateParticipation(userId, next, parsed.data.expected_version);
    if (!saved) {
      res.status(409).json({ error: "Esta participação foi alterada ao mesmo tempo em outro lugar. Recarregue; seu texto continua na tela." });
      return;
    }
    res.json({ participation: saved });
  } catch (err) {
    fail(req, res, err, "participations:update");
  }
});

/** Aceita a versão nova do edital: atualiza o retrato e acrescenta itens novos sem apagar os seus. */
router.post("/participations/:id/aceitar-versao", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const store = getStore();
    const p = await store.getParticipation(userId, req.params.id as string);
    if (!p || !p.opportunity_id) {
      res.status(404).json({ error: "Participação não encontrada." });
      return;
    }
    const o = await store.getOpportunity(p.opportunity_id);
    if (!o) {
      res.status(404).json({ error: "O edital não está mais disponível no catálogo." });
      return;
    }
    const fresh = fromOpportunity(userId, o);
    const knownItems = new Set(p.checklist.map((c) => c.item));
    const knownDates = new Set(p.prazos.map((d) => `${d.rotulo}|${d.data}`));
    const next = {
      ...p,
      opportunity_version: o.version,
      fields_snapshot: fresh.fields_snapshot,
      checklist: [...p.checklist, ...fresh.checklist.filter((c) => !knownItems.has(c.item))],
      // Prazos do edital passam a ser os da nova versão; os seus continuam
      prazos: [...fresh.prazos, ...p.prazos.filter((d) => d.origem === "usuario" && !knownDates.has(`${d.rotulo}|${d.data}`))],
      version: p.version + 1,
      updated_at: new Date().toISOString(),
    };
    const saved = await store.updateParticipation(userId, next, p.version);
    if (!saved) {
      res.status(409).json({ error: "A participação mudou enquanto atualizávamos. Recarregue e tente de novo." });
      return;
    }
    res.json({ participation: saved });
  } catch (err) {
    fail(req, res, err, "participations:accept-version");
  }
});

/** Contexto para preparar o projeto: o que vem do edital, do perfil e da proposta, e o que falta. */
router.get("/participations/:id/projeto-contexto", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const store = getStore();
    const p = await store.getParticipation(userId, req.params.id as string);
    if (!p) {
      res.status(404).json({ error: "Participação não encontrada." });
      return;
    }
    const o = p.opportunity_id ? await store.getOpportunity(p.opportunity_id) : null;
    const profile = await store.getProfile(userId);
    res.json(projectContext(p, o, profile));
  } catch (err) {
    fail(req, res, err, "participations:project-context");
  }
});

const LinkProjectSchema = z.object({ project_id: z.string().uuid() }).strict();

/** Vincula um projeto (do MESMO usuário) à participação. */
router.post("/participations/:id/vincular-projeto", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  const parsed = LinkProjectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Informe o projeto." });
    return;
  }
  try {
    const store = getStore();
    const p = await store.getParticipation(userId, req.params.id as string);
    if (!p || !(await ownsResource("research_projects", parsed.data.project_id, userId))) {
      res.status(404).json({ error: "Participação ou projeto não encontrado." });
      return;
    }
    const saved = await store.updateParticipation(userId, { ...p, project_id: parsed.data.project_id, version: p.version + 1, updated_at: new Date().toISOString() }, p.version);
    if (!saved) {
      res.status(409).json({ error: "A participação mudou ao mesmo tempo em outro lugar. Recarregue e tente de novo." });
      return;
    }
    res.json({ participation: saved });
  } catch (err) {
    fail(req, res, err, "participations:link-project");
  }
});

router.delete("/participations/:id", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const ok = await getStore().deleteParticipation(userId, req.params.id as string);
    if (!ok) {
      res.status(404).json({ error: "Participação não encontrada." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    fail(req, res, err, "participations:delete");
  }
});

// ── Meus dados (direitos do titular) ────────────────────────────────────────

router.get("/me/export", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  try {
    const out = await exportUserData(userId);
    res.setHeader("Content-Disposition", `attachment; filename="lupa-meus-dados-${out.gerado_em.slice(0, 10)}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    fail(req, res, err, "me:export");
  }
});

const DeleteMeSchema = z.object({ confirmacao: z.literal("EXCLUIR MEUS DADOS") }).strict();

router.delete("/me/data", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  if (!DeleteMeSchema.safeParse(req.body ?? {}).success) {
    res.status(400).json({ error: 'Para confirmar, digite exatamente: EXCLUIR MEUS DADOS' });
    return;
  }
  try {
    const out = await deleteUserData(userId);
    req.log?.info({ context: "me:delete", concluido: out.concluido }, "user data deletion");
    res.status(out.concluido ? 200 : 207).json(out);
  } catch (err) {
    fail(req, res, err, "me:delete");
  }
});

const CloseAccountSchema = z.object({ confirmacao: z.literal("ENCERRAR MINHA CONTA") }).strict();

/** Encerrar a conta: apaga os dados e, só se tudo foi apagado, remove o acesso (Supabase Auth). */
router.delete("/me/account", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  if (!CloseAccountSchema.safeParse(req.body ?? {}).success) {
    res.status(400).json({ error: "Para confirmar, digite exatamente: ENCERRAR MINHA CONTA" });
    return;
  }
  try {
    const dados = await deleteUserData(userId);
    if (!dados.concluido) {
      res.status(207).json({ ...dados, conta_removida: false, aviso: "Nem todos os dados foram apagados; a conta NÃO foi removida. Tente de novo." });
      return;
    }
    const conta = await deleteAuthUser(userId);
    req.log?.info({ context: "me:close", conta_removida: conta.ok }, "account closure");
    res.status(conta.ok ? 200 : 207).json({
      ...dados,
      conta_removida: conta.ok,
      ...(conta.ok ? {} : { aviso: "Os dados foram apagados, mas a conta de acesso não pôde ser removida agora. Tente de novo ou use o canal de atendimento." }),
    });
  } catch (err) {
    fail(req, res, err, "me:close");
  }
});

router.delete("/saved-opportunities/:opportunityId", requireAuth(), async (req, res) => {
  try {
    await getStore().setSaved(getUserId(req) as string, String(req.params.opportunityId), false);
    res.status(204).end();
  } catch (err) {
    fail(req, res, err, "saved:remove");
  }
});

// ── Administração ────────────────────────────────────────────────────────────

router.get("/admin/status", requireAdmin(), (_req, res) => {
  res.json({
    store: getStore().kind,
    hermes: { ...HERMES_STATUS, trigger_configured: hermesConfigured() },
    coleta_agendada: { configurada: cronConfigured(), horario: "diária, 06:17 (horário de Brasília)" },
    elattes: { configured: getLattesProvider().configured, fallback: "importação JSON provisória" },
  });
});

router.get("/admin/sources", requireAdmin(), async (req, res) => {
  try {
    const store = getStore();
    const [sources, runs] = await Promise.all([store.listSources(), store.listRuns(50)]);
    res.json({ sources: sources.map((s) => ({ ...s, last_run: runs.find((r) => r.source_id === s.id) ?? null })) });
  } catch (err) {
    fail(req, res, err, "admin:sources");
  }
});

router.patch("/admin/sources/:id", requireAdmin(), async (req, res) => {
  const parsed = SourceUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Configuração inválida.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const store = getStore();
    const source = await store.getSource(String(req.params.id));
    if (!source) {
      res.status(404).json({ error: "Fonte não encontrada." });
      return;
    }
    // URLs iniciais precisam pertencer aos hosts da fonte
    if (parsed.data.start_urls?.some((u) => !source.allowed_hosts.includes(new URL(u).hostname))) {
      res.status(400).json({ error: "As URLs iniciais precisam pertencer aos domínios oficiais da fonte." });
      return;
    }
    res.json({ source: await store.updateSource(source.id, parsed.data) });
  } catch (err) {
    fail(req, res, err, "admin:sources:update");
  }
});

router.get("/admin/runs", requireAdmin(), async (req, res) => {
  try {
    res.json({ runs: await getStore().listRuns(30) });
  } catch (err) {
    fail(req, res, err, "admin:runs");
  }
});

async function triggerRun(req: Request, res: Response, sourceId: string, trigger: "manual" | "hermes", triggeredBy: string | null) {
  try {
    const store = getStore();
    const source = await store.getSource(sourceId);
    if (!source) {
      res.status(404).json({ error: "Fonte não encontrada." });
      return;
    }
    const run = await runCollection(store, sourceId, { trigger, triggeredBy, fetcher: fetcherFactory(source.allowed_hosts), documentFetcher: documentFetcherFactory(source.allowed_hosts) });
    res.status(trigger === "hermes" ? 202 : 200).json({ run });
  } catch (err) {
    if (err instanceof ConcurrentRunError) {
      res.status(409).json({ error: err.message });
      return;
    }
    fail(req, res, err, "collect");
  }
}

router.post("/admin/sources/:id/collect", requireAdmin(), async (req, res) => {
  await triggerRun(req, res, String(req.params.id), "manual", getUserId(req));
});

router.get("/admin/opportunities", requireAdmin(), async (req, res) => {
  try {
    res.json({ opportunities: await getStore().listOpportunities({ includeRejected: true }) });
  } catch (err) {
    fail(req, res, err, "admin:opportunities");
  }
});

const ReviewSchema = z.object({ review_status: z.enum(["pendente", "revisado", "rejeitado"]) }).strict();

router.patch("/admin/opportunities/:id", requireAdmin(), async (req, res) => {
  const parsed = ReviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Situação de revisão inválida." });
    return;
  }
  try {
    const o = await getStore().reviewOpportunity(String(req.params.id), parsed.data.review_status, getUserId(req) as string);
    if (!o) {
      res.status(404).json({ error: "Oportunidade não encontrada." });
      return;
    }
    res.json({ opportunity: o });
  } catch (err) {
    fail(req, res, err, "admin:review");
  }
});

/** Importação institucional de vários docentes — só administração. */
router.post("/admin/profiles/import", requireAdmin(), async (req, res) => {
  const body = req.body;
  if (!Array.isArray(body) || body.length === 0 || body.length > 500) {
    res.status(400).json({ error: "Envie uma lista JSON com 1 a 500 registros." });
    return;
  }
  try {
    // ?validar=1 → só valida e informa o que aconteceria; nada é gravado
    const dryRun = req.query.validar === "1";
    const report = await importInstitutionalProfiles(body, { dryRun });
    res.json({ ...report, provisional: true, simulacao: dryRun });
  } catch (err) {
    fail(req, res, err, "admin:import");
  }
});

/**
 * Importa registro a registro. Cada item é validado isoladamente; erros não
 * derrubam os demais. A conta é associada SOMENTE pelo user_id informado pela
 * instituição (nunca por semelhança de nome). Registros repetidos no mesmo envio
 * (mesmo user_id ou mesmo lattes_id) são ignorados após o primeiro.
 */
export async function importInstitutionalProfiles(items: unknown[], opts: { dryRun?: boolean } = {}) {
  const store = getStore();
  const itemSchema = InstitutionalImportSchema.element;
  const result = { importados: 0, atualizados: 0, ignorados: 0, rejeitados: 0, registros: [] as Array<{ indice: number; situacao: string; detalhe?: string }> };
  const seenUsers = new Set<string>();
  const seenLattes = new Map<string, string>(); // lattes_id → user_id neste envio
  const existing = await store.listProfiles();
  for (const [indice, raw] of items.entries()) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      result.rejeitados++;
      const first = parsed.error.issues[0];
      result.registros.push({ indice, situacao: "rejeitado", detalhe: `${first.path.join(".") || "registro"}: ${first.message}` });
      continue;
    }
    const item = parsed.data;
    if (seenUsers.has(item.user_id)) {
      result.ignorados++;
      result.registros.push({ indice, situacao: "ignorado", detalhe: "Registro repetido neste envio." });
      continue;
    }
    const lattesOwner = seenLattes.get(item.lattes_id) ?? existing.find((p) => p.lattes_id === item.lattes_id)?.user_id;
    if (lattesOwner && lattesOwner !== item.user_id) {
      result.rejeitados++;
      result.registros.push({ indice, situacao: "rejeitado", detalhe: "Este lattes_id já está associado a outra conta." });
      continue;
    }
    seenUsers.add(item.user_id);
    seenLattes.set(item.lattes_id, item.user_id);
    const current = await store.getProfile(item.user_id);
    const input = ProfileInputSchema.parse(Object.fromEntries(Object.entries(summaryToInput(item)).filter(([, v]) => v !== undefined)));
    const next = applyProfileInput(current ?? emptyProfile(item.user_id), input, "importacao_institucional");
    if (current && next === current) {
      result.ignorados++;
      result.registros.push({ indice, situacao: "ignorado", detalhe: "Sem alterações." });
      continue;
    }
    if (!opts.dryRun) await store.saveProfile(next);
    if (current) {
      result.atualizados++;
      result.registros.push({ indice, situacao: "atualizado" });
    } else {
      result.importados++;
      result.registros.push({ indice, situacao: "importado" });
    }
  }
  return result;
}

// ── Inspeção de comparações (administração) ─────────────────────────────────

/** Lista perfis (resumo) para escolher quem comparar. */
router.get("/admin/profiles", requireAdmin(), async (req, res) => {
  try {
    const profiles = await getStore().listProfiles();
    res.json({
      profiles: profiles.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        institution: p.institution,
        unit: p.unit,
        version: p.version,
        updated_at: p.updated_at,
        terms: p.areas.length + p.research_topics.length + p.keywords.length + p.competencies.length,
      })),
    });
  } catch (err) {
    fail(req, res, err, "admin:profiles");
  }
});

const CompareSchema = z.object({ user_id: z.string().min(1).max(100), opportunity_id: z.string().uuid().optional() }).strict();

/** Calcula (sem gravar) a compatibilidade de um docente com um edital ou com todo o catálogo. */
router.post("/admin/compare", requireAdmin(), async (req, res) => {
  const parsed = CompareSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Informe user_id e, opcionalmente, opportunity_id." });
    return;
  }
  try {
    const store = getStore();
    const profile = await store.getProfile(parsed.data.user_id);
    if (!profile) {
      res.status(404).json({ error: "Perfil não encontrado." });
      return;
    }
    const list = parsed.data.opportunity_id
      ? [await store.getOpportunity(parsed.data.opportunity_id)].filter((o): o is Opportunity => Boolean(o))
      : await store.listOpportunities({ includeRejected: true });
    res.json({
      profile_version: profile.version,
      results: list.map((o) => ({
        opportunity_id: o.id,
        title: o.title,
        opportunity_version: o.version,
        review_status: o.review_status,
        result: computeRecommendation(profile, o),
      })),
    });
  } catch (err) {
    fail(req, res, err, "admin:compare");
  }
});

// ── Hermes (contrato) ────────────────────────────────────────────────────────

const HermesSchema = z.object({ source_id: z.string().min(1).max(40), request_id: z.string().max(120).optional() }).strict();

router.post("/integrations/hermes/collect", async (req, res) => {
  if (!hermesConfigured()) {
    res.status(503).json({ error: "Integração com o Hermes não configurada." });
    return;
  }
  if (!verifyHermesSecret(req.headers.authorization)) {
    res.status(401).json({ error: "Credencial do Hermes inválida." });
    return;
  }
  const parsed = HermesSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Requisição inválida." });
    return;
  }
  await triggerRun(req, res, parsed.data.source_id, "hermes", parsed.data.request_id ? `hermes:${parsed.data.request_id}` : "hermes");
});

// ── Coleta automática diária (Vercel Cron) ───────────────────────────────────

router.get("/cron/collect", async (req, res) => {
  if (!cronConfigured()) {
    res.status(503).json({ error: "Coleta agendada não configurada (CRON_SECRET ausente)." });
    return;
  }
  if (!verifyCronSecret(req.headers.authorization)) {
    res.status(401).json({ error: "Credencial do agendador inválida." });
    return;
  }
  try {
    const store = getStore();
    const now = new Date();
    const [sources, runs] = await Promise.all([store.listSources(), store.listRuns(100)]);
    const decisions = dueSources(sources, runs, now);
    const results: Array<Record<string, unknown>> = [];
    // Uma fonte por vez: respeita o intervalo entre requisições de cada site e o tempo da função
    for (const d of decisions) {
      if (d.action === "pular") {
        results.push({ ...d });
        continue;
      }
      const source = sources.find((s) => s.id === d.source_id)!;
      // Execução presa (função interrompida) não pode bloquear a fonte para sempre
      for (const stuck of runs.filter((r) => r.source_id === source.id && r.status === "running" && now.getTime() - new Date(r.started_at).getTime() >= STALE_RUN_MS)) {
        await store.finishRun(stuck.id, { status: "failed", stats: {}, errors: [{ url: source.base_url, message: "Execução interrompida (sem término registrado); encerrada pela coleta agendada." }] });
      }
      try {
        const run = await runCollection(store, source.id, {
          trigger: "agendada",
          triggeredBy: "vercel-cron",
          fetcher: fetcherFactory(source.allowed_hosts),
          documentFetcher: documentFetcherFactory(source.allowed_hosts),
        });
        results.push({ ...d, run_id: run.id, status: run.status, stats: run.stats, erros: run.errors.length });
      } catch (err) {
        if (err instanceof ConcurrentRunError) results.push({ ...d, action: "pular", motivo: "coleta em andamento" });
        else results.push({ ...d, status: "failed", erro: err instanceof Error ? err.message.slice(0, 200) : "erro" });
      }
    }
    logger.info({ cron: results.map((r) => ({ source_id: r.source_id, action: r.action, status: r.status })) }, "coleta agendada");
    res.json({ executado_em: now.toISOString(), resultados: results });
  } catch (err) {
    fail(req, res, err, "cron:collect");
  }
});

export default router;
