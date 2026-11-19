/**
 * @file docente/recomendacoes.tsx
 * @description Recomendações explicadas: aderência temática e elegibilidade
 * separadas; editais com impedimento ficam numa seção própria, nunca escondidos
 * atrás de uma nota alta.
 */

import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { Recommendation } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { EligibilityBadge, FeedbackButtons, OpportunityCard, RecommendationExplanation, ThematicBadge } from "@/components/lupa/opportunity";

function RecItem({ r }: { r: Recommendation }) {
  return (
    <OpportunityCard o={r.opportunity} saved={r.saved}>
      <div className="flex flex-wrap gap-2">
        <ThematicBadge level={r.result.thematic.level} score={r.result.thematic.score} />
        <EligibilityBadge overall={r.result.eligibility.overall} />
      </div>
      <p className="text-sm text-slate-700">{r.result.summary}</p>
      <details className="group rounded-xl border bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          Ver explicação completa
        </summary>
        <div className="mt-3">
          <RecommendationExplanation rec={r} />
        </div>
      </details>
      <FeedbackButtons opportunityId={r.opportunity_id} initial={r.feedback} />
    </OpportunityCard>
  );
}

export default function Recomendacoes() {
  const { data, error, loading, reload } = useAsync(() => apiFetch<{ recommendations: Recommendation[] }>("/recommendations"));
  const recs = data?.recommendations ?? [];
  const ok = recs.filter((r) => r.result.eligibility.overall !== "impedimento" && r.opportunity.status !== "encerrada");
  const blocked = recs.filter((r) => r.result.eligibility.overall === "impedimento" && r.opportunity.status !== "encerrada");
  const closed = recs.filter((r) => r.opportunity.status === "encerrada");

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Minhas recomendações"
        title="Editais compatíveis com o seu perfil"
        description={
          <>
            Ordenadas por elegibilidade e depois por aderência temática. O índice de aderência mostra quanto o edital fala dos seus temas —{" "}
            <strong>não é probabilidade de aprovação</strong>.
          </>
        }
        actions={
          <Link href="/perfil" className={buttonVariants({ variant: "outline" })}>
            Ajustar perfil
          </Link>
        }
      />
      <div className="container mx-auto max-w-6xl space-y-10 px-4 py-8">
        {loading ? (
          <LoadingState label="Calculando compatibilidade…" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : recs.length === 0 ? (
          <EmptyState title="Ainda não há editais no catálogo" description="Quando a coleta da FAPDF trouxer editais, as recomendações aparecem aqui." />
        ) : (
          <>
            <section aria-labelledby="sec-ok" className="space-y-4">
              <h2 id="sec-ok" className="text-lg font-semibold text-slate-900">
                Sem impedimento identificado ou com pendências ({ok.length})
              </h2>
              {ok.length === 0 ? <p className="text-sm text-slate-600">Nenhum edital aberto nesta situação.</p> : <div className="grid gap-4 lg:grid-cols-2">{ok.map((r) => <RecItem key={r.opportunity_id} r={r} />)}</div>}
            </section>
            {blocked.length > 0 && (
              <section aria-labelledby="sec-blocked" className="space-y-4">
                <h2 id="sec-blocked" className="text-lg font-semibold text-red-900">
                  Com requisito eliminatório não atendido ({blocked.length})
                </h2>
                <p className="text-sm text-slate-600">Mesmo quando o tema combina, estes editais exigem algo que o seu perfil informa não atender.</p>
                <div className="grid gap-4 lg:grid-cols-2">{blocked.map((r) => <RecItem key={r.opportunity_id} r={r} />)}</div>
              </section>
            )}
            {closed.length > 0 && (
              <section aria-labelledby="sec-closed" className="space-y-4">
                <h2 id="sec-closed" className="text-lg font-semibold text-slate-700">
                  Encerrados ({closed.length})
                </h2>
                <div className="grid gap-4 lg:grid-cols-2">{closed.map((r) => <RecItem key={r.opportunity_id} r={r} />)}</div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
