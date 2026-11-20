/**
 * @file docente/oportunidades.tsx
 * @description Catálogo de editais de fontes oficiais: busca, filtros (área, fonte,
 * situação, prazo), ordenação e paginação — tudo calculado no servidor.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { apiFetch } from "@/lib/api";
import { formatDateTime, SOURCE_NAMES, STATUS_LABELS, type CatalogResponse, type OpportunityStatus } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, inputClass, useAsync } from "@/components/lupa/ui";
import { OpportunityCard } from "@/components/lupa/opportunity";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 12;
const field = inputClass;
const SORTS = ["recentes", "prazo", "titulo"] as const;

export default function Oportunidades() {
  // Filtros vivem na URL (podem ser compartilhados, sobrevivem a recarregar e ao "voltar")
  const [, navigate] = useLocation();
  const initial = new URLSearchParams(useSearch());
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [debounced, setDebounced] = useState(initial.get("q") ?? "");
  const [status, setStatus] = useState<"" | OpportunityStatus>((initial.get("situacao") as OpportunityStatus) ?? "");
  const [area, setArea] = useState(initial.get("area") ?? "");
  const [source, setSource] = useState(initial.get("fonte") ?? "");
  const [prazo, setPrazo] = useState(initial.get("prazo") ?? "");
  const [sort, setSort] = useState<(typeof SORTS)[number]>(
    SORTS.includes(initial.get("ordem") as (typeof SORTS)[number]) ? (initial.get("ordem") as (typeof SORTS)[number]) : "recentes",
  );
  const [page, setPage] = useState(Math.max(1, Number(initial.get("pagina")) || 1));

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPage(1);
  }, [debounced, status, area, source, prazo, sort]);

  useEffect(() => {
    const u = new URLSearchParams();
    if (debounced) u.set("q", debounced);
    if (status) u.set("situacao", status);
    if (area) u.set("area", area);
    if (source) u.set("fonte", source);
    if (prazo) u.set("prazo", prazo);
    if (sort !== "recentes") u.set("ordem", sort);
    if (page > 1) u.set("pagina", String(page));
    const next = u.toString();
    if (next !== window.location.search.replace(/^\?/, "")) navigate(`/oportunidades${next ? `?${next}` : ""}`, { replace: true });
  }, [debounced, status, area, source, prazo, sort, page, navigate]);

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
        <form role="search" aria-label="Filtrar editais" className="grid gap-3 rounded-xl border border-hairline bg-white p-4 sm:grid-cols-2 lg:grid-cols-7" onSubmit={(e) => e.preventDefault()}>
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="mb-1 block text-[0.8125rem] font-semibold text-ink">Buscar</span>
            <input type="search" name="q" autoComplete="off" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: inteligência artificial, 05/2026…" className={field} />
          </label>
          <label>
            <span className="mb-1 block text-[0.8125rem] font-semibold text-ink">Área</span>
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
            <span className="mb-1 block text-[0.8125rem] font-semibold text-ink">Situação</span>
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
            <span className="mb-1 block text-[0.8125rem] font-semibold text-ink">Prazo confirmado</span>
            <select value={prazo} onChange={(e) => setPrazo(e.target.value)} className={field}>
              <option value="">Qualquer</option>
              <option value="15">Próximos 15 dias</option>
              <option value="30">Próximos 30 dias</option>
              <option value="90">Próximos 90 dias</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[0.8125rem] font-semibold text-ink">Fonte</span>
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
            <span className="mb-1 block text-[0.8125rem] font-semibold text-ink">Ordenar por</span>
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
                <OpportunityCard key={o.id} o={o} headingLevel={2} />
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
