import { useListAgentHistory, useListEditalHistory } from "@workspace/api-client-react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { BarChart2, History, Sparkles, FileText, Clock, TrendingUp } from "lucide-react";

const AGENT_LABELS: Record<string, string> = {
  simples: "Simplificação",
  analista: "Analista",
  estrategica: "Estratégica",
  acompanhamento: "Acompanhamento",
  documentacao: "Documentação",
  elegibilidade: "Elegibilidade",
};

const AGENT_COLORS: Record<string, string> = {
  simples: "#3B82F6",
  analista: "#8B5CF6",
  estrategica: "#10B981",
  acompanhamento: "#F59E0B",
  documentacao: "#F43F5E",
  elegibilidade: "#14B8A6",
};

const PIE_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#F43F5E", "#14B8A6"];

const AGENT_BADGE: Record<string, { label: string; color: string }> = {
  simples: { label: "Simples", color: "bg-blue-100 text-blue-700" },
  analista: { label: "Analista", color: "bg-violet-100 text-violet-700" },
  estrategica: { label: "Estratégica", color: "bg-emerald-100 text-emerald-700" },
  acompanhamento: { label: "Acompanhamento", color: "bg-amber-100 text-amber-700" },
  documentacao: { label: "Documentação", color: "bg-rose-100 text-rose-700" },
  elegibilidade: { label: "Elegibilidade", color: "bg-teal-100 text-teal-700" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const { data: agentHistory, isLoading: agentLoading } = useListAgentHistory();
  const { data: legacyHistory, isLoading: legacyLoading } = useListEditalHistory();

  const isLoading = agentLoading || legacyLoading;

  const stats = useMemo(() => {
    const agentItems = agentHistory ?? [];
    const legacyItems = legacyHistory ?? [];

    const total = agentItems.length + legacyItems.length;

    // Breakdown by agent type
    const countMap: Record<string, number> = {};
    for (const item of agentItems) {
      countMap[item.agentId] = (countMap[item.agentId] ?? 0) + 1;
    }
    if (legacyItems.length > 0) {
      countMap["simples"] = (countMap["simples"] ?? 0) + legacyItems.length;
    }

    const byAgent = Object.entries(countMap).map(([agentId, count]) => ({
      agentId,
      label: AGENT_LABELS[agentId] ?? agentId,
      count,
    }));

    // Recent 10 items merged and sorted
    const recent = [
      ...agentItems.map((i) => ({ kind: "agent" as const, id: i.id, agentId: i.agentId, title: i.title, createdAt: i.createdAt })),
      ...legacyItems.map((i) => ({ kind: "legacy" as const, id: i.id, agentId: "simples", title: i.title, createdAt: i.createdAt })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    // Activity by day (last 7 days)
    const now = new Date();
    const dayMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      dayMap[key] = 0;
    }
    for (const item of [...agentItems, ...legacyItems]) {
      const d = new Date(item.createdAt);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      if (key in dayMap) dayMap[key]++;
    }
    const activityByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

    return { total, byAgent, recent, activityByDay };
  }, [agentHistory, legacyHistory]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Área Pessoal</h1>
              <p className="text-sm text-muted-foreground">Acompanhe sua produtividade e o histórico de interpretações</p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total de Interpretações</p>
                  {isLoading ? (
                    <Skeleton className="h-7 w-16 mt-0.5" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Agentes Utilizados</p>
                  {isLoading ? (
                    <Skeleton className="h-7 w-16 mt-0.5" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{stats.byAgent.length}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Interpretações (7 dias)</p>
                  {isLoading ? (
                    <Skeleton className="h-7 w-16 mt-0.5" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground">
                      {stats.activityByDay.reduce((s, d) => s + d.count, 0)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Activity by day */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Atividade (últimos 7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.activityByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                      formatter={(v) => [v, "Interpretações"]}
                    />
                    <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* By agent pie chart */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Uso por Agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : stats.byAgent.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma interpretação ainda.</p>
                  <p className="text-xs text-muted-foreground mt-1">Vá para Testar IA e faça sua primeira interpretação!</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.byAgent}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="count"
                      nameKey="label"
                    >
                      {stats.byAgent.map((entry, index) => (
                        <Cell
                          key={entry.agentId}
                          fill={AGENT_COLORS[entry.agentId] ?? PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                      formatter={(v, _n, props) => [v, props.payload?.label ?? ""]}
                    />
                    <Legend
                      formatter={(value, entry) => {
                        const payload = (entry as { payload?: { label?: string } }).payload;
                        return payload?.label ?? value;
                      }}
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Analyses by agent bar */}
        {!isLoading && stats.byAgent.length > 0 && (
          <Card className="border-border/60 shadow-sm mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                Interpretações por Agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.byAgent} layout="vertical" margin={{ top: 0, right: 16, left: 80, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                    formatter={(v) => [v, "Interpretações"]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.byAgent.map((entry, index) => (
                      <Cell
                        key={entry.agentId}
                        fill={AGENT_COLORS[entry.agentId] ?? PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Recent analyses */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Interpretações Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : stats.recent.length === 0 ? (
              <div className="text-center py-10">
                <History className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma interpretação salva ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.recent.map((item) => {
                  const badge = AGENT_BADGE[item.agentId] ?? { label: item.agentId, color: "bg-muted text-muted-foreground" };
                  return (
                    <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 p-3 rounded-xl border bg-card/60">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge className={`text-[10px] px-2 py-0 font-semibold border-0 ${badge.color}`}>
                            {badge.label}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate">{item.title}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
