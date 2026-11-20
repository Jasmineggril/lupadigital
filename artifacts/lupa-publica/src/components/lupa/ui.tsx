/**
 * @file components/lupa/ui.tsx
 * @description Peças de interface acessíveis e consistentes do fluxo docente:
 * campos com rótulo e erro associados, senha com mostrar/ocultar, estados de
 * carregamento/vazio/erro com nova tentativa e cabeçalho de página.
 */

import { AlertCircle, Eye, EyeOff, Inbox, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="border-b border-hairline bg-white">
      <div className="container mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 sm:px-6 md:flex-row md:items-end md:justify-between md:py-9 lg:px-8">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="font-display mt-2 text-[1.75rem] font-bold leading-[1.1] text-ink md:text-4xl">{title}</h1>
          {description && <div className="mt-3 max-w-[68ch] text-[0.9375rem] leading-relaxed text-ink-2">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Assinatura da LUPA: trecho oficial grifado, com a fonte em mono (DESIGN.md §4). */
export function Evidence({ text, url, label = "Trecho do edital", max = 260 }: { text: string; url?: string | null; label?: string; max?: number }) {
  const short = text.length > max ? `${text.slice(0, max)}…` : text;
  let host = "";
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  return (
    <figure className="evidence mt-1.5 text-[0.8125rem] leading-relaxed">
      <blockquote>
        <span className="sr-only">{label}: </span>“{short}”
      </blockquote>
      {url && (
        <figcaption className="evidence-source mt-1">
          Fonte ·{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-lens underline underline-offset-2">
            {host || "documento oficial"}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </figcaption>
      )}
    </figure>
  );
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-lens motion-reduce:animate-none" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Inbox className="mx-auto h-8 w-8 text-slate-500" aria-hidden />
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {description && <div className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="border-red-300 bg-white text-red-900 hover:bg-red-100">
          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden /> Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function FormAlert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const tone =
    kind === "error" ? "border-red-200 bg-red-50 text-red-800" : kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <div role={kind === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      {children}
    </div>
  );
}

/** DESIGN.md §4 — campo: 44 px, raio 8, borda field (≥ 3:1), foco lens, erro danger. */
export const inputClass =
  "w-full h-11 rounded-lg border border-field bg-white px-3 text-[0.9375rem] text-ink placeholder:text-slate-500 focus:outline-none focus-visible:border-lens focus-visible:ring-4 focus-visible:ring-lens/20 disabled:bg-paper disabled:text-slate-500 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-red-600/15";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, className, ...props }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1">
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        {/* Fora do <label>: o asterisco não entra no nome acessível; "required" já informa a obrigatoriedade */}
        {props.required && (
          <span className="text-sm font-semibold text-red-700" aria-hidden>
            *
          </span>
        )}
      </div>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        className={`${inputClass} ${className ?? ""}`}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-[0.8125rem] text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="flex items-start gap-1.5 text-[0.8125rem] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, hint, error, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1">
        <label htmlFor={id} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        {/* Fora do <label>: o asterisco não entra no nome acessível; "required" já informa a obrigatoriedade */}
        {props.required && (
          <span className="text-sm font-semibold text-red-700" aria-hidden>
            *
          </span>
        )}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          className={`${inputClass} pr-12`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-600 hover:bg-paper hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-lens"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-[0.8125rem] text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="flex items-start gap-1.5 text-[0.8125rem] font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/** Carrega dados com estados de carregamento/erro e função de nova tentativa. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const hasData = useRef(false);
  const run = useCallback(async () => {
    const id = ++seq.current;
    // Só a primeira carga mostra "carregando": recargas mantêm o conteúdo (e o
    // estado dos componentes, como mensagens de resultado) na tela.
    if (!hasData.current) setLoading(true);
    setError(null);
    try {
      const value = await fn();
      if (id === seq.current) {
        hasData.current = true;
        setData(value);
      }
    } catch (err) {
      if (id === seq.current) setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Senha forte o suficiente para o Supabase e com feedback claro. Exportado para testes. */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 8) out.push("pelo menos 8 caracteres");
  if (!/[A-Za-z]/.test(pw)) out.push("uma letra");
  if (!/\d/.test(pw)) out.push("um número");
  return out;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
