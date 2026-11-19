/**
 * @file docente/salvos.tsx
 * @description Editais salvos pelo usuário.
 */

import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { Opportunity } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { OpportunityCard } from "@/components/lupa/opportunity";

export default function Salvos() {
  const { data, error, loading, reload } = useAsync(() => apiFetch<{ opportunities: Opportunity[] }>("/saved-opportunities"));
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader eyebrow="Editais salvos" title="Seus editais salvos" description="Guarde editais para acompanhar prazos e documentos." />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data!.opportunities.length === 0 ? (
          <EmptyState
            title="Nenhum edital salvo"
            description="Use o botão “Salvar” nas recomendações ou nos detalhes de um edital."
            action={
              <Link href="/recomendacoes" className={buttonVariants()}>
                Ver recomendações
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data!.opportunities.map((o) => (
              <OpportunityCard key={o.id} o={o} saved />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
