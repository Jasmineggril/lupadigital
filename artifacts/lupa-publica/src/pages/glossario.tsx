/**
 * @file glossario.tsx
 * @description Glossário de termos de editais e da vida acadêmica (/glossario).
 *
 * Busca tolerante a acentos, filtro por categoria e âncoras por termo
 * (/glossario#prazo), usadas pelos balões de ajuda do resto do site.
 *
 * Continuidade: termos FAVORITOS (logado: na conta; visitante: só neste navegador, dito na tela).
 * Consultas recentes são OPCIONAIS (desligadas por padrão): só com a opção ativa, guardam o termo
 * aberto por link e a busca confirmada com Enter — nunca cada tecla — no máximo 20, por 30 dias.
 */

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_LABELS,
  GLOSSARY,
  searchGlossary,
  type GlossaryCategory,
} from "@/lib/glossary";
import { BookOpen, GraduationCap, Lightbulb, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { saveRequest } from "@/lib/persistence";

const LOCAL_FAVS = "lupa-glossario-favoritos";
const readLocalFavs = (): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_FAVS) ?? "[]");
  } catch {
    return [];
  }
};

type Filter = GlossaryCategory | "todas";

export default function Glossario() {
  const { user, isLoading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Filter>("todas");
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [favError, setFavError] = useState<string | null>(null);
  const [recentOn, setRecentOn] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const allResults = useMemo(() => searchGlossary(query, category), [query, category]);
  const results = onlyFavs ? allResults.filter((t) => favs.has(t.slug)) : allResults;

  // Favoritos e preferência de consultas recentes: conta (logado) ou navegador (visitante)
  const loadRecents = useCallback(async () => {
    const r = await apiFetch<{ items: Array<{ key: string }> }>("/me/items?kind=glossario_recente");
    setRecents(r.items.map((i) => i.key));
  }, []);
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavs(new Set(readLocalFavs()));
      return;
    }
    Promise.all([
      apiFetch<{ items: Array<{ key: string }> }>("/me/items?kind=glossario_favorito"),
      apiFetch<{ items: Array<{ key: string; data: { ativo?: boolean } }> }>("/me/items?kind=preferencia"),
    ])
      .then(([f, p]) => {
        setFavs(new Set(f.items.map((i) => i.key)));
        const on = Boolean(p.items.find((i) => i.key === "glossario_recentes")?.data?.ativo);
        setRecentOn(on);
        if (on) void loadRecents().catch(() => undefined);
        setFavError(null);
      })
      .catch(() => setFavError("Não foi possível carregar seus favoritos agora (eles continuam salvos)."));
  }, [user?.id, authLoading, loadRecents]);

  const toggleFav = async (slug: string) => {
    const on = !favs.has(slug);
    const nextSet = new Set(favs);
    if (on) nextSet.add(slug);
    else nextSet.delete(slug);
    if (!user) {
      setFavs(nextSet);
      try {
        window.localStorage.setItem(LOCAL_FAVS, JSON.stringify([...nextSet]));
      } catch {
        /* nada */
      }
      return;
    }
    // Só marca depois da confirmação do servidor
    const r = on
      ? await saveRequest(`/me/items/glossario_favorito/${encodeURIComponent(slug)}`, { method: "PUT", body: { data: {} } })
      : await saveRequest(`/me/items/glossario_favorito/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (r.ok) {
      setFavs(nextSet);
      setFavError(null);
    } else setFavError(`Não foi possível ${on ? "favoritar" : "desfavoritar"}: ${r.error}`);
  };

  const recordRecent = useCallback(
    (key: string) => {
      if (!user || !recentOn || !key.trim()) return;
      void saveRequest(`/me/items/glossario_recente/${encodeURIComponent(key.trim().toLowerCase().slice(0, 80))}`, { method: "PUT", body: { data: {} } }).then((r) => {
        if (r.ok) void loadRecents().catch(() => undefined);
      });
    },
    [user, recentOn, loadRecents],
  );
  const setRecentPref = async (on: boolean) => {
    const r = await saveRequest("/me/items/preferencia/glossario_recentes", { method: "PUT", body: { data: { ativo: on } } });
    if (r.ok) {
      setRecentOn(on);
      if (!on) setRecents([]); // desativar apaga o que havia
    } else setFavError(r.error);
  };
  const clearRecents = async () => {
    const r = await saveRequest("/me/items?kind=glossario_recente", { method: "DELETE" });
    if (r.ok) setRecents([]);
  };

  // Rola até o termo indicado na URL (ex.: vindo de um balão de ajuda)
  useEffect(() => {
    const slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!slug) return;
    recordRecent(slug);
    const t = window.setTimeout(() => {
      const el = document.getElementById(slug);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary/50");
        window.setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2200);
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [recordRecent]);

  const categories = Object.keys(CATEGORY_LABELS) as GlossaryCategory[];

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto max-w-4xl px-4 py-10">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            <BookOpen className="h-4 w-4" aria-hidden /> Glossário
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Palavras de edital, explicadas</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Editais e documentos científicos usam palavras que quase ninguém usa no dia a dia. Aqui está o que cada
            uma significa, com exemplos e dicas práticas. São {GLOSSARY.length} termos.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") recordRecent(query);
                }}
                placeholder="Buscar um termo (ex.: prazo, bolsa, Lattes)"
                className="pl-9"
                aria-label="Buscar termo no glossário"
                data-testid="glossary-search"
              />
            </div>
            <Link href="/aprender" className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}>
                <GraduationCap className="mr-2 h-4 w-4" aria-hidden /> Trilha: como ler um edital
              </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
            {(["todas", ...categories] as Filter[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-700 hover:border-primary/50"
                }`}
              >
                {c === "todas" ? "Todas" : CATEGORY_LABELS[c]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOnlyFavs((v) => !v)}
              aria-pressed={onlyFavs}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${onlyFavs ? "border-amber-500 bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}
              data-testid="glossary-favs-filter"
            >
              <Star className="h-3 w-3" aria-hidden /> Meus favoritos ({favs.size})
            </button>
          </div>
          <div className="mt-3 space-y-2 text-xs text-slate-600" data-testid="glossary-continuidade">
            <p>{user ? "Seus termos favoritos ficam salvos na sua conta." : "Sem login: os favoritos ficam só neste navegador."}</p>
            {favError && <p role="alert" className="text-red-800">{favError}</p>}
            {user && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={recentOn} onChange={(e) => void setRecentPref(e.target.checked)} data-testid="glossary-recentes-toggle" />
                Guardar minhas consultas recentes (opcional: últimos 20 termos, por 30 dias; desligar apaga)
              </label>
            )}
            {user && recentOn && recents.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" data-testid="glossary-recentes">
                <span className="font-semibold">Consultas recentes:</span>
                {recents.map((r) => (
                  <button key={r} type="button" className="rounded-full border bg-white px-2 py-0.5" onClick={() => setQuery(r)}>
                    {r}
                  </button>
                ))}
                <button type="button" className="font-semibold underline" onClick={() => void clearRecents()}>
                  Limpar
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
            {onlyFavs && favs.size === 0 ? (
              "Você ainda não favoritou nenhum termo. Toque na estrela ao lado de um termo."
            ) : (
              <>
                Nenhum termo encontrado{query ? ` para “${query}”` : ""}. Tente outra palavra ou{" "}
                <button type="button" className="font-semibold text-primary underline" onClick={() => { setQuery(""); setCategory("todas"); setOnlyFavs(false); }}>
                  limpe a busca
                </button>
                .
              </>
            )}
          </div>
        ) : (
          <dl className="grid gap-4">
            {results.map((t) => (
              <div
                key={t.slug}
                id={t.slug}
                className="scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm transition-shadow"
                data-testid={`glossary-entry-${t.slug}`}
              >
                {/* dt e dd filhos diretos do div (HTML válido para listas de definição) */}
                <dt className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-slate-900">{t.term}</span>
                  <Badge variant="secondary">{CATEGORY_LABELS[t.category]}</Badge>
                  <button
                    type="button"
                    onClick={() => void toggleFav(t.slug)}
                    aria-pressed={favs.has(t.slug)}
                    aria-label={favs.has(t.slug) ? `Remover ${t.term} dos favoritos` : `Favoritar ${t.term}`}
                    className="ml-auto rounded p-1"
                    data-testid={`glossary-fav-${t.slug}`}
                  >
                    <Star className={`h-4 w-4 ${favs.has(t.slug) ? "fill-amber-400 text-amber-500" : "text-slate-400"}`} aria-hidden />
                  </button>
                </dt>
                <dd className="mt-2 space-y-3 text-slate-700">
                  <p className="font-medium text-slate-800">{t.short}</p>
                  <p className="leading-relaxed">{t.long}</p>
                  {t.example && (
                    <p className="rounded-lg border-l-4 border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                      <span className="font-semibold">Exemplo: </span>
                      {t.example}
                    </p>
                  )}
                  {t.tip && (
                    <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>
                        <span className="font-semibold">Dica: </span>
                        {t.tip}
                      </span>
                    </p>
                  )}
                  {t.aliases && t.aliases.length > 0 && (
                    <p className="text-xs text-slate-500">Também aparece como: {t.aliases.join(", ")}</p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
