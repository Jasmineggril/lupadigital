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
    <header className="border-b bg-white">
      <div className="container mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">{title}</h1>
          {description && <div className="mt-2 max-w-3xl text-slate-600">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 py-16 text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white px-6 py-12 text-center">
      <Inbox className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      {description && <div className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 sm:flex-row sm:items-center sm:justify-between">
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
    <div role={kind === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {children}
    </div>
  );
}

const inputClass =
  "w-full h-11 rounded-xl border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:bg-slate-50 aria-[invalid=true]:border-red-400";

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
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {label}
        {props.required && <span className="text-red-600" aria-hidden> *</span>}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        className={`${inputClass} border-slate-300 ${className ?? ""}`}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-red-700">
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
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {label}
        {props.required && <span className="text-red-600" aria-hidden> *</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          className={`${inputClass} border-slate-300 pr-12`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-red-700">
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
  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const value = await fn();
      if (id === seq.current) setData(value);
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
