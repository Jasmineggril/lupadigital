/**
 * @file components/lupa/SaveStatus.tsx
 * @description Estado do salvamento, visível e acessível. O texto muda sem ser anunciado a cada
 * gravação; o leitor de tela só é avisado de falha, conflito e da primeira confirmação.
 */
import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SaveState } from "@/lib/persistence";

export function SaveStatus({
  state,
  error,
  savedAt,
  onRetry,
  onResolveConflict,
  guest,
  className = "",
}: {
  state: SaveState;
  error?: string | null;
  savedAt?: Date | null;
  onRetry?: () => void;
  /** Conflito: "servidor" = carregar a versão salva; "minha" = gravar a minha por cima */
  onResolveConflict?: (choice: "servidor" | "minha") => void;
  /** Visitante: nada vai para a conta */
  guest?: boolean;
  className?: string;
}) {
  const [announce, setAnnounce] = useState("");
  const announcedSaved = useRef(false);
  useEffect(() => {
    if (state === "error") setAnnounce(`Falha ao salvar. ${error ?? ""}`);
    else if (state === "conflict") setAnnounce("Este item foi alterado em outra aba ou aparelho. Escolha qual versão manter.");
    else if (state === "saved" && !announcedSaved.current) {
      announcedSaved.current = true;
      setAnnounce("Salvo na sua conta.");
    }
  }, [state, error]);

  const time = savedAt ? savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  let body: React.ReactNode;
  if (guest) body = <span className="text-slate-600">Sem login: fica só neste navegador. Entre para salvar na sua conta.</span>;
  else if (state === "dirty") body = <span className="text-slate-700">Alterações não salvas</span>;
  else if (state === "saving")
    body = (
      <span className="inline-flex items-center gap-1 text-slate-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Salvando…
      </span>
    );
  else if (state === "saved")
    body = (
      <span className="inline-flex items-center gap-1 text-emerald-800">
        <Check className="h-3.5 w-3.5" aria-hidden /> Salvo na sua conta{time ? ` às ${time}` : ""}
      </span>
    );
  else if (state === "error")
    body = (
      <span className="inline-flex flex-wrap items-center gap-2 text-red-800">
        <CloudOff className="h-3.5 w-3.5" aria-hidden /> Falha ao salvar{error ? ` — ${error}` : ""}
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
            Tentar de novo
          </button>
        )}
      </span>
    );
  else if (state === "conflict")
    body = (
      <span className="inline-flex flex-wrap items-center gap-2 text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Alterado em outra aba ou aparelho — nada foi sobrescrito.
        {onResolveConflict && (
          <>
            <button type="button" onClick={() => onResolveConflict("servidor")} className="font-semibold underline underline-offset-2">
              Carregar a versão salva
            </button>
            <button type="button" onClick={() => onResolveConflict("minha")} className="font-semibold underline underline-offset-2">
              Manter a minha
            </button>
          </>
        )}
      </span>
    );
  else body = null;
  return (
    <div className={`text-xs ${className}`} data-testid="save-status" data-state={guest ? "guest" : state}>
      {body}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
