import { useListAgentHistory } from "@workspace/api-client-react";
import type { AgentResultRecord } from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CheckCircle2, Clock, XCircle, Circle, ChevronDown, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils/format";

interface TimelineItem {
  fase: string;
  periodo: string;
  descricao: string;
  status: "passado" | "ativo" | "futuro";
}

interface AcompanhamentoResult {
  type: "acompanhamento";
  timeline: TimelineItem[];
  observacao?: string;
}

function StatusIcon({ status }: { status: TimelineItem["status"] }) {
  if (status === "passado") return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
  if (status === "ativo") return <Clock className="w-5 h-5 text-amber-500 shrink-0 animate-pulse" />;
  return <Circle className="w-5 h-5 text-slate-300 shrink-0" />;
}

function PhaseStatusBadge({ status }: { status: TimelineItem["status"] }) {
  if (status === "passado") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0 font-semibold">Concluído</Badge>;
  if (status === "ativo") return <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0 font-semibold">Em andamento</Badge>;
  return <Badge className="text-[10px] bg-slate-100 text-slate-500 border-0 font-semibold">Futuro</Badge>;
}

function TimelineCard({ record }: { record: AgentResultRecord }) {
  const [expanded, setExpanded] = useState(true);
  const result = record.resultJson as unknown as AcompanhamentoResult;
  const items = result.timeline ?? [];

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="pb-0 pt-4 px-5">
        <button
          className="w-full flex items-start gap-3 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <CalendarDays className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate pr-2">{record.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Salvo em {formatDate(record.createdAt)}
              <span className="mx-1">·</span>
              {items.length} fase{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="shrink-0 mt-1">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-4 pb-5 px-5">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma fase encontrada.</p>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-border/60 z-0" />
              <div className="space-y-0">
                {items.map((item, index) => (
                  <div key={index} className="relative flex gap-4 pb-5 last:pb-0">
                    <div className="relative z-10 mt-0.5">
                      <StatusIcon status={item.status} />
                    </div>
                    <div
                      className={`flex-1 rounded-xl p-3 border transition-all ${
                        item.status === "ativo"
                          ? "bg-amber-50 border-amber-200"
                          : item.status === "passado"
                          ? "bg-emerald-50/60 border-emerald-100"
                          : "bg-muted/30 border-border/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p
                          className={`text-sm font-semibold leading-tight ${
                            item.status === "ativo"
                              ? "text-amber-800"
                              : item.status === "passado"
                              ? "text-emerald-800"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.fase}
                        </p>
                        <PhaseStatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {item.periodo}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.observacao && (
            <p className="text-xs text-muted-foreground mt-4 p-3 bg-muted/40 rounded-xl border border-border/40 leading-relaxed">
              {result.observacao}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function Timeline() {
  const { data: agentHistory, isLoading } = useListAgentHistory();

  const timelineRecords = useMemo(
    () => (agentHistory ?? []).filter((r) => r.agentId === "acompanhamento"),
    [agentHistory]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Timeline de Editais</h1>
              <p className="text-sm text-muted-foreground">Visualize as fases e prazos dos seus editais</p>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ) : timelineRecords.length === 0 ? (
          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <CalendarDays className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-base font-semibold mb-1">Nenhuma timeline salva</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Analise um edital com o agente{" "}
                <strong>Acompanhamento</strong> e salve o resultado para visualizá-lo aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {timelineRecords.map((record) => (
              <TimelineCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
