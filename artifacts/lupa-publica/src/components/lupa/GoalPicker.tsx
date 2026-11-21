/**
 * "O que você quer fazer?" — entrada por objetivo. Cada opção leva a uma página
 * REAL do catálogo único (@workspace/feature-catalog) e diz o que você vai receber.
 * Páginas que pedem conta mostram isso antes do clique.
 */
import { Link } from "wouter";
import { ArrowRight, Lock } from "lucide-react";
import { FEATURES, GOALS, featureById } from "@workspace/feature-catalog";
import { useAuth } from "@/lib/auth";
import { loginUrlFor } from "@/lib/safe-redirect";

export function GoalPicker({ headingId = "objetivo", current }: { headingId?: string; current?: string | null }) {
  const { user } = useAuth();
  const goals = current ? [...GOALS].sort((a, b) => Number(b.id === current) - Number(a.id === current)) : GOALS;
  return (
    <section aria-labelledby={headingId} data-testid="goal-picker">
      <h2 id={headingId} className="font-display text-2xl font-bold text-ink md:text-[1.75rem]">
        O que você quer fazer?
      </h2>
      <p className="mt-1 text-sm text-slate-600">Escolha um objetivo. Indicamos por onde começar e o que você vai receber.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {goals.map((g) => {
          const f = featureById(g.feature) ?? FEATURES[0];
          const needsLogin = f.acesso !== "publico" && !user;
          const href = needsLogin ? loginUrlFor(f.rota) : f.rota;
          return (
            <li key={g.id}>
              <Link
                href={href}
                className={`flex h-full flex-col rounded-xl border bg-white p-4 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lens ${g.id === current ? "border-lens" : "border-hairline"}`}
                data-testid={`objetivo-${g.id}`}
              >
                <span className="flex items-center justify-between gap-2 font-semibold text-ink">
                  {g.rotulo}
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </span>
                <span className="mt-1 text-sm text-slate-700">{g.explicacao}</span>
                <span className="mt-auto pt-3 text-xs text-slate-600">
                  Vai para: {f.titulo}
                  {needsLogin && (
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      · <Lock className="h-3 w-3" aria-hidden /> pede conta
                    </span>
                  )}
                  {g.id === current && <span className="ml-1 font-semibold text-lens">· seu objetivo atual</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
