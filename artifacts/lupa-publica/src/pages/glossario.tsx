/**
 * @file glossario.tsx
 * @description Glossário de termos de editais e da vida acadêmica (/glossario).
 *
 * Busca tolerante a acentos, filtro por categoria e âncoras por termo
 * (/glossario#prazo), usadas pelos balões de ajuda do resto do site.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_LABELS,
  GLOSSARY,
  searchGlossary,
  type GlossaryCategory,
} from "@/lib/glossary";
import { BookOpen, GraduationCap, Lightbulb, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

type Filter = GlossaryCategory | "todas";

export default function Glossario() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Filter>("todas");
  const results = useMemo(() => searchGlossary(query, category), [query, category]);

  // Rola até o termo indicado na URL (ex.: vindo de um balão de ajuda)
  useEffect(() => {
    const slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!slug) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(slug);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary/50");
        window.setTimeout(() => el.classList.remove("ring-2", "ring-primary/50"), 2200);
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

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
                placeholder="Buscar um termo (ex.: prazo, bolsa, Lattes)"
                className="pl-9"
                aria-label="Buscar termo no glossário"
                data-testid="glossary-search"
              />
            </div>
            <Link href="/aprender">
              <Button variant="outline" className="w-full sm:w-auto">
                <GraduationCap className="mr-2 h-4 w-4" aria-hidden /> Trilha: como ler um edital
              </Button>
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
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
            Nenhum termo encontrado para “{query}”. Tente outra palavra ou{" "}
            <button type="button" className="font-semibold text-primary underline" onClick={() => { setQuery(""); setCategory("todas"); }}>
              limpe a busca
            </button>
            .
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
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-lg font-semibold text-slate-900">{t.term}</dt>
                  <Badge variant="secondary">{CATEGORY_LABELS[t.category]}</Badge>
                </div>
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
