/**
 * @file Term.tsx
 * @description Termo do glossário com balão de explicação.
 *
 * Abre com clique ou toque (funciona no celular) e também com o teclado.
 * Mostra a explicação curta e um link para o verbete completo em /glossario.
 */

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTerm } from "@/lib/glossary";
import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

interface TermProps {
  slug: string;
  /** Texto exibido; por padrão, o nome do termo. */
  children?: ReactNode;
}

export function Term({ slug, children }: TermProps) {
  const entry = getTerm(slug);
  if (!entry) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline cursor-help rounded-sm border-b border-dotted border-primary/70 text-inherit underline-offset-2 hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={`O que é ${entry.term}?`}
          data-testid={`term-${slug}`}
        >
          {children ?? entry.term}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="start">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-primary" aria-hidden />
          {entry.term}
        </p>
        <p className="mt-2 text-muted-foreground leading-relaxed">{entry.short}</p>
        {entry.tip && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <span className="font-semibold">Dica: </span>
            {entry.tip}
          </p>
        )}
        <Link
          href={`/glossario#${entry.slug}`}
          className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
        >
          Ver explicação completa no glossário →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
