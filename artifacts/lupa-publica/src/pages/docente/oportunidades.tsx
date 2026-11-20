/**
 * @file docente/oportunidades.tsx
 * @description Catálogo de editais de fontes oficiais: busca, filtros (área, fonte,
 * situação, prazo), ordenação e paginação — tudo calculado no servidor.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatDateTime, SOURCE_NAMES, STATUS_LABELS, type CatalogResponse, type OpportunityStatus } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { OpportunityCard } from "@/components/lupa/opportunity";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 12;
const field =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export default function Oportunidades() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"" | OpportunityStatus>("");
  const [area, setArea] = useState("");
  const [source, setSource] = useState("");
  const [prazo, setPrazo] = useState("");
  const [sort, setSort] = useState<"recentes" | "prazo" | "titulo">("recentes");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [debounced, status, area, source, prazo, sort]);

  const params = new URLSearchParams({ sort, page: String(page), page_size: String(PAGE_SIZE) });
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  if (area) params.set("area", area);
  if (source) params.set("source", source);
  if (prazo) params.set("prazo_dias", prazo);
  const qs = params.toString();

  // qs da resposta exibida: enquanto difere do pedido atual, a lista está desatualizada
  const [shownQs, setShownQs] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(async () => {
    const r = await apiFetch<CatalogResponse>(`/opportunities?${qs}`, { auth: false });
    setShownQs(qs);
    return r;
  }, [qs]);
  const pending = Boolean(data) && shownQs !== qs;
  const filtered = Boolean(debounced || status || area || source || prazo);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const clear = () => {
    setQuery("");
    setStatus("");
    setArea("");
    setSource("");
    setPrazo("");
    setSort("recentes");
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Oportunidades"
        title="Editais de fontes oficiais"
        description="Coletados das páginas oficiais (começando pela FAPDF), com o trecho de origem de cada informação. O que não foi encontrado aparece como pendente: confira sempre o edital oficial."
      />
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
        <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" onSubmit={(e) => e.preventDefault()}>
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Buscar</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, número, objeto ou área" className={field} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-700">Área</span>
            <select value={area} onChange={(e) => setArea(e.target.value)} className={field}>
              <option value="">Todas</option>
              {(data?.facets.areas ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-700">Situação</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={field}>
              <option value="">Todas</option>
              {(Object.keys(STATUS_LABELS) as OpportunityStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-700">Prazo confirmado</span>
            <select value={prazo} onChange={(e) => setPrazo(e.target.value)} className={field}>
              <option value="">Qualquer</option>
              <option value="15">Próximos 15 dias</option>
              <option value="30">Próximos 30 dias</option>
              <option value="90">Próximos 90 dias</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-700">Fonte</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={field}>
              <option value="">Todas</option>
              {(data?.facets.sources ?? []).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_NAMES[s] ?? s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-700">Ordenar por</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={field}>
              <option value="recentes">Mais recentes</option>
              <option value="prazo">Prazo mais próximo</option>
              <option value="titulo">Título (A–Z)</option>
            </select>
          </label>
        </form>

        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.opportunities.length === 0 ? (
          <EmptyState
            title={filtered ? "Nenhum edital corresponde aos filtros" : "Catálogo vazio"}
            description={filtered ? "Tente outros termos ou limpe os filtros." : "Ainda não há editais coletados. A administração executa a coleta da FAPDF."}
            action={filtered ? <Button variant="outline" onClick={clear}>Limpar filtros</Button> : undefined}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <p aria-live="polite">
                {data.total} {data.total === 1 ? "edital" : "editais"}
                {filtered && " com os filtros aplicados"}
                {pending && " · atualizando…"}
              </p>
              {data.updated_at && <p className="text-xs">Última consulta às fontes: {formatDateTime(data.updated_at)}</p>}
            </div>
            <div className={`grid gap-4 md:grid-cols-2 ${pending ? "opacity-60" : ""}`} aria-busy={pending} data-testid="catalogo-lista">
              {data.opportunities.map((o) => (
                <OpportunityCard key={o.id} o={o} />
              ))}
            </div>
            {pages > 1 && (
              <nav className="flex items-center justify-center gap-3" aria-label="Paginação">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <span className="text-sm text-slate-600">
                  Página {page} de {pages}
                </span>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
