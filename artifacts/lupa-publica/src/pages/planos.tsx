/**
 * @file planos.tsx
 * @description Acesso ao LUPA Digital.
 *
 * Antes esta página exibia planos pagos (ex.: "R$ 9,90/mês") e botões de
 * assinatura sem nenhum sistema de pagamento por trás. Como projeto acadêmico do
 * NIASci/UnDF, o acesso é gratuito; não há planos pagos.
 */

import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/lupa/ui";

const INCLUDED = [
  "Cadastro e perfil docente",
  "Catálogo de editais de fontes oficiais (começando pela FAPDF)",
  "Recomendações explicadas, com elegibilidade separada da aderência temática",
  "Editais salvos",
  "Análise de editais com IA, com limite de uso para quem não está logado",
];

export default function Planos() {
  const { user } = useAuth();
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader eyebrow="Acesso" title="O LUPA Digital é gratuito" description="Projeto acadêmico do NIASci/UnDF. Não há planos pagos nem cobrança." />
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">O que está disponível</h2>
          <ul className="mt-3 space-y-2">
            {INCLUDED.map((i) => (
              <li key={i} className="flex gap-2 text-slate-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> {i}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {user ? (
              <Link href="/inicio" className={buttonVariants()}>
                Ir para o início
              </Link>
            ) : (
              <Link href="/cadastro" className={buttonVariants()}>
                Criar conta gratuita
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
