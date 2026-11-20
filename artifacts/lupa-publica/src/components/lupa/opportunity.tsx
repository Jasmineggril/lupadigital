/**
 * @file components/lupa/opportunity.tsx
 * @description Cartões e explicações de oportunidades e recomendações.
 *
 * Regras de apresentação:
 *   - Elegibilidade aparece separada da aderência temática e com destaque quando
 *     há requisito eliminatório não atendido — mesmo com aderência alta.
 *   - O índice temático é rotulado como "aderência", nunca como chance de aprovação.
 *   - Toda informação extraída mostra a evidência e o link para a fonte oficial.
 */

import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Bookmark, BookmarkCheck, CheckCircle2, CircleHelp, ExternalLink, Hand, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { confirmedDeadline, formatDate, OPPORTUNITY_TYPE_LABELS, type EligibilityState, type Opportunity, type Recommendation } from "@/lib/lupa-types";

export function StatusBadge({ status }: { status: Opportunity["status"] }) {
  const map = {
    aberta: ["Aberta", "bg-emerald-100 text-emerald-900"],
    encerrada: ["Encerrada", "bg-slate-200 text-slate-800"],
    suspensa: ["Suspensa", "bg-orange-100 text-orange-900"],
    cancelada: ["Cancelada", "bg-red-100 text-red-900"],
    desconhecida: ["Situação não confirmada", "bg-amber-100 text-amber-900"],
  } as const;
  const [label, cls] = map[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

const ELIG = {
  sem_impedimento_conhecido: { label: "Sem impedimento identificado", cls: "border-emerald-300 bg-emerald-50 text-emerald-900", Icon: CheckCircle2 },
  pendente: { label: "Elegibilidade pendente de comprovação", cls: "border-amber-300 bg-amber-50 text-amber-900", Icon: CircleHelp },
  impedimento: { label: "Requisito eliminatório não atendido", cls: "border-red-300 bg-red-50 text-red-900", Icon: XCircle },
} as const;

export function EligibilityBadge({ overall }: { overall: keyof typeof ELIG }) {
  const { label, cls, Icon } = ELIG[overall];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </span>
  );
}

export function ThematicBadge({ level, score }: { level: Recommendation["result"]["thematic"]["level"]; score: number }) {
  const label = level === "indeterminada" ? "Aderência indeterminada" : `Aderência ${level === "media" ? "média" : level} · ${score}/100`;
  const cls =
    level === "alta" ? "bg-primary/10 text-primary" : level === "media" ? "bg-sky-100 text-sky-900" : level === "baixa" ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

const STATE_UI: Record<EligibilityState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  atendida: { label: "Atendida (a comprovar)", cls: "text-emerald-800", Icon: CheckCircle2 },
  nao_atendida: { label: "Não atendida", cls: "text-red-800", Icon: XCircle },
  pendente_comprovacao: { label: "Pendente de comprovação", cls: "text-amber-800", Icon: CircleHelp },
};

export function RecommendationExplanation({ rec }: { rec: Recommendation }) {
  const r = rec.result;
  return (
    <div className="space-y-4 text-sm">
      {r.warnings.length > 0 && (
        <ul className="space-y-1">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}
      <section aria-label="Aderência temática">
        <h4 className="font-semibold text-slate-900">Por que combina com seu perfil</h4>
        {r.thematic.matches.length === 0 ? (
          <p className="mt-1 text-slate-600">Nenhum termo do seu perfil foi encontrado no texto extraído do edital.</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {r.thematic.matches.map((m) => (
              <li key={m.term} className="text-slate-700">
                <span className="font-semibold">“{m.term}”</span> <span className="text-slate-500">({m.profile_field})</span> aparece em:{" "}
                <q className="text-slate-600">{m.evidence.length > 220 ? `${m.evidence.slice(0, 220)}…` : m.evidence}</q>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Elegibilidade">
        <h4 className="font-semibold text-slate-900">Elegibilidade (avaliada separadamente)</h4>
        {r.eligibility.checks.length === 0 ? (
          <p className="mt-1 text-slate-600">Nenhum critério de elegibilidade foi identificado no edital. Confira o documento oficial.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {r.eligibility.checks.map((c) => {
              const ui = STATE_UI[c.state];
              return (
                <li key={c.requirement} className="rounded-lg border bg-white p-3">
                  <p className={`flex items-center gap-1.5 font-semibold ${ui.cls}`}>
                    <ui.Icon className="h-4 w-4" aria-hidden /> {ui.label}
                  </p>
                  <p className="mt-1 text-slate-700">{c.reason}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Trecho do edital: <q>{c.evidence.length > 220 ? `${c.evidence.slice(0, 220)}…` : c.evidence}</q>{" "}
                    <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
                      fonte
                    </a>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {r.interest && (
        <section aria-label="Interesse">
          <h4 className="font-semibold text-slate-900">Seu interesse</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
            <li>
              {r.interest.opportunity_type === "corresponde"
                ? "O tipo deste edital está entre os que você procura."
                : r.interest.opportunity_type === "nao_corresponde"
                  ? "O tipo deste edital não está entre os que você marcou no perfil."
                  : "Tipo de oportunidade não comparado (não informado no perfil ou não identificado no edital)."}
            </li>
            {r.interest.temporary_matches.length > 0 && <li>Relacionado ao seu interesse atual: {r.interest.temporary_matches.join(", ")}.</li>}
          </ul>
        </section>
      )}
      {r.missing.length > 0 && (
        <section aria-label="Informações faltantes">
          <h4 className="font-semibold text-slate-900">Informações faltantes</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-600">
            {r.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-slate-500">
        Calculado com a versão {rec.opportunity_version} do edital e a versão {rec.profile_version} do seu perfil. O índice de aderência não é
        probabilidade de aprovação.{" "}
        <Link href="/como-funciona#compatibilidade" className="font-semibold text-primary underline">
          Como calculamos
        </Link>
      </p>
    </div>
  );
}

export function SaveButton({ opportunityId, initial }: { opportunityId: string; initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await apiFetch(`/saved-opportunities/${opportunityId}`, { method: saved ? "DELETE" : "PUT" });
      setSaved(!saved);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={busy} aria-pressed={saved} data-testid={`save-${opportunityId}`}>
      {saved ? <BookmarkCheck className="mr-1.5 h-4 w-4" aria-hidden /> : <Bookmark className="mr-1.5 h-4 w-4" aria-hidden />}
      {error ? "Erro — tentar de novo" : saved ? "Salvo" : "Salvar"}
    </Button>
  );
}

/** Demonstrar interesse: salva o edital e registra que você pretende participar. */
export function InterestButton({ opportunityId, initial, onChange }: { opportunityId: string; initial: boolean; onChange?: (v: boolean) => void }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await apiFetch(`/saved-opportunities/${opportunityId}/interest`, { method: "PUT", body: JSON.stringify({ interested: !value }) });
      setValue(!value);
      onChange?.(!value);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant={value ? "default" : "outline"} size="sm" onClick={toggle} disabled={busy} aria-pressed={value} data-testid={`interest-${opportunityId}`}>
      <Hand className="mr-1.5 h-4 w-4" aria-hidden />
      {error ? "Erro — tentar de novo" : value ? "Tenho interesse" : "Demonstrar interesse"}
    </Button>
  );
}

export function FeedbackButtons({ opportunityId, initial }: { opportunityId: string; initial: { relevant: boolean } | null }) {
  const [value, setValue] = useState<boolean | null>(initial?.relevant ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const send = async (relevant: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await apiFetch(`/recommendations/${opportunityId}/feedback`, { method: "POST", body: JSON.stringify({ relevant }) });
      setValue(relevant);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Esta recomendação foi útil?">
      <span className="text-xs text-slate-600">Relevante para você?</span>
      <Button variant={value === true ? "default" : "outline"} size="sm" aria-pressed={value === true} disabled={busy} onClick={() => send(true)}>
        <ThumbsUp className="mr-1 h-3.5 w-3.5" aria-hidden /> Sim
      </Button>
      <Button variant={value === false ? "default" : "outline"} size="sm" aria-pressed={value === false} disabled={busy} onClick={() => send(false)}>
        <ThumbsDown className="mr-1 h-3.5 w-3.5" aria-hidden /> Não
      </Button>
      {error && <span className="text-xs text-red-700">Não foi possível registrar. Tente novamente.</span>}
    </div>
  );
}

export function OpportunityCard({ o, children, saved }: { o: Opportunity; children?: React.ReactNode; saved?: boolean }) {
  const deadline = confirmedDeadline(o);
  const types = (o.types ?? []).map((t) => OPPORTUNITY_TYPE_LABELS[t]).filter(Boolean);
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm" aria-labelledby={`op-${o.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={o.status} />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{o.source_id.toUpperCase()}</span>
        {o.review_status === "pendente" && <span className="text-xs text-slate-500">· aguardando revisão humana</span>}
        {o.interested && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Tenho interesse</span>}
        {o.changed_since_saved && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">Alterado desde que você salvou</span>}
      </div>
      <h3 id={`op-${o.id}`} className="mt-2 text-lg font-semibold text-slate-900">
        <Link href={`/oportunidades/${o.id}`} className="hover:text-primary hover:underline">
          {o.title}
        </Link>
      </h3>
      {o.fields.objeto ? (
        <p className="mt-1 line-clamp-3 text-sm text-slate-700">{o.fields.objeto.value}</p>
      ) : (
        <p className="mt-1 text-sm italic text-slate-500">Objeto não encontrado — pendente de verificação.</p>
      )}
      {types.length > 0 && <p className="mt-2 text-xs text-slate-500">Tipo (identificado no título/objeto): {types.join(" · ")}</p>}
      <p className="mt-2 text-sm text-slate-700">
        <span className="font-semibold">Prazo:</span>{" "}
        {deadline ? (
          <>
            {formatDate(deadline.iso)} <span className="text-xs text-slate-500">(confirmado na fonte)</span>
          </>
        ) : (
          <span className="text-slate-500">não confirmado na fonte</span>
        )}
      </p>
      {children && <div className="mt-4 space-y-3">{children}</div>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/oportunidades/${o.id}`} className={buttonVariants({ size: "sm" })}>
          Ver detalhes
        </Link>
        <a href={o.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
          Página oficial <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
        {saved !== undefined && <SaveButton opportunityId={o.id} initial={saved} />}
      </div>
    </article>
  );
}
