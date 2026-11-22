/**
 * @file components/testar/LongDocProgress.tsx
 * @description Andamento REAL de uma análise longa: partes concluídas / total / com falha, páginas
 * não lidas, consumo, espera por cota do provedor. Nada de percentual por cronômetro: a barra é
 * a fração de partes já lidas, vinda do servidor.
 */
import { AlertTriangle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type JobStatus = "pendente" | "processando" | "aguardando_cota" | "concluida" | "parcial" | "falhou" | "cancelada";

export interface LongJobView {
  id: string;
  agentId: string;
  status: JobStatus;
  documento: { caracteres: number; paginas: number | null; hash: string; texto_retido: boolean };
  partes: {
    total: number;
    concluidas: number;
    com_falha: number;
    pendentes: number;
    lista: Array<{ n: number; situacao: string; paginas: string | null; secao: string | null; inicio: number; fim: number; tentativas: number; erro: string | null }>;
  };
  cobertura: { caracteres_totais: number; caracteres_analisados: number; completa: boolean; nao_analisados: Array<{ parte: number; paginas: string | null; motivo: string }> };
  consumo: { tokens: number; chamadas_ia: number; tokens_estimados: number };
  proxima_tentativa: string | null;
  erro: string | null;
  expira_em: string;
  resultado?: Record<string, unknown>;
}

const STATUS_TEXT: Record<JobStatus, string> = {
  pendente: "Na fila para começar",
  processando: "Lendo o documento inteiro, parte por parte",
  aguardando_cota: "Aguardando a cota do provedor de IA",
  concluida: "Leitura completa concluída",
  parcial: "Leitura incompleta",
  falhou: "A análise não pôde continuar",
  cancelada: "Análise cancelada",
};

const fmt = (n: number) => n.toLocaleString("pt-BR");

export function LongDocProgress({
  job,
  runningHere,
  backgroundAvailable,
  onCancel,
  onRetryFailed,
  onResume,
}: {
  job: LongJobView;
  runningHere: boolean;
  backgroundAvailable: boolean;
  onCancel: () => void;
  onRetryFailed: () => void;
  onResume: () => void;
}) {
  const active = job.status === "pendente" || job.status === "processando" || job.status === "aguardando_cota";
  const done = job.partes.concluidas;
  const total = job.partes.total;
  const failed = job.partes.lista.filter((p) => p.situacao === "falhou");
  const current = job.partes.lista.find((p) => p.situacao === "processando") ?? job.partes.lista.find((p) => p.situacao === "pendente");
  const wait = job.proxima_tentativa ? new Date(job.proxima_tentativa) : null;
  return (
    <section aria-labelledby="longdoc-titulo" className="rounded-xl border border-hairline bg-white p-4" data-testid="longdoc-progresso" data-status={job.status}>
      <div className="flex items-start gap-3">
        {active ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
        ) : job.status === "concluida" ? null : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h3 id="longdoc-titulo" className="font-semibold text-ink">
            {STATUS_TEXT[job.status]}
          </h3>
          <p role="status" aria-live="polite" className="mt-1 text-sm text-ink-2" data-testid="longdoc-contagem">
            {done} de {total} partes analisadas
            {job.partes.com_falha > 0 ? ` · ${job.partes.com_falha} com falha` : ""}
            {active && current ? ` · agora: parte ${current.n}${current.paginas ? ` (p. ${current.paginas})` : ""}` : ""}
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold">Documento recebido: </dt>
              <dd className="inline">
                {fmt(job.documento.caracteres)} caracteres{job.documento.paginas ? ` · ${fmt(job.documento.paginas)} páginas marcadas` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">Efetivamente analisado: </dt>
              <dd className="inline" data-testid="longdoc-analisado">
                {fmt(job.cobertura.caracteres_analisados)} de {fmt(job.cobertura.caracteres_totais)} caracteres
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">Consumo: </dt>
              <dd className="inline">
                {fmt(job.consumo.tokens)} tokens em {fmt(job.consumo.chamadas_ia)} chamadas (estimativa total: {fmt(job.consumo.tokens_estimados)})
              </dd>
            </div>
          </dl>
          {job.status === "aguardando_cota" && wait && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {job.erro ?? "O provedor de IA pediu uma pausa."} Próxima tentativa às {wait.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              {wait.getTime() - Date.now() > 3_600_000 ? ` de ${wait.toLocaleDateString("pt-BR")}` : ""}.
            </p>
          )}
          {job.status === "falhou" && job.erro && <p className="mt-2 text-sm text-red-800">{job.erro}</p>}
          {failed.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="longdoc-falhas">
              <p className="font-semibold">Trechos não analisados ({failed.length})</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {failed.slice(0, 12).map((p) => (
                  <li key={p.n}>
                    Parte {p.n}
                    {p.paginas ? `, páginas ${p.paginas}` : `, caracteres ${fmt(p.inicio)}–${fmt(p.fim)}`}
                    {p.erro ? ` — ${p.erro}` : ""}
                  </li>
                ))}
              </ul>
              {failed.length > 12 && <p className="mt-1">…e mais {failed.length - 12}.</p>}
            </div>
          )}
          {active && (
            <p className="mt-2 text-xs text-slate-600">
              {backgroundAvailable
                ? "Você pode fechar esta página: o andamento fica salvo e a leitura continua no servidor."
                : "A leitura avança enquanto esta página estiver aberta. Se fechar, o que já foi lido fica salvo e a leitura continua de onde parou quando você voltar."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {active && !runningHere && (
              <Button size="sm" onClick={onResume} data-testid="longdoc-continuar">
                Continuar a leitura
              </Button>
            )}
            {failed.length > 0 && !active && job.documento.texto_retido && (
              <Button size="sm" onClick={onRetryFailed} data-testid="longdoc-reprocessar">
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Reprocessar partes com falha
              </Button>
            )}
            {(active || job.status === "parcial") && (
              <Button size="sm" variant="outline" onClick={onCancel} data-testid="longdoc-cancelar">
                <XCircle className="mr-1 h-4 w-4" aria-hidden /> Cancelar análise
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
