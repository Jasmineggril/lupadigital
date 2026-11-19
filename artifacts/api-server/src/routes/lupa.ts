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
import { getUserId, isAdminClaims, getClaims, requireAdmin } from "../lib/lupa/roles";
import {
  emptyProfile,
  ProfileInputSchema,
  SourceUpdateSchema,
  type FieldSource,
  type Opportunity,
  type ProfileInput,
  type Recommendation,
  type TeacherProfile,
} from "../lib/lupa/types";
import { computeRecommendation } from "../lib/lupa/matching";
import { createSafeFetcher, runCollection, type PageFetcher } from "../lib/lupa/collector/crawler";
import { InstitutionalImportSchema, LattesSummarySchema, getLattesProvider, type LattesSummary } from "../lib/lupa/integrations/lattes";
import { HERMES_STATUS, hermesConfigured, verifyHermesSecret } from "../lib/lupa/integrations/hermes";

const router = Router();

function fail(req: Request, res: Response, err: unknown, context: string) {
  req.log?.error({ context, error: err instanceof Error ? err.message : String(err) }, "lupa:error");
  res.status(503).json({ error: "Serviço de dados indisponível no momento. Tente novamente." });
}

/** Permite trocar o fetcher da coleta em testes (sem rede). */
let fetcherFactory: (allowedHosts: string[]) => PageFetcher = createSafeFetcher;
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

/** Importação PROVISÓRIA do resumo Lattes em JSON — só para o próprio perfil. */
router.post("/profile/lattes-import", requireAuth(), async (req, res) => {
  const userId = getUserId(req) as string;
  const parsed = LattesSummarySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "JSON do resumo Lattes inválido.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const store = getStore();
    const current = (await store.getProfile(userId)) ?? emptyProfile(userId);
    const input = ProfileInputSchema.parse(Object.fromEntries(Object.entries(summaryToInput(parsed.data)).filter(([, v]) => v !== undefined)));
    const next = applyProfileInput(current, input, "importacao_json_provisoria");
    const saved = next === current ? current : await store.saveProfile(next);
    res.json({ profile: saved, provisional: true, lattes_updated_at: parsed.data.atualizado_em });
  } catch (err) {
    fail(req, res, err, "profile:lattes-import");
  }
});

// ── Catálogo ─────────────────────────────────────────────────────────────────

function publicOpportunity(o: Opportunity) {
  const { reviewed_by: _r, ...rest } = o;
  return rest;
}

router.get("/opportunities", async (req, res) => {
  try {
    const list = await getStore().listOpportunities();
    res.json({ opportunities: list.map(publicOpportunity) });
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
  const [opportunities, existing, feedback, saved] = await Promise.all([
    store.listOpportunities(),
    store.getRecommendations(userId),
    store.getFeedback(userId),
    store.listSaved(userId),
  ]);
  const byOpp = new Map(existing.map((r) => [r.opportunity_id, r]));
  const out: Array<Recommendation & { opportunity: ReturnType<typeof publicOpportunity>; feedback: { relevant: boolean } | null; saved: boolean; recomputed: boolean }> = [];
  for (const o of opportunities) {
    let rec = byOpp.get(o.id);
    let recomputed = false;
    if (!rec || rec.opportunity_version !== o.version || rec.profile_version !== profile.version) {
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
    out.push({ ...rec, opportunity: publicOpportunity(o), feedback: fb ? { relevant: fb.relevant } : null, saved: saved.includes(o.id), recomputed });
  }
  out.sort(
    (a, b) =>
      OVERALL_ORDER[a.result.eligibility.overall] - OVERALL_ORDER[b.result.eligibility.overall] ||
      b.result.thematic.score - a.result.thematic.score,
  );
  return { profile, recommendations: out };
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
    const ids = await store.listSaved(getUserId(req) as string);
    const items = (await Promise.all(ids.map((id) => store.getOpportunity(id)))).filter((o): o is Opportunity => Boolean(o));
    res.json({ opportunities: items.map(publicOpportunity) });
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
    elattes: { configured: getLattesProvider().configured, fallback: "importação JSON provisória" },
  });
});

router.get("/admin/sources", requireAdmin(), async (req, res) => {
  try {
    res.json({ sources: await getStore().listSources() });
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
    const run = await runCollection(store, sourceId, { trigger, triggeredBy, fetcher: fetcherFactory(source.allowed_hosts) });
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
  const parsed = InstitutionalImportSchema.safeParse(req.body ?? []);
  if (!parsed.success) {
    res.status(400).json({ error: "Arquivo de importação inválido.", details: parsed.error.issues.slice(0, 10) });
    return;
  }
  try {
    const store = getStore();
    let created = 0;
    let updated = 0;
    for (const item of parsed.data) {
      const current = await store.getProfile(item.user_id);
      const input = ProfileInputSchema.parse(Object.fromEntries(Object.entries(summaryToInput(item)).filter(([, v]) => v !== undefined)));
      const next = applyProfileInput(current ?? emptyProfile(item.user_id), input, "importacao_institucional");
      if (next !== current) await store.saveProfile(next);
      if (current) updated++;
      else created++;
    }
    res.json({ created, updated, provisional: true });
  } catch (err) {
    fail(req, res, err, "admin:import");
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

export default router;
