/**
 * @file LearnBox.tsx
 * @description Caixa "O que isso significa?" exibida em cada seção do resultado.
 *
 * Explica a seção, por que ela importa, o que conferir no documento original e
 * os termos do glossário relacionados. Começa fechada para não atrapalhar quem
 * já conhece o assunto; a escolha fica salva no navegador.
 */

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LEARN_SECTIONS, type LearnSectionId } from "@/lib/learn-content";
import { ChevronDown, GraduationCap, SearchCheck } from "lucide-react";
import { useState } from "react";
import { Term } from "./Term";

const STORAGE_KEY = "lupa-learnbox-open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    // navegação privada ou armazenamento bloqueado: só não lembra a escolha
  }
}

export function LearnBox({ section }: { section: LearnSectionId }) {
  const content = LEARN_SECTIONS[section];
  const [open, setOpen] = useState<boolean>(() => readOpen());

  return (
    <Collapsible
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        writeOpen(v);
      }}
      className="mb-4 rounded-2xl border border-sky-200 bg-sky-50/70"
      data-testid={`learnbox-${section}`}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-sky-900">
          <GraduationCap className="h-4 w-4" aria-hidden />
          O que isso significa? · {content.title}
        </span>
        <ChevronDown className={`h-4 w-4 text-sky-800 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-4 pb-4 text-sm text-slate-700">
        <p className="leading-relaxed">{content.what}</p>
        <p className="leading-relaxed">
          <span className="font-semibold text-slate-900">Por que importa: </span>
          {content.why}
        </p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
            <SearchCheck className="h-3.5 w-3.5" aria-hidden />
            Confira no documento original
          </p>
          <ul className="list-disc space-y-1 pl-5 text-amber-950">
            {content.checkOriginal.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-600">
          <span className="font-semibold">Termos para aprender: </span>
          {content.terms.map((slug, i) => (
            <span key={slug}>
              {i > 0 && " · "}
              <Term slug={slug} />
            </span>
          ))}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
