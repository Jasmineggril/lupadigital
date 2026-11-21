/**
 * Botão "Quero participar": abre (ou reabre) o espaço de participação deste edital
 * ou desta análise. Não faz inscrição no site externo — isso é dito no próprio botão.
 */
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ClipboardCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loginUrlFor } from "@/lib/safe-redirect";
import type { Participation } from "@/lib/participacao";

export function QueroParticipar({
  opportunityId,
  agentResultId,
  titulo,
  className,
  size = "default",
}: {
  opportunityId?: string;
  agentResultId?: number;
  titulo?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (!user) {
    return (
      <Link href={loginUrlFor(window.location.pathname)} className={buttonVariants({ variant: "outline", size, className })}>
        <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden />
        Entrar para organizar a participação
      </Link>
    );
  }

  const start = async () => {
    if (inFlight.current) return; // cliques repetidos não criam outro espaço
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = opportunityId ? { opportunity_id: opportunityId } : { agent_result_id: agentResultId, ...(titulo ? { titulo: titulo.slice(0, 300) } : {}) };
      const r = await apiFetch<{ participation: Participation }>("/participations", { method: "POST", body: JSON.stringify(body) });
      navigate(`/participar/${r.participation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o espaço de participação.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button onClick={start} disabled={busy || (!opportunityId && !agentResultId)} size={size} variant="outline" className={className} aria-describedby="qp-ajuda">
        <ClipboardCheck className="mr-1.5 h-4 w-4" aria-hidden />
        {busy ? "Abrindo…" : "Quero participar"}
      </Button>
      <span id="qp-ajuda" className="text-xs text-slate-600">
        Organiza documentos, prazos e proposta. A inscrição continua sendo no canal oficial.
      </span>
      {error && (
        <span role="alert" className="text-xs font-medium text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
