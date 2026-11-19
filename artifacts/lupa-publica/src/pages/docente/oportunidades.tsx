/**
 * @file docente/oportunidades.tsx
 * @description Catálogo de editais coletados de fontes oficiais, com busca e filtro.
 */

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Opportunity } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { OpportunityCard } from "@/components/lupa/opportunity";

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Oportunidades() {
  const { data, error, loading, reload } = useAsync(() => apiFetch<{ opportunities: Opportunity[] }>("/opportunities", { auth: false }));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"todas" | Opportunity["status"]>("todas");

  const list = useMemo(() => {
    const q = norm(query.trim());
    return (data?.opportunities ?? []).filter(
      (o) => (status === "todas" || o.status === status) && (!q || norm(`${o.title} ${o.fields.objeto?.value ?? ""} ${(o.fields.areas?.value ?? []).join(" ")}`).includes(q)),
    );
  }, [data, query, status]);

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Oportunidades"
        title="Editais de fontes oficiais"
        description="Coletados diretamente das páginas oficiais (começando pela FAPDF), com o trecho de origem de cada informação. Informações não encontradas aparecem como pendentes."
      />
      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Buscar edital</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, objeto ou área"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Filtrar por situação</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <option value="todas">Todas as situações</option>
              <option value="aberta">Abertas</option>
              <option value="desconhecida">Situação não confirmada</option>
              <option value="encerrada">Encerradas</option>
            </select>
          </label>
        </div>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState
            title={data!.opportunities.length === 0 ? "Catálogo vazio" : "Nenhum edital corresponde à busca"}
            description={data!.opportunities.length === 0 ? "Ainda não há editais coletados. A administração executa a coleta da FAPDF." : "Tente outros termos ou limpe o filtro."}
          />
        ) : (
          <>
            <p className="text-sm text-slate-600" aria-live="polite">
              {list.length} {list.length === 1 ? "edital" : "editais"}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((o) => (
                <OpportunityCard key={o.id} o={o} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
