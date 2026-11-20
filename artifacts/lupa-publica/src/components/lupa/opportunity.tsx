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
import { highlightTerms } from "@/lib/highlight";
import { Evidence } from "@/components/lupa/ui";
import { confirmedDeadline, formatDate, OPPORTUNITY_TYPE_LABELS, type EligibilityState, type Opportunity, type Recommendation } from "@/lib/lupa-types";

export function StatusBadge({ status }: { status: Opportunity["status"] }) {
  const map = {
    aberta: ["Aberta", "border-emerald-200 bg-emerald-50 text-emerald-800"],
    encerrada: ["Encerrada", "border-slate-200 bg-slate-100 text-slate-700"],
    suspensa: ["Suspensa", "border-red-200 bg-red-50 text-red-800"],
    cancelada: ["Cancelada", "border-red-200 bg-red-50 text-red-800"],
    desconhecida: ["Situação não confirmada", "border-amber-200 bg-amber-50 text-amber-800"],
  } as const;
  const [label, cls] = map[status];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
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
  const clip = (t: string) => (t.length > 240 ? `${t.slice(0, 240)}…` : t);
  return (
    <div className="space-y-5 text-sm">
      {r.warnings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Avisos">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby={`th-${rec.opportunity_id}`}>
        <h3 id={`th-${rec.opportunity_id}`} className="eyebrow text-slate-600">
          Aderência temática
        </h3>
        {r.thematic.matches.length === 0 ? (
          <p className="mt-1.5 text-ink-2">Nenhum termo do seu perfil foi encontrado no texto extraído do edital.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {r.thematic.matches.map((m) => (
              <li key={m.term}>
                <p className="text-ink">
                  <span className="font-semibold">“{m.term}”</span> <span className="text-slate-600">· {m.profile_field} do seu perfil</span>
                </p>
                <blockquote className="evidence mt-1 text-[0.8125rem] leading-relaxed">“{highlightTerms(clip(m.evidence), [m.term])}”</blockquote>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby={`el-${rec.opportunity_id}`}>
        <h3 id={`el-${rec.opportunity_id}`} className="eyebrow text-slate-600">
          Elegibilidade · requisito a requisito
        </h3>
        {r.eligibility.checks.length === 0 ? (
          <p className="mt-1.5 text-ink-2">Nenhum critério de elegibilidade foi identificado no edital. Confira o documento oficial.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {r.eligibility.checks.map((c) => {
              const ui = STATE_UI[c.state];
              return (
                <li key={c.requirement} className="rounded-lg border border-hairline bg-white p-3">
                  <p className={`flex items-center gap-1.5 font-semibold ${ui.cls}`}>
                    <ui.Icon className="h-4 w-4 shrink-0" aria-hidden /> {ui.label}
                  </p>
                  <p className="mt-1 text-ink-2">{c.reason}</p>
                  <Evidence text={c.evidence} url={c.source_url} max={240} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {r.interest && (
        <section aria-labelledby={`in-${rec.opportunity_id}`}>
          <h3 id={`in-${rec.opportunity_id}`} className="eyebrow text-slate-600">
            Seu interesse
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
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
        <section aria-labelledby={`mi-${rec.opportunity_id}`}>
          <h3 id={`mi-${rec.opportunity_id}`} className="eyebrow text-slate-600">
            Pendências
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
            {r.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="border-t border-hairline pt-3 text-xs text-slate-600">
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

export function OpportunityCard({ o, children, saved, headingLevel = 3 }: { o: Opportunity; children?: React.ReactNode; saved?: boolean; headingLevel?: 2 | 3 }) {
  const Title = headingLevel === 2 ? "h2" : "h3";
  const deadline = confirmedDeadline(o);
  const types = (o.types ?? []).map((t) => OPPORTUNITY_TYPE_LABELS[t]).filter(Boolean);
  return (
    <article className="flex flex-col rounded-xl border border-hairline bg-white p-5" aria-labelledby={`op-${o.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[0.75rem] font-medium uppercase tracking-[0.06em] text-slate-600">
          {o.edital_number && !o.title.includes(o.edital_number) ? `Edital nº ${o.edital_number} · ` : ""}<span translate="no">{o.source_id.toUpperCase()}</span>
        </p>
        <StatusBadge status={o.status} />
      </div>
      <Title id={`op-${o.id}`} className="mt-2 text-[1.0625rem] font-semibold leading-snug text-ink">
        <Link href={`/oportunidades/${o.id}`} className="underline-offset-2 hover:text-lens hover:underline">
          {o.title}
        </Link>
      </Title>
      {o.fields.objeto ? (
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-2">{o.fields.objeto.value}</p>
      ) : (
        <p className="mt-1.5 text-sm italic text-slate-600">Objeto não encontrado — confira no documento oficial.</p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-3 text-[0.8125rem]">
        <div>
          <dt className="text-slate-600">Prazo de submissão</dt>
          <dd className="mt-0.5 font-mono font-medium text-ink tabular">
            {deadline ? formatDate(deadline.iso) : <span className="font-sans font-normal text-slate-600">não confirmado na fonte</span>}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-600">Tipo</dt>
          <dd className="mt-0.5 truncate text-ink">{types.length ? types.join(" · ") : "não identificado"}</dd>
        </div>
      </dl>
      {(o.review_status === "pendente" || o.interested || o.changed_since_saved) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {o.review_status === "pendente" && <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">Aguardando revisão humana</span>}
          {o.interested && <span className="rounded-full bg-lens-tint px-2 py-0.5 font-semibold text-lens-deep">Tenho interesse</span>}
          {o.changed_since_saved && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">Alterado desde que você salvou</span>
          )}
        </div>
      )}
      {children && <div className="mt-4 space-y-3">{children}</div>}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Link href={`/oportunidades/${o.id}`} className={buttonVariants({ size: "sm" })}>
          Ver edital
        </Link>
        <a href={o.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
          Página oficial <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
        {saved !== undefined && <SaveButton opportunityId={o.id} initial={saved} />}
      </div>
    </article>
  );
}
