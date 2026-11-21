/**
 * @file docente/oportunidade.tsx
 * @description Edital estruturado: campos com evidência, documentos (edital, anexos,
 * retificações), eventos separados da situação e, para usuários logados, a
 * recomendação explicada.
 */

import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ExternalLink, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { QueroParticipar } from "@/components/lupa/QueroParticipar";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FIELD_LABELS, formatDate, formatDateTime, type Opportunity, type Recommendation } from "@/lib/lupa-types";
import { EmptyState, ErrorState, Evidence, LoadingState, useAsync } from "@/components/lupa/ui";
import { EligibilityBadge, FeedbackButtons, InterestButton, RecommendationExplanation, SaveButton, StatusBadge, ThematicBadge } from "@/components/lupa/opportunity";

const FIELD_ORDER = [
  "objeto",
  "areas",
  "elegibilidade",
  "requisitos",
  "restricoes",
  "valores",
  "contrapartidas",
  "parcerias",
  "documentos",
  "datas",
  "criterios_avaliacao",
  "canal_inscricao",
] as const;
/** Campos que muitos editais simplesmente não têm: a ausência não é falha. */
const OPTIONAL = new Set(["contrapartidas", "parcerias", "restricoes"]);

const DOC_LABEL = { edital: "Edital", anexo: "Anexo", retificacao: "Retificação", resultado: "Resultado", outro: "Documento" } as const;
const EVENT_LABEL = { retificacao: "Retificação", prorrogacao: "Prorrogação", resultado: "Resultado" } as const;


export default function OportunidadeDetalhe() {
  const [, params] = useRoute("/oportunidades/:id");
  const id = params?.id ?? "";
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const { opportunity } = await apiFetch<{ opportunity: Opportunity }>(`/opportunities/${id}`, { auth: false });
    let rec: Recommendation | null = null;
    if (user) {
      const recs = await apiFetch<{ recommendations: Recommendation[] }>("/recommendations");
      rec = recs.recommendations.find((r) => r.opportunity_id === id) ?? null;
    }
    return { o: opportunity, rec };
  }, [id, user?.id]);

  // Abrir o edital salvo marca a versão atual como vista (some o aviso "alterado")
  useEffect(() => {
    if (user && data?.rec?.saved) void apiFetch(`/saved-opportunities/${id}/seen`, { method: "POST" }).catch(() => undefined);
  }, [user, data?.rec?.saved, id]);

  if (loading) return <LoadingState />;
  if (error)
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        {error.includes("não encontrada") ? (
          <EmptyState title="Oportunidade não encontrada" description="Ela pode ter sido removida na revisão." action={<Link href="/oportunidades" className={buttonVariants()}>Ver catálogo</Link>} />
        ) : (
          <ErrorState message={error} onRetry={reload} />
        )}
      </div>
    );
  const { o, rec } = data!;
  const f = o.fields;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="border-b border-hairline bg-white">
        <div className="container mx-auto max-w-6xl px-4 py-7 sm:px-6 md:py-9 lg:px-8">
          <Link href="/oportunidades" className="text-sm font-semibold text-lens underline-offset-2 hover:underline">
            ← Oportunidades
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="font-mono text-[0.75rem] font-medium uppercase tracking-[0.06em] text-slate-600">
              {o.edital_number && !o.title.includes(o.edital_number) ? `Edital nº ${o.edital_number} · ` : ""}<span translate="no">{o.source_id.toUpperCase()}</span>
            </p>
            <StatusBadge status={o.status} />
          </div>
          <h1 className="font-display mt-2 max-w-4xl text-[1.75rem] font-bold leading-[1.15] text-ink md:text-4xl">{o.title}</h1>
          <p className="mt-3 text-sm text-slate-600">
            Última consulta à página oficial: {formatDateTime(o.last_seen_at)} ·{" "}
            {o.review_status === "revisado" ? "revisado pela administração" : "aguardando revisão humana"}
          </p>
          <p className="mt-1 font-mono text-[0.75rem] text-slate-600 tabular">
            Histórico: encontrado em {formatDateTime(o.first_seen_at)} · conteúdo capturado em {formatDateTime(o.captured_at)} · versão {o.version}
            {o.version > 1 ? ` (a página oficial mudou ${o.version - 1} ${o.version - 1 === 1 ? "vez" : "vezes"} desde a primeira captura)` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={o.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
              Abrir página oficial <ExternalLink className="ml-1.5 h-4 w-4" aria-hidden />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
            {user && rec && <SaveButton opportunityId={o.id} initial={rec.saved} />}
            {user && rec && <InterestButton opportunityId={o.id} initial={Boolean(rec.interested)} />}
            <QueroParticipar opportunityId={o.id} />
          </div>
        </div>
      </header>

      <div className="container mx-auto grid max-w-6xl items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:px-8">
        <div className="space-y-6">
          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="estruturado">
            <h2 id="estruturado" className="text-lg font-semibold text-slate-900">
              Edital estruturado
            </h2>
            <p className="mt-1 text-xs text-slate-500">Extraído automaticamente do texto oficial. O documento oficial prevalece.</p>
            <dl className="mt-4 divide-y divide-hairline [&>div]:py-4 first:[&>div]:pt-0">
              {FIELD_ORDER.map((key) => {
                const value = f[key];
                if (!value && OPTIONAL.has(key)) return null;
                return (
                  <div key={key}>
                    <dt className="eyebrow text-slate-600">{FIELD_LABELS[key]}</dt>
                    <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink">
                      {!value ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-800">Não encontrado — confira no documento oficial.</span>
                      ) : key === "objeto" ? (
                        <>
                          {(value as { value: string }).value}
                          <Evidence text={(value as { evidence: string }).evidence} url={(value as { source_url: string }).source_url} />
                        </>
                      ) : key === "areas" ? (
                        <>
                          {(f.areas!.value).join(" · ")}
                          <Evidence text={f.areas!.evidence} url={f.areas!.source_url} />
                        </>
                      ) : key === "datas" ? (
                        <ul className="space-y-2">
                          {f.datas!.map((d) => (
                            <li key={d.evidence}>
                              <span className="font-mono font-medium tabular">{d.iso ? formatDate(d.iso) : "data"}</span> <span className="text-slate-600">· {d.label}</span>
                              <Evidence text={d.evidence} url={d.source_url} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="list-disc space-y-1 pl-5">
                          {(value as Array<{ value: string; evidence: string; source_url: string }>).map((v) => (
                            <li key={v.evidence}>{v.value}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="documentos">
            <h2 id="documentos" className="text-lg font-semibold text-slate-900">
              Documentos oficiais
            </h2>
            {o.documents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Nenhum documento vinculado nesta página.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {o.documents.map((d) => (
                  <li key={d.url} className="flex items-start gap-2 text-sm">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <span>
                      <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{DOC_LABEL[d.kind]}</span>
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        {d.title}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {o.events.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-slate-900">Eventos do edital</h3>
                <p className="text-xs text-slate-500">Retificações, prorrogações e resultados — separados da situação da oportunidade.</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {o.events.map((e) => (
                    <li key={`${e.kind}-${e.title}`}>
                      <span className="font-semibold">{EVENT_LABEL[e.kind]}:</span>{" "}
                      {e.url ? (
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          {e.title}
                        </a>
                      ) : (
                        e.title
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="compat">
            <h2 id="compat" className="text-lg font-semibold text-ink">
              Compatibilidade com você
            </h2>
            {!user ? (
              <p className="mt-2 text-sm text-slate-600">
                <Link href={`/login?next=${encodeURIComponent(`/oportunidades/${o.id}`)}`} className="font-semibold text-primary underline">
                  Entre
                </Link>{" "}
                para ver a compatibilidade com o seu perfil.
              </p>
            ) : !rec ? (
              <p className="mt-2 text-sm text-slate-600">Recomendação indisponível para este edital.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <ThematicBadge level={rec.result.thematic.level} score={rec.result.thematic.score} />
                  <EligibilityBadge overall={rec.result.eligibility.overall} />
                </div>
                <RecommendationExplanation rec={rec} />
                <FeedbackButtons opportunityId={o.id} initial={rec.feedback} />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
