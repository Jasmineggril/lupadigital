/**
 * Moldura das páginas de conteúdo (Sobre, Tecnologias, Impacto, FAQ…):
 * cabeçalho padrão + coluna de leitura confortável + seções em cartões planos.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/lupa/ui";

export function ContentPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-10">{children}</div>
    </div>
  );
}

export function ContentSection({ title, id, children, tone = "white" }: { title: string; id: string; children: ReactNode; tone?: "white" | "tint" }) {
  return (
    <section aria-labelledby={id} className={`rounded-xl border p-5 sm:p-7 ${tone === "tint" ? "border-lens/20 bg-lens-tint" : "border-hairline bg-white"}`}>
      <h2 id={id} className="font-display text-xl font-bold text-ink sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

/** Lista de itens com título curto e explicação (substitui grades de cartões genéricos). */
export function TermList({ items }: { items: Array<{ t: string; d: ReactNode }> }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.t} className="border-l-2 border-lens/40 pl-4">
          <dt className="font-semibold text-ink">{i.t}</dt>
          <dd className="mt-0.5 text-ink-2">{i.d}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Fecho com próximos passos reais. */
export function NextActions({ title = "Por onde começar", children }: { title?: string; children?: ReactNode }) {
  return (
    <section aria-labelledby="proximos" className="rounded-xl border border-hairline bg-white p-5 sm:p-7">
      <h2 id="proximos" className="font-display text-xl font-bold text-ink">
        {title}
      </h2>
      {children}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/testar" className={buttonVariants()}>
          Analisar um edital
        </Link>
        <Link href="/oportunidades" className={buttonVariants({ variant: "outline" })}>
          Ver oportunidades
        </Link>
        <Link href="/aprender" className={buttonVariants({ variant: "outline" })}>
          Aprender a ler um edital
        </Link>
      </div>
    </section>
  );
}
