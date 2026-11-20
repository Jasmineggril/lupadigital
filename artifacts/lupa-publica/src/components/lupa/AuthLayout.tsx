/**
 * @file components/lupa/AuthLayout.tsx
 * @description Moldura das telas de conta (cadastro, login, recuperação, redefinição).
 *
 * DESIGN.md: formulário à esquerda (até 440 px); no desktop, painel `ink` à direita
 * dizendo o que a conta permite fazer, com a marcação de evidência como assinatura.
 * No celular o painel some: só o formulário, sem distração.
 */

import type { ReactNode } from "react";
import { Check } from "lucide-react";

const POINTS = [
  "Editais da FAPDF reunidos num só lugar, com prazo e valor quando o texto oficial informa.",
  "Recomendações que explicam por que cada edital combina — e o que impede você de participar.",
  "Cada informação com o trecho do documento oficial e o link para conferir.",
];

export function AuthLayout({ eyebrow, title, description, children, footer }: { eyebrow?: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100dvh-4rem)] bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <div className="flex items-start justify-center px-4 py-10 sm:px-6 sm:py-16 lg:items-center">
        <div className="w-full max-w-[27.5rem]">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="font-display mt-2 text-[1.875rem] font-bold leading-[1.1] text-ink sm:text-[2.25rem]">{title}</h1>
          {description && <div className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">{description}</div>}
          <div className="mt-8 rounded-xl border border-hairline bg-white p-5 sm:p-7">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </div>
      <aside className="hidden flex-col justify-center bg-ink px-10 py-16 text-white lg:flex xl:px-14" aria-label="O que a conta permite">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-slate-300">Conta docente · gratuita</p>
        <p className="font-display mt-4 text-[1.75rem] font-bold leading-tight text-white">Menos tempo procurando edital. Mais tempo escrevendo a proposta.</p>
        <ul className="mt-8 space-y-4">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-3 text-[0.9375rem] leading-relaxed text-slate-200">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#7FD3DA]" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <figure className="mt-10 rounded-lg border border-white/15 bg-white/5 p-4">
          <blockquote className="text-sm leading-relaxed text-slate-100">
            “Poderão participar pesquisadores com <mark className="mark-term">título de doutor</mark> e vínculo com instituição sediada no DF.”
          </blockquote>
          <figcaption className="mt-2 font-mono text-[0.75rem] text-slate-200">Exemplo ilustrativo · é assim que a LUPA grifa um requisito</figcaption>
        </figure>
      </aside>
    </div>
  );
}

/** Foca o primeiro campo inválido do formulário (Web Interface Guidelines: foco no primeiro erro). */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  window.requestAnimationFrame(() => {
    const el = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
  });
}
