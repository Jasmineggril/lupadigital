/**
 * "E agora?" depois de uma análise: os próximos passos coerentes com o edital, sem reenviar o
 * documento. Tudo parte da MESMA análise salva na conta:
 *   - Conferir minha elegibilidade → aba Elegibilidade do próprio resultado (perfil usado é dito);
 *   - Organizar documentos / Acompanhar prazos → espaço "Quero participar" criado a partir da análise
 *     (checklist e prazos vêm do documento, com o trecho de origem); clicar de novo reabre o mesmo;
 *   - Preparar projeto → Projetos com o contexto da participação (requisitos do edital já levados).
 */
import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarClock, ClipboardList, Lightbulb, UserCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { loginUrlFor } from "@/lib/safe-redirect";
import type { Participation } from "@/lib/participacao";

type Destino = "documentos" | "prazos" | "projeto";

export function ProximosPassos({
  logged,
  agentResultId,
  titulo,
  perfilUsado,
  onEligibility,
}: {
  logged: boolean;
  /** id da análise salva na conta (null = ainda não salva) */
  agentResultId: number | null;
  titulo: string;
  /** O perfil da pessoa entrou na análise de elegibilidade? */
  perfilUsado: boolean;
  onEligibility: () => void;
}) {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState<Destino | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  /** Abre (ou reabre — o servidor não duplica) o espaço de participação desta análise. */
  const go = async (dest: Destino) => {
    if (inFlight.current || !agentResultId) return;
    inFlight.current = true;
    setBusy(dest);
    setError(null);
    try {
      const r = await apiFetch<{ participation: Participation }>("/participations", {
        method: "POST",
        body: JSON.stringify({ agent_result_id: agentResultId, ...(titulo ? { titulo: titulo.slice(0, 300) } : {}) }),
      });
      const id = r.participation.id;
      if (dest === "projeto") navigate(`/niasci/projetos?participacao=${id}`);
      else navigate(`/participar/${id}#${dest === "documentos" ? "docs" : "prazos"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o próximo passo.");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const needsAccount = !logged;
  const notSaved = logged && !agentResultId;
  const itemCls = "flex h-full w-full flex-col items-start gap-1 rounded-xl border border-hairline bg-white p-3 text-left hover:border-lens/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lens disabled:opacity-60";
  const acoes: Array<{ id: Destino | "elegibilidade"; icon: typeof UserCheck; titulo: string; explica: string; conta: boolean }> = [
    {
      id: "elegibilidade",
      icon: UserCheck,
      titulo: "Conferir minha elegibilidade",
      explica: perfilUsado
        ? "Requisito a requisito, comparado com o seu perfil: atende, não atende ou falta informar."
        : "Mostra os requisitos do edital. Complete o seu perfil para a comparação ser feita com os seus dados.",
      conta: false,
    },
    { id: "documentos", icon: ClipboardList, titulo: "Organizar documentos", explica: "Checklist com os documentos citados no edital (com o trecho) para marcar o que já tem.", conta: true },
    { id: "prazos", icon: CalendarClock, titulo: "Acompanhar prazos", explica: "Prazos oficiais do edital separados das suas metas e tarefas.", conta: true },
    { id: "projeto", icon: Lightbulb, titulo: "Preparar projeto", explica: "Estrutura a proposta aproveitando os requisitos do edital; você revisa e edita.", conta: true },
  ];

  return (
    <section aria-labelledby="proximos-passos" className="rounded-2xl border border-hairline bg-slate-50 p-4" data-testid="testar-proximos-passos">
      <h2 id="proximos-passos" className="text-sm font-semibold text-ink">
        E agora?
      </h2>
      <p className="mt-1 text-xs text-slate-600" data-testid="proximos-contexto">
        {agentResultId
          ? `Tudo a partir desta análise, salva na sua conta${perfilUsado ? " (com o seu perfil)" : ""} — sem enviar o documento de novo.`
          : needsAccount
            ? "Entre na sua conta para organizar documentos, prazos e projeto a partir desta análise."
            : "Salvando a análise na sua conta…"}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {acoes.map((a) => {
          const Icon = a.icon;
          const body = (
            <>
              <span className="flex items-start gap-1.5 text-sm font-semibold leading-snug text-ink">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-lens" aria-hidden />
                {busy === a.id ? "Abrindo…" : a.titulo}
              </span>
              <span className="text-xs text-slate-600">{a.explica}</span>
            </>
          );
          if (a.id === "elegibilidade")
            return (
              <li key={a.id}>
                <button type="button" className={itemCls} onClick={onEligibility} data-testid="proximo-elegibilidade">
                  {body}
                </button>
              </li>
            );
          if (a.conta && needsAccount)
            return (
              <li key={a.id}>
                <Link href={loginUrlFor("/testar")} className={itemCls} data-testid={`proximo-${a.id}`}>
                  {body}
                  <span className="text-xs font-semibold text-lens">Entrar para continuar</span>
                </Link>
              </li>
            );
          return (
            <li key={a.id}>
              <button type="button" className={itemCls} disabled={notSaved || busy !== null} onClick={() => void go(a.id as Destino)} data-testid={`proximo-${a.id}`}>
                {body}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {error} A análise continua salva.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-600">
        Também:{" "}
        <Link href="/glossario" className="font-medium text-lens underline">
          entender um termo
        </Link>{" "}
        ·{" "}
        <Link href="/oportunidades" className="font-medium text-lens underline">
          ver editais parecidos
        </Link>{" "}
        ·{" "}
        <Link href={agentResultId ? `/niasci/assistente?analise=${agentResultId}` : "/niasci/assistente"} className="font-medium text-lens underline">
          perguntar ao Assistente
        </Link>
        . A inscrição continua sendo no canal oficial do edital.
      </p>
    </section>
  );
}
