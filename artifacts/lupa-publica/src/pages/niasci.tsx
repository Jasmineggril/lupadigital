/**
 * @file pages/niasci.tsx
 * @description Hub das ferramentas NIASci. Antes repetia a mesma lista três vezes (diálogo
 * "Explorar módulos", grade e destaques), com cores próprias por módulo. Agora usa o catálogo
 * único (@workspace/feature-catalog): para que serve, o que fornecer, o que recebe e se pede conta.
 */
import { Link } from "wouter";
import { ArrowRight, BookOpen, FileText, Globe, Layers, Lock, MessageSquare, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { featureById, type Feature } from "@workspace/feature-catalog";
import { useAuth } from "@/lib/auth";
import { loginUrlFor } from "@/lib/safe-redirect";
import { PageHeader } from "@/components/lupa/ui";

const MODULES: Array<{ id: string; icon: LucideIcon }> = [
  { id: "analisar", icon: FileText },
  { id: "elattes", icon: User },
  { id: "artigos", icon: BookOpen },
  { id: "projetos", icon: Layers },
  { id: "planetario", icon: Globe },
  { id: "assistente", icon: MessageSquare },
];

export default function NiasciHub() {
  const { user } = useAuth();
  const items = MODULES.map((m) => ({ ...m, f: featureById(m.id) as Feature })).filter((m) => m.f);
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="NIASci"
        title="Ferramentas de pesquisa e divulgação"
        description="Apoio para ler editais, currículos e artigos, estruturar projetos e preparar conteúdo de divulgação científica. A IA ajuda a organizar; confira sempre a fonte."
      />
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="niasci-modulos">
          {items.map(({ id, icon: Icon, f }) => {
            const needsLogin = f.acesso !== "publico" && !user;
            return (
              <li key={id}>
                <Link
                  href={needsLogin ? loginUrlFor(f.rota) : f.rota}
                  className="group flex h-full flex-col rounded-xl border border-hairline bg-white p-5 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lens"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-lens-tint text-lens">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </span>
                  <span className="font-display mt-3 text-lg font-bold text-ink">{f.titulo}</span>
                  <span className="mt-1 text-[0.9375rem] text-ink-2">{f.serve}</span>
                  <span className="mt-3 grid gap-1 text-sm text-slate-700">
                    <span>
                      <strong className="font-semibold text-ink">Você fornece:</strong> {f.entrada}
                    </span>
                    <span>
                      <strong className="font-semibold text-ink">Você recebe:</strong> {f.resultado}
                    </span>
                  </span>
                  {needsLogin && (
                    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs text-slate-600">
                      <Lock className="h-3 w-3" aria-hidden /> pede conta
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
