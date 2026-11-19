/**
 * @file verificacao.tsx
 * @description Verificação de perfil — recurso ainda não disponível.
 *
 * Antes esta página simulava o envio de um comprovante (setTimeout) e dizia
 * "Comprovante enviado! … análise em até 3 dias úteis", sem enviar nada a lugar
 * algum. A tela agora informa o estado real.
 */

import { Link } from "wouter";
import { Info } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/lupa/ui";

export default function Verificacao() {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader eyebrow="Verificação" title="Verificação de perfil" />
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="flex gap-2 text-slate-700">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            O envio de comprovantes ainda não está disponível. Seus dados de perfil continuam valendo como informação autodeclarada: eles orientam
            as recomendações, mas a comprovação de elegibilidade é feita na submissão ao edital.
          </p>
          <Link href="/perfil" className={`${buttonVariants()} mt-6`}>
            Ir para o meu perfil
          </Link>
        </div>
      </div>
    </div>
  );
}
