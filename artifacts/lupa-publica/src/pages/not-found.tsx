/**
 * @file pages/not-found.tsx
 * @description Página não encontrada — em português, com caminhos reais para continuar.
 */
import { Link } from "wouter";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-hairline bg-white p-8 text-center">
        <SearchX className="mx-auto h-10 w-10 text-lens" aria-hidden />
        <h1 className="font-display mt-4 text-2xl font-bold text-ink">Página não encontrada</h1>
        <p className="mt-2 text-ink-2">O endereço pode ter mudado ou estar digitado errado.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/" className={buttonVariants()}>
            Ir para o início
          </Link>
          <Link href="/testar" className={buttonVariants({ variant: "outline" })}>
            Analisar um edital
          </Link>
          <Link href="/oportunidades" className={buttonVariants({ variant: "outline" })}>
            Ver oportunidades
          </Link>
        </div>
      </div>
    </div>
  );
}
