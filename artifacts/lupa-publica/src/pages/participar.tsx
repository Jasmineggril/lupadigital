/**
 * @file pages/participar.tsx
 * @description "Minhas participações": editais em que a pessoa decidiu trabalhar.
 */
import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { KIND_LABEL, STATUS_LABEL, type Participation } from "@/lib/participacao";

export default function Participacoes() {
  const { data, error, loading, reload } = useAsync(() => apiFetch<{ participations: Participation[] }>("/participations"));
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Quero participar"
        title="Minhas participações"
        description="Um espaço por edital para organizar documentos, prazos, proposta e situação. A inscrição continua sendo feita no canal oficial de cada edital."
      />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.participations.length === 0 ? (
          <EmptyState
            title="Você ainda não organizou nenhuma participação"
            description="Abra um edital no catálogo ou analise um edital e use “Quero participar”."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/oportunidades" className={buttonVariants()}>
                  Ver oportunidades
                </Link>
                <Link href="/testar" className={buttonVariants({ variant: "outline" })}>
                  Analisar um edital
                </Link>
              </div>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" data-testid="lista-participacoes">
            {data.participations.map((p) => {
              const done = p.checklist.filter((c) => c.feito).length;
              return (
                <li key={p.id}>
                  <Link href={`/participar/${p.id}`} className="block h-full rounded-xl border border-hairline bg-white p-4 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lens">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {KIND_LABEL[p.tipo]} · {STATUS_LABEL[p.situacao]}
                    </p>
                    <h2 className="mt-1 font-semibold text-ink">{p.titulo}</h2>
                    <p className="mt-2 text-sm text-slate-600">
                      Documentos: {done} de {p.checklist.length} prontos · atualizado em {new Date(p.updated_at).toLocaleDateString("pt-BR")}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
