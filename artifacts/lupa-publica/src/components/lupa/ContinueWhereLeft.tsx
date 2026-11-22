/**
 * @file components/lupa/ContinueWhereLeft.tsx
 * @description "Continue de onde parou": os 3 trabalhos mais recentes da conta (GET /me/history),
 * com link direto para retomar. Não aparece para visitantes nem quando não há nada salvo.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

type Item = { ferramenta: string; id: string; titulo: string; situacao: string; atualizado_em: string; link: string };
const NOMES: Record<string, string> = {
  editais: "Análise de edital",
  analise_longa: "Documento longo",
  elattes: "e-Lattes",
  artigos: "Artigo",
  projetos: "Projeto",
  planetario: "Planetário",
  assistente: "Conversa",
  participacoes: "Participação",
};

export function ContinueWhereLeft({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    apiFetch<{ itens: Item[] }>("/me/history?por_pagina=3&ordem=atualizacao")
      .then((r) => vivo && setItens(r.itens))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user || (!erro && (!itens || itens.length === 0))) return null;
  return (
    <section aria-labelledby="continue-titulo" className={`rounded-xl border border-hairline bg-white p-4 ${className}`} data-testid="continue-de-onde-parou">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="continue-titulo" className="font-semibold text-ink">
          Continue de onde parou
        </h2>
        <Link href="/historico" className="text-sm font-semibold text-lens underline underline-offset-2">
          Ver todo o meu histórico
        </Link>
      </div>
      {erro ? (
        <p className="mt-2 text-sm text-ink-2">Não foi possível carregar seus trabalhos agora. Eles continuam salvos — abra “Meu histórico” para tentar de novo.</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {itens!.map((i) => (
            <li key={`${i.ferramenta}:${i.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium text-ink">{i.titulo}</span>
                <span className="text-xs text-ink-2">
                  {NOMES[i.ferramenta] ?? i.ferramenta} · {new Date(i.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <Link href={i.link} className="text-sm font-semibold text-lens underline underline-offset-2">
                Continuar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
