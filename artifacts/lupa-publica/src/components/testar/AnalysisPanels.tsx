/**
 * @file components/testar/AnalysisPanels.tsx
 * @description Peças do /testar que antes mostravam informação fictícia:
 *   - StageBanner: etapa REAL (aguardando, extraindo, analisando, concluído,
 *     parcialmente concluído, falha), com tempo decorrido real — sem porcentagem.
 *   - ResultValidity: deixa explícito quando o resultado é de contingência (sem IA)
 *     ou incompleto, e lista datas/valores citados que não estão no documento.
 *   - QuickViewContent: síntese da análise selecionada (objeto, prazo, valor,
 *     documentos, elegibilidade, pendências), sempre a partir da MESMA análise.
 *   - DocumentTimeline: datas do edital, com o trecho de onde cada uma saiu.
 */

import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, XCircle } from "lucide-react";
import type { DocumentBase, TimelineStep } from "@/lib/analysisViewModel";
import { formatIsoDate } from "@/lib/analysisViewModel";

export type RealStage = "aguardando" | "extraindo" | "analisando" | "concluido" | "parcial" | "falha";

export interface AnalysisLike {
  processing?: { mode?: string; complete?: boolean; failedChunks?: number; totalChunks?: number };
  base?: DocumentBase;
  verificacao?: Array<{ tipo: string; valor: string; mensagem: string }>;
  interpretation?: { summary?: string; objective?: string; deadlines?: string };
  criterios?: Array<{ criterio?: string; estado?: string; atende?: boolean | null }>;
  alertas?: Array<string | { descricao?: string }>;
}

/** Resultado de contingência (heurístico) ou incompleto — nunca apresentar como análise completa. */
export function isPartialResult(a: AnalysisLike | null | undefined): boolean {
  if (!a) return false;
  return a.processing?.mode === "fallback" || a.processing?.complete === false;
}

const STAGE_TEXT: Record<RealStage, { title: string; detail: string }> = {
  aguardando: { title: "Aguardando o documento", detail: "Cole o texto, informe um link ou envie um PDF." },
  extraindo: { title: "Extraindo o texto", detail: "Lendo o conteúdo do link ou do PDF." },
  analisando: { title: "Analisando com IA", detail: "Documentos longos são lidos em partes; pode levar até cerca de 1 minuto." },
  concluido: { title: "Análise concluída", detail: "Confira os pontos importantes no documento oficial." },
  parcial: { title: "Análise parcialmente concluída", detail: "Parte do resultado não veio da IA ou ficou incompleta. Veja o aviso abaixo." },
  falha: { title: "Não foi possível concluir", detail: "Veja a mensagem de erro e tente novamente." },
};

export function StageBanner({ stage, elapsedSeconds, agentName }: { stage: RealStage; elapsedSeconds: number; agentName: string }) {
  const t = STAGE_TEXT[stage];
  const busy = stage === "extraindo" || stage === "analisando";
  const Icon = busy ? Loader2 : stage === "concluido" ? CheckCircle2 : stage === "falha" ? XCircle : stage === "parcial" ? AlertTriangle : CircleHelp;
  const tone =
    stage === "concluido"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : stage === "falha"
        ? "border-red-200 bg-red-50 text-red-900"
        : stage === "parcial"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-hairline bg-white text-ink";
  return (
    <div role="status" aria-live="polite" aria-busy={busy} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone}`} data-testid="testar-etapa" data-stage={stage}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">
          {t.title}
          {busy && elapsedSeconds > 0 && <span className="ml-2 font-mono text-xs font-normal tabular">{elapsedSeconds}s</span>}
        </p>
        <p className="text-sm opacity-90">
          {stage === "analisando" ? `${agentName}. ` : ""}
          {t.detail}
        </p>
      </div>
    </div>
  );
}

export function ResultValidity({ analysis }: { analysis: AnalysisLike | null }) {
  if (!analysis) return null;
  const partial = isPartialResult(analysis);
  const issues = analysis.verificacao ?? [];
  if (!partial && issues.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="testar-validade">
      {partial && (
        <div role="alert" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {analysis.processing?.mode === "fallback" ? (
              <>
                <strong>Resultado de contingência, sem IA.</strong> A IA não respondeu; este resultado foi montado por regras simples a partir do texto e
                pode estar incompleto. Tente novamente em instantes para obter a análise completa.
              </>
            ) : (
              <>
                <strong>Análise incompleta.</strong> {analysis.processing?.failedChunks ?? "Algumas"} de {analysis.processing?.totalChunks ?? "várias"} partes do
                documento não foram processadas. Não use este resultado como completo.
              </>
            )}
          </span>
        </div>
      )}
      {issues.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-ink-2">
          <p className="font-semibold text-amber-900">Conferir no documento ({issues.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {issues.map((i) => (
              <li key={i.valor}>{i.mensagem}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-hairline py-2.5 last:border-0 sm:grid-cols-[9rem_1fr]">
      <dt className="text-[0.8125rem] font-semibold text-slate-600">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

const Missing = () => <span className="text-slate-600">não encontrado no documento</span>;

/** Síntese da análise selecionada — mesma fonte do resumo, cronograma e checklist. */
export function QuickViewContent({ analysis, agentName, timeline, checklistCount }: { analysis: AnalysisLike | null; agentName: string; timeline: TimelineStep[]; checklistCount: number }) {
  if (!analysis) {
    return <p className="text-sm text-slate-600">Ainda não há análise. Envie um documento e clique em Analisar documento.</p>;
  }
  const b = analysis.base;
  const deadline = [...(b?.datas ?? [])].filter((d) => d.rotulo === "inscrições" && d.iso).pop() ?? null;
  const criteria = analysis.criterios ?? [];
  const elig = b?.elegibilidade_perfil;
  const count = (list: Array<{ estado?: string }>, e: string) => list.filter((x) => x.estado === e).length;
  return (
    <div className="space-y-3">
      <ResultValidity analysis={analysis} />
      <dl>
        <Row label="Agente">{agentName}</Row>
        <Row label="Objeto">{b?.objeto?.texto ?? analysis.interpretation?.objective ?? <Missing />}</Row>
        <Row label="Inscrições até">
          {deadline ? (
            <span className="font-mono tabular">{formatIsoDate(deadline.iso)}</span>
          ) : analysis.interpretation?.deadlines ? (
            <>
              {analysis.interpretation.deadlines} <span className="text-xs text-slate-600">(segundo a IA; data não localizada no texto)</span>
            </>
          ) : (
            <Missing />
          )}
        </Row>
        <Row label="Valores">{b?.valores?.length ? b.valores[0].texto : <Missing />}</Row>
        <Row label="Datas">{timeline.length ? `${timeline.length} etapa(s) com data` : <Missing />}</Row>
        <Row label="Documentos">{checklistCount ? `${checklistCount} documento(s) exigido(s)` : <Missing />}</Row>
        <Row label="Elegibilidade">
          {elig && elig.length ? (
            `Com o seu perfil docente: ${count(elig, "atendido")} atendido(s), ${count(elig, "nao_atendido")} não atendido(s), ${count(elig, "pendente")} pendente(s)`
          ) : criteria.length ? (
            `${count(criteria, "atendido")} atendido(s), ${count(criteria, "nao_atendido")} não atendido(s), ${count(criteria, "pendente")} pendente(s)`
          ) : (
            <span className="text-slate-600">use o agente Lupa Elegibilidade ou entre com seu perfil docente</span>
          )}
        </Row>
        {b?.ausentes?.length ? <Row label="Não encontrado">{b.ausentes.join(", ")}</Row> : null}
      </dl>
    </div>
  );
}

/** Datas do edital (não as etapas do processamento), com o trecho de origem. */
export function DocumentTimeline({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-slate-600">Nenhuma data foi encontrada neste documento. Confira o cronograma no edital oficial.</p>;
  }
  return (
    <ol className="space-y-3" data-testid="testar-linha-do-tempo">
      {steps.map((s, i) => (
        <li key={`${s.title}-${i}`} className="rounded-lg border border-hairline bg-white p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-ink">{s.title}</p>
            <p className="font-mono text-sm font-medium text-ink tabular">{s.date}</p>
          </div>
          {s.evidence ? (
            <blockquote className="evidence mt-2 text-[0.8125rem] leading-relaxed">“{s.evidence.length > 260 ? `${s.evidence.slice(0, 260)}…` : s.evidence}”</blockquote>
          ) : (
            <p className="mt-1 text-sm text-ink-2">{s.description}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
