import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Target, UserCheck, Clock, FileText, AlertCircle,
  BarChart2, ExternalLink, ArrowLeft, Share2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchShared(token: string) {
  const res = await fetch(`${BASE}/api/edital/share/${token}`);
  if (!res.ok) throw new Error("not_found");
  return res.json() as Promise<{
    token: string;
    agentId: string;
    title: string;
    resultJson: Record<string, unknown>;
    createdAt: string;
  }>;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const gradient = score >= 70
    ? "from-emerald-950 via-emerald-900 to-slate-900"
    : score >= 40
    ? "from-amber-950 via-slate-900 to-slate-900"
    : "from-red-950 via-slate-900 to-slate-900";
  const label = score >= 70 ? "Alta Oportunidade" : score >= 40 ? "Oportunidade Moderada" : "Baixa Oportunidade";
  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={`flex items-center gap-5 p-4 rounded-2xl bg-gradient-to-r ${gradient} text-white shadow-xl`}>
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle cx="55" cy="55" r={46} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle cx="55" cy="55" r={46} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black" style={{ color }}>{score}</span>
          <span className="text-[9px] text-white/40 uppercase tracking-widest font-semibold">/100</span>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-0.5">Score de Oportunidade</p>
        <p className="text-base font-bold" style={{ color }}>{label}</p>
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  );
}

function SimplesView({ r }: { r: Record<string, unknown> }) {
  const score = typeof r.scoreOportunidade === "number" ? r.scoreOportunidade : null;
  const fields = [
    { label: "Objetivo", value: r.objetivo != null ? String(r.objetivo) : "", icon: <Target className="w-3.5 h-3.5 text-primary" /> },
    { label: "Público-alvo", value: r.publicoAlvo != null ? String(r.publicoAlvo) : "", icon: <UserCheck className="w-3.5 h-3.5 text-primary" /> },
    { label: "Prazo", value: r.prazo != null ? String(r.prazo) : "", icon: <Clock className="w-3.5 h-3.5 text-primary" /> },
    { label: "Onde se Inscrever", value: r.ondeInscrever != null ? String(r.ondeInscrever) : "", icon: <FileText className="w-3.5 h-3.5 text-primary" /> },
  ];
  const requisitos = Array.isArray(r.requisitos) ? (r.requisitos as string[]) : [];

  return (
    <div className="space-y-4">
      {score !== null && <ScoreBadge score={score} />}
      {!!r.categoria && (
        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/20">
          <BarChart2 className="w-3.5 h-3.5" />{String(r.categoria)}
        </span>
      )}
      <Card className="border-none shadow-md bg-primary text-primary-foreground rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4" />Resumo Simplificado</CardTitle></CardHeader>
        <CardContent><p className="leading-relaxed opacity-90 text-sm">{String(r.resumo ?? "")}</p></CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(({ label, value, icon }) => value ? (
          <Card key={label} className="rounded-xl shadow-sm">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">{icon}{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3"><p className="text-sm leading-relaxed">{value}</p></CardContent>
          </Card>
        ) : null)}
      </div>
      {requisitos.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-primary" />Requisitos Principais
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1.5">
              {requisitos.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="leading-snug">{req}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {!!r.textoSimplificado && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />Texto em Linguagem Simples
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3"><p className="text-sm leading-relaxed whitespace-pre-wrap">{String(r.textoSimplificado)}</p></CardContent>
        </Card>
      )}
      {!!r.observacao && (
        <p className="text-xs text-muted-foreground italic px-1">{String(r.observacao)}</p>
      )}
    </div>
  );
}

function GenericView({ r }: { r: Record<string, unknown> }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="pt-5">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-[600px]">
          {JSON.stringify(r, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

export default function Compartilhado() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shared", token],
    queryFn: () => fetchShared(token),
    retry: false,
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  };

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,67,142,0.08),transparent)]">
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <Link href="/testar">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Testar IA
            </Button>
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1.5 border border-border/50">
            <Share2 className="w-3 h-3" />
            Análise compartilhada
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Carregando análise...</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Link não encontrado</h2>
              <p className="text-sm text-muted-foreground">Esta análise não existe ou foi removida.</p>
            </div>
            <Link href="/testar">
              <Button variant="outline" className="gap-2 rounded-xl">
                <ExternalLink className="w-4 h-4" />
                Fazer nova análise
              </Button>
            </Link>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-800 via-primary to-blue-600 bg-clip-text text-transparent leading-tight">
                {data.title || "Análise de Edital"}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Compartilhado em {new Date(data.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>

            {data.agentId === "simples" ? (
              <SimplesView r={data.resultJson} />
            ) : (
              <GenericView r={data.resultJson} />
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={handleCopy}>
                <Share2 className="w-3.5 h-3.5" />
                Copiar link
              </Button>
              <Link href="/testar">
                <Button size="sm" className="gap-2 rounded-xl">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Analisar outro edital
                </Button>
              </Link>
            </div>

            <p className="text-xs text-muted-foreground text-center pt-4 border-t border-border/40">
              Gerado por Lupa Pública IA — democratizando o acesso à informação pública
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
