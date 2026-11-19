/**
 * @file TermsInput.tsx
 * @description Campo de lista de termos (áreas, competências, temas, palavras-chave).
 * Enter ou vírgula adicionam; cada termo tem botão de remover acessível.
 */

import { useId, useState } from "react";
import { X } from "lucide-react";

export function TermsInput({
  label,
  hint,
  value,
  onChange,
  max = 40,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 120);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {label}
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} adicionados`}>
          {value.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-sm text-primary">
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="rounded-full p-0.5 hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Remover ${t}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={draft}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        placeholder={placeholder ?? "Digite e tecle Enter"}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
    </div>
  );
}
