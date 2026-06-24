import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListEditalHistory,
  useDeleteEdital,
  useExtractEditalFromUrl,
  useAnalyzeEdital,
  useListAgentHistory,
  useSaveAgentResult,
  useDeleteAgentResult,
  getListEditalHistoryQueryKey,
  getListAgentHistoryQueryKey,
} from "@workspace/api-client-react";
import type { SavedEdital, AgentResultRecord } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  BarChart2,
  Target,
  CalendarDays,
  ClipboardList,
  UserCheck,
  History,
  Trash2,
  ChevronRight,
  X,
  Download,
  Link as LinkIcon,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Info,
  ChevronDown,
  Share2,
  Copy,
} from "lucide-react";
import {
  AGENTS,
  runAgent,
  type AgentId,
  type AgentResult,
  type SimplesResult,
  type AnalistaResult,
  type EstrategicaResult,
  type AcompanhamentoResult,
  type DocumentacaoResult,
  type ElegibilidadeResult,
  type UserProfile,
  type ChecklistItem,
} from "@/lib/agents";

// ── Icon map ────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-5 h-5" />,
  BarChart2: <BarChart2 className="w-5 h-5" />,
  Target: <Target className="w-5 h-5" />,
  CalendarDays: <CalendarDays className="w-5 h-5" />,
  ClipboardList: <ClipboardList className="w-5 h-5" />,
  UserCheck: <UserCheck className="w-5 h-5" />,
};

// ── PDF export ───────────────────────────────────────────────────
async function exportToPDF(element: HTMLElement, title: string) {
  const { default: html2canvas } = await import("html2canvas");
  const { default: jsPDF } = await import("jspdf");
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = margin;
  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;
  while (heightLeft > 0) {
    pdf.addPage();
    position = -(pageHeight - margin * 2) + (imgHeight - heightLeft);
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }
  const filename = title.slice(0, 40).replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, "").trim();
  pdf.save(`${filename || "lupa-publica"}.pdf`);
}

// ── Score Gauge ─────────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const gradient = score >= 70
    ? "from-emerald-950 via-emerald-900 to-slate-900"
    : score >= 40
    ? "from-amber-950 via-slate-900 to-slate-900"
    : "from-red-950 via-slate-900 to-slate-900";
  const label = score >= 70 ? "Alta Oportunidade" : score >= 40 ? "Oportunidade Moderada" : "Baixa Oportunidade";
  const desc = score >= 70
    ? "Requisitos acessíveis, boa clareza — vale a inscrição."
    : score >= 40
    ? "Avalie os requisitos com cuidado antes de se inscrever."
    : "Verifique as exigências — pode ser complexo.";

  return (
    <div className={`flex items-center gap-5 p-4 rounded-2xl bg-gradient-to-r ${gradient} text-white shadow-xl`}>
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle
            cx="55" cy="55" r={radius} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums" style={{ color }}>{score}</span>
          <span className="text-[9px] text-white/40 uppercase tracking-widest font-semibold">/100</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-0.5">Score de Oportunidade</p>
        <p className="text-base font-bold leading-snug" style={{ color }}>{label}</p>
        <p className="text-xs text-white/55 mt-1 leading-relaxed">{desc}</p>
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${score}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Agent Selector ───────────────────────────────────────────────
function AgentSelector({ selected, onSelect }: { selected: AgentId; onSelect: (id: AgentId) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Escolha o agente de análise</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {AGENTS.map((agent) => {
          const isSelected = selected === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              data-testid={`agent-${agent.id}`}
              className={`relative text-left p-3 rounded-xl border transition-all duration-200 group ${
                isSelected
                  ? `${agent.color} border-transparent shadow-md ring-2 ring-offset-1 ${agent.borderColor.replace("border-", "ring-")}`
                  : "bg-card border-border/70 hover:border-primary/30 hover:shadow-sm"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-all ${
                isSelected ? `bg-white/20 ${agent.textColor}` : "bg-muted/70 text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary"
              }`}>
                {ICON_MAP[agent.iconName]}
              </div>
              <p className={`text-xs font-bold leading-tight ${isSelected ? agent.textColor : "text-foreground"}`}>
                {agent.name}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{agent.tagline}</p>
              {isSelected && (
                <span className={`absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse ${agent.textColor.replace("text-", "bg-")}`} />
              )}
            </button>
          );
        })}
      </div>
      {(() => {
        const meta = AGENTS.find((a) => a.id === selected)!;
        return (
          <div className={`flex items-start gap-2 ${meta.color} rounded-xl px-3 py-2 border ${meta.borderColor}`}>
            <Info className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.textColor}`} />
            <p className={`text-xs leading-relaxed ${meta.textColor}`}>{meta.description}</p>
          </div>
        );
      })()}
    </div>
  );
}

// ── Profile Form (Elegibilidade) ─────────────────────────────────
function ProfileForm({ profile, onChange }: { profile: UserProfile; onChange: (p: UserProfile) => void }) {
  return (
    <div className="space-y-3 p-4 rounded-xl bg-teal-50 border border-teal-200">
      <p className="text-xs font-semibold text-teal-700 flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5" />
        Seu perfil (para análise de elegibilidade)
      </p>
      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-teal-800">Escolaridade</label>
          <select
            value={profile.escolaridade}
            onChange={(e) => onChange({ ...profile, escolaridade: e.target.value })}
            className="w-full text-xs rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-teal-400"
          >
            <option value="fundamental">Ensino Fundamental</option>
            <option value="medio">Ensino Médio</option>
            <option value="superior_incompleto">Superior Incompleto</option>
            <option value="superior">Superior Completo</option>
            <option value="pos">Pós-graduação / Mestrado / Doutorado</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-teal-800">Área de atuação / Profissão</label>
          <Input
            value={profile.atuacao}
            onChange={(e) => onChange({ ...profile, atuacao: e.target.value })}
            placeholder="Ex: Estudante de Pedagogia, Agricultor..."
            className="text-xs h-8 border-teal-300 focus:ring-teal-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-teal-800">Município/UF</label>
            <Input
              value={profile.municipio}
              onChange={(e) => onChange({ ...profile, municipio: e.target.value })}
              placeholder="Ex: São Paulo/SP"
              className="text-xs h-8 border-teal-300 focus:ring-teal-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-teal-800">Renda familiar</label>
            <select
              value={profile.rendaFamiliar}
              onChange={(e) => onChange({ ...profile, rendaFamiliar: e.target.value })}
              className="w-full text-xs rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
              <option value="ate1">Até 1 salário mínimo</option>
              <option value="1a3">1 a 3 salários mínimos</option>
              <option value="3a5">3 a 5 salários mínimos</option>
              <option value="acima5">Acima de 5 salários mínimos</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result Panels ────────────────────────────────────────────────

function SimplesPanel({ result }: { result: SimplesResult }) {
  return (
    <div className="space-y-4">
      {/* Score de Oportunidade */}
      {typeof result.scoreOportunidade === "number" && (
        <ScoreGauge score={result.scoreOportunidade} />
      )}

      {/* Categoria badge */}
      {result.categoria && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full border border-primary/20">
            <BarChart2 className="w-3.5 h-3.5" />
            {result.categoria}
          </span>
        </div>
      )}

      {/* Resumo */}
      <Card className="border-none shadow-md bg-primary text-primary-foreground rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4" />Resumo Simplificado</CardTitle></CardHeader>
        <CardContent><p className="leading-relaxed opacity-90 text-sm">{result.resumo}</p></CardContent>
      </Card>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Objetivo", value: result.objetivo, icon: <Target className="w-3.5 h-3.5 text-primary" /> },
          { label: "Público-alvo", value: result.publicoAlvo, icon: <UserCheck className="w-3.5 h-3.5 text-primary" /> },
          { label: "Prazo", value: result.prazo, icon: <Clock className="w-3.5 h-3.5 text-primary" /> },
          { label: "Onde se Inscrever", value: result.ondeInscrever, icon: <FileText className="w-3.5 h-3.5 text-primary" /> },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="rounded-xl shadow-sm">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">{icon}{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3"><p className="text-sm leading-relaxed">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Requisitos */}
      {result.requisitos && result.requisitos.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-primary" />Requisitos Principais
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1.5">
              {result.requisitos.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="leading-snug">{req}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">{result.observacao}</p>
      </div>
    </div>
  );
}

function AnalistaPanel({ result }: { result: AnalistaResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Tipo de Edital", value: result.tipoEdital },
          { label: "Instituição", value: result.instituicao },
          { label: "Prazo(s)", value: result.prazo },
          { label: "Público-alvo", value: result.publicoAlvo },
          { label: "Valor / Benefício", value: result.valor },
        ].map(({ label, value }) => (
          <Card key={label} className="rounded-xl shadow-sm col-span-1">
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-medium leading-snug">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-violet-500" />Requisitos Identificados
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="space-y-1.5">
            {result.requisitos.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-violet-500" />Documentos Necessários
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ul className="space-y-1">
            {result.documentos.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />{d}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EstrategicaPanel({ result }: { result: EstrategicaResult }) {
  const scoreColor = result.score >= 75 ? "text-emerald-600" : result.score >= 50 ? "text-amber-600" : "text-red-500";
  const scoreLabel = result.score >= 75 ? "Boa oportunidade" : result.score >= 50 ? "Oportunidade moderada" : "Avaliar com cautela";
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm border-emerald-100 bg-emerald-50">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="text-center shrink-0">
            <p className={`text-4xl font-black ${scoreColor}`}>{result.score}</p>
            <p className="text-[10px] text-muted-foreground font-medium">/ 100</p>
          </div>
          <div>
            <p className={`text-sm font-bold ${scoreColor}`}>{scoreLabel}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.oportunidade}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="rounded-xl shadow-sm border-emerald-100">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />Vantagens
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1">
              {result.vantagens.map((v, i) => <li key={i} className="text-xs flex items-start gap-1.5"><span className="text-emerald-500 shrink-0 font-bold">+</span>{v}</li>)}
            </ul>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border-amber-100">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />Pontos de Atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1">
              {result.pontosAtencao.map((p, i) => <li key={i} className="text-xs flex items-start gap-1.5"><span className="text-amber-500 shrink-0">!</span>{p}</li>)}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-xl shadow-sm border-red-100">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />Riscos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ul className="space-y-1">
            {result.riscos.map((r, i) => <li key={i} className="text-xs flex items-start gap-1.5"><span className="text-red-400 shrink-0">▸</span>{r}</li>)}
          </ul>
        </CardContent>
      </Card>
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
        <Target className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 leading-relaxed"><strong>Recomendação:</strong> {result.recomendacao}</p>
      </div>
    </div>
  );
}

function AcompanhamentoPanel({ result }: { result: AcompanhamentoResult }) {
  const statusStyle: Record<string, string> = {
    passado: "bg-muted text-muted-foreground border-muted",
    ativo: "bg-amber-50 text-amber-700 border-amber-300",
    futuro: "bg-background text-foreground border-border",
  };
  const dotStyle: Record<string, string> = {
    passado: "bg-muted-foreground",
    ativo: "bg-amber-400 ring-4 ring-amber-100",
    futuro: "bg-border",
  };
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />
        <div className="space-y-3">
          {result.timeline.map((item, i) => (
            <div key={i} className={`relative flex gap-4 p-3 rounded-xl border ${statusStyle[item.status]}`}>
              <div className={`w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center z-10 ${dotStyle[item.status]}`}>
                <span className="text-[10px] font-bold text-white">{i + 1}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.fase}</p>
                <p className="text-xs font-medium opacity-70 mt-0.5">{item.periodo}</p>
                <p className="text-xs mt-1 leading-relaxed opacity-80">{item.descricao}</p>
              </div>
              {item.status === "ativo" && (
                <span className="absolute top-2 right-2 text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full">AGORA</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">{result.observacao}</p>
      </div>
    </div>
  );
}

function DocumentacaoPanel({ result, onCheckToggle }: { result: DocumentacaoResult; onCheckToggle: (i: number) => void }) {
  const obrig = result.checklist.filter((c) => c.obrigatorio);
  const opc = result.checklist.filter((c) => !c.obrigatorio);
  const checked = result.checklist.filter((c) => c.checked).length;
  const pct = Math.round((checked / result.checklist.length) * 100);

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm bg-rose-50 border-rose-100">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="text-center shrink-0">
            <p className="text-3xl font-black text-rose-600">{pct}%</p>
            <p className="text-[10px] text-muted-foreground">concluído</p>
          </div>
          <div className="flex-1">
            <div className="w-full bg-rose-200 rounded-full h-2 mb-1">
              <div className="bg-rose-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-rose-700">{checked} de {result.checklist.length} documentos marcados</p>
          </div>
        </CardContent>
      </Card>

      {obrig.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Obrigatórios ({obrig.length})</p>
          {result.checklist.map((item, i) => !item.obrigatorio ? null : (
            <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.checked ? "bg-rose-50 border-rose-200" : "bg-card border-border hover:bg-muted/40"}`}>
              <input type="checkbox" checked={item.checked} onChange={() => onCheckToggle(i)} className="mt-0.5 accent-rose-500 w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className={`text-sm font-medium ${item.checked ? "line-through text-muted-foreground" : ""}`}>{item.doc}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.observacao}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {opc.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opcionais / Conforme Perfil ({opc.length})</p>
          {result.checklist.map((item, i) => item.obrigatorio ? null : (
            <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.checked ? "bg-rose-50 border-rose-200" : "bg-card border-border hover:bg-muted/40"}`}>
              <input type="checkbox" checked={item.checked} onChange={() => onCheckToggle(i)} className="mt-0.5 accent-rose-500 w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className={`text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>{item.doc}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.observacao}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
        <p className="text-xs text-rose-700">{result.dica}</p>
      </div>
    </div>
  );
}

function ElegibilidadePanel({ result }: { result: ElegibilidadeResult }) {
  const scoreColor = result.score >= 75 ? "text-teal-600" : result.score >= 50 ? "text-amber-600" : "text-red-500";
  const barColor = result.score >= 75 ? "bg-teal-500" : result.score >= 50 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm bg-teal-50 border-teal-100">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-center shrink-0">
              <p className={`text-4xl font-black ${scoreColor}`}>{result.score}%</p>
              <p className="text-[10px] text-muted-foreground">aderência</p>
            </div>
            <div className="flex-1">
              <div className="w-full bg-teal-200 rounded-full h-3 mb-2">
                <div className={`${barColor} h-3 rounded-full transition-all`} style={{ width: `${result.score}%` }} />
              </div>
              <p className="text-xs text-teal-700 leading-relaxed">{result.recomendacao}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Critérios analisados</p>
        {result.criterios.map((c, i) => {
          const icon = c.atende === true
            ? <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
            : c.atende === "parcial"
            ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            : <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
          const bg = c.atende === true ? "bg-teal-50 border-teal-100" : c.atende === "parcial" ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100";
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}>
              <div className="mt-0.5">{icon}</div>
              <div>
                <p className="text-sm font-medium">{c.criterio}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.observacao}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5" />Próximos Passos
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ol className="space-y-1.5">
            {result.proximosPassos.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                {p}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentResultPanel({
  result,
  onCheckToggle,
  printRef,
}: {
  result: AgentResult;
  onCheckToggle: (i: number) => void;
  printRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={printRef} className="bg-background animate-in fade-in slide-in-from-bottom-4 duration-400">
      {result.type === "simples" && <SimplesPanel result={result} />}
      {result.type === "analista" && <AnalistaPanel result={result} />}
      {result.type === "estrategica" && <EstrategicaPanel result={result} />}
      {result.type === "acompanhamento" && <AcompanhamentoPanel result={result} />}
      {result.type === "documentacao" && <DocumentacaoPanel result={result} onCheckToggle={onCheckToggle} />}
      {result.type === "elegibilidade" && <ElegibilidadePanel result={result} />}
    </div>
  );
}

// ── History Panel ────────────────────────────────────────────────
type DateFilter = "todos" | "hoje" | "semana" | "mes";

type UnifiedItem =
  | { kind: "agent"; data: AgentResultRecord }
  | { kind: "legacy"; data: SavedEdital };

const AGENT_BADGE: Record<string, { label: string; color: string }> = {
  simples:        { label: "Simples",        color: "bg-blue-100 text-blue-700" },
  analista:       { label: "Analista",       color: "bg-violet-100 text-violet-700" },
  estrategica:    { label: "Estratégica",    color: "bg-emerald-100 text-emerald-700" },
  acompanhamento: { label: "Acompanhamento", color: "bg-amber-100 text-amber-700" },
  documentacao:   { label: "Documentação",   color: "bg-rose-100 text-rose-700" },
  elegibilidade:  { label: "Elegibilidade",  color: "bg-teal-100 text-teal-700" },
};

function HistoryPanel({
  onSelect,
  onSelectAgent,
  onClose,
}: {
  onSelect: (item: SavedEdital) => void;
  onSelectAgent: (item: AgentResultRecord) => void;
  onClose: () => void;
}) {
  const { data: agentHistory, isLoading: agentLoading } = useListAgentHistory();
  const { data: legacyHistory, isLoading: legacyLoading } = useListEditalHistory();
  const deleteAgentResult = useDeleteAgentResult();
  const deleteEdital = useDeleteEdital();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("todos");

  const isLoading = agentLoading || legacyLoading;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const unified = useMemo<UnifiedItem[]>(() => {
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sow = new Date(sod); sow.setDate(sod.getDate() - sod.getDay());
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    const q = search.toLowerCase().trim();

    const matchDate = (d: string) => {
      const dt = new Date(d);
      if (dateFilter === "hoje") return dt >= sod;
      if (dateFilter === "semana") return dt >= sow;
      if (dateFilter === "mes") return dt >= som;
      return true;
    };

    const agentItems: UnifiedItem[] = (agentHistory ?? [])
      .filter((i) => matchDate(i.createdAt) && (!q || i.title.toLowerCase().includes(q)))
      .map((i) => ({ kind: "agent", data: i }));

    const legacyItems: UnifiedItem[] = (legacyHistory ?? [])
      .filter((i) => matchDate(i.createdAt) && (!q || i.title.toLowerCase().includes(q) || i.resumo.toLowerCase().includes(q)))
      .map((i) => ({ kind: "legacy", data: i }));

    return [...agentItems, ...legacyItems].sort(
      (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime()
    );
  }, [agentHistory, legacyHistory, search, dateFilter]);

  const handleDeleteAgent = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteAgentResult.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentHistoryQueryKey() });
        toast({ title: "Removido", description: "Análise removida do histórico." });
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" }),
    });
  };

  const handleDeleteLegacy = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteEdital.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEditalHistoryQueryKey() });
        toast({ title: "Removido", description: "Edital removido do histórico." });
      },
      onError: () => toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" }),
    });
  };

  const handleExportCSV = () => {
    if (unified.length === 0) {
      toast({ title: "Nada para exportar", description: "O histórico está vazio.", variant: "destructive" });
      return;
    }
    const headers = ["Data", "Agente", "Título", "Texto (início)"];
    const rows = unified.map((item) => {
      const date = new Date(item.data.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const agente = item.kind === "agent" ? (AGENT_BADGE[item.data.agentId]?.label ?? item.data.agentId) : "Simples (legado)";
      const titulo = item.data.title;
      const texto = item.data.originalText.slice(0, 120).replace(/\n/g, " ");
      return [date, agente, titulo, texto];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-lupa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado!", description: `${unified.length} análise(s) baixadas.` });
  };

  const totalCount = (agentHistory?.length ?? 0) + (legacyHistory?.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 h-full w-full max-w-md bg-background shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><History className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-lg font-semibold">Histórico de Análises</h2>
              <p className="text-xs text-muted-foreground">{isLoading ? "Carregando..." : `${totalCount} análise(s) salva(s)`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs rounded-lg" onClick={handleExportCSV} disabled={isLoading || totalCount === 0}>
              <Download className="w-3.5 h-3.5" />CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
        </div>

        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar por título..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["todos", "hoje", "semana", "mes"] as DateFilter[]).map((f) => (
              <button key={f} onClick={() => setDateFilter(f)} className={`text-xs px-3 py-1 rounded-full border transition-all ${dateFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {{ todos: "Todos", hoje: "Hoje", semana: "Semana", mes: "Mês" }[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          {!isLoading && unified.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><History className="w-7 h-7 text-muted-foreground" /></div>
              <p className="text-base font-medium mb-1">Nenhuma análise salva</p>
              <p className="text-sm text-muted-foreground max-w-[240px]">Após analisar um edital, clique em <strong>"Salvar análise"</strong> para guardá-la aqui.</p>
            </div>
          )}
          {unified.map((item) => {
            if (item.kind === "agent") {
              const badge = AGENT_BADGE[item.data.agentId] ?? { label: item.data.agentId, color: "bg-muted text-muted-foreground" };
              return (
                <button key={`agent-${item.data.id}`} onClick={() => onSelectAgent(item.data)} className="w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/5 hover:border-primary/20 transition-all group">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                      </div>
                      <p className="text-sm font-medium truncate pr-2">{item.data.title}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(item.data.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10" onClick={(e) => handleDeleteAgent(item.data.id, e)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </div>
                </button>
              );
            }
            return (
              <button key={`legacy-${item.data.id}`} onClick={() => onSelect(item.data)} className="w-full text-left p-4 rounded-xl border bg-card hover:bg-accent/5 hover:border-primary/20 transition-all group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Simples (legado)</span>
                    </div>
                    <p className="text-sm font-medium truncate pr-2">{item.data.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.data.resumo}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(item.data.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10" onClick={(e) => handleDeleteLegacy(item.data.id, e)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function TestarIA() {
  const [text, setText] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [activeTab, setActiveTab] = useState("texto");
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("simples");
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [checklistState, setChecklistState] = useState<ChecklistItem[]>([]);
  const [profile, setProfile] = useState<UserProfile>({ escolaridade: "superior", atuacao: "", municipio: "", rendaFamiliar: "1a3" });
  const [showHistory, setShowHistory] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savedThisResult, setSavedThisResult] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareLink, setShowShareLink] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const printRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const extractUrlMutation = useExtractEditalFromUrl();
  const analyzeEditalMutation = useAnalyzeEdital();
  const saveAgentResultMutation = useSaveAgentResult();
  const queryClient = useQueryClient();

  const currentAgentMeta = AGENTS.find((a) => a.id === selectedAgent)!;
  const isAnalyzing = analyzeEditalMutation.isPending;

  const applyResult = (result: AgentResult) => {
    setAgentResult(result);
    if (result.type === "documentacao") setChecklistState(result.checklist);
  };

  const handleAnalyze = () => {
    if (!text.trim() || text.length < 20) {
      toast({ title: "Atenção", description: "Insira um texto de edital válido (mínimo 20 caracteres).", variant: "destructive" });
      return;
    }
    setAgentResult(null);
    setSavedThisResult(false);

    analyzeEditalMutation.mutate(
      {
        data: {
          agentId: selectedAgent,
          text,
          ...(selectedAgent === "elegibilidade" ? { profile } : {}),
        },
      },
      {
        onSuccess: (data) => {
          applyResult(data as unknown as AgentResult);
        },
        onError: () => {
          // Fallback: run local keyword-based simulation
          try {
            const result = runAgent(selectedAgent, text, profile);
            applyResult(result);
            toast({
              title: "Análise simulada",
              description: "IA temporariamente indisponível. Usando análise por palavras-chave.",
            });
          } catch {
            toast({ title: "Erro", description: "Não foi possível processar o texto.", variant: "destructive" });
          }
        },
      }
    );
  };

  const handleCheckToggle = (index: number) => {
    setChecklistState((prev) => {
      const next = prev.map((item, i) => i === index ? { ...item, checked: !item.checked } : item);
      if (agentResult?.type === "documentacao") {
        setAgentResult({ ...agentResult, checklist: next });
      }
      return next;
    });
  };

  const handlePdfUpload = async (file: File) => {
    setIsPdfLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
      const res = await fetch(`${BASE}/api/edital/extract-pdf`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Erro ao extrair PDF");
      }
      const { text: extracted } = await res.json() as { text: string };
      if (!extracted?.trim()) throw new Error("Nenhum texto encontrado no PDF");
      setText(extracted.trim());
      setActiveTab("pdf");
      setAgentResult(null);
      setShareToken(null);
      setShowShareLink(false);
      toast({ title: "PDF lido com sucesso", description: "Revise o texto extraído e clique em Analisar." });
    } catch (err) {
      toast({
        title: "Erro ao ler PDF",
        description: err instanceof Error ? err.message : "Verifique se o PDF contém texto (não é uma imagem escaneada).",
        variant: "destructive",
      });
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleExtractUrl = () => {
    if (!urlInput.trim()) { toast({ title: "Atenção", description: "Insira uma URL válida.", variant: "destructive" }); return; }
    extractUrlMutation.mutate({ data: { url: urlInput } }, {
      onSuccess: (data) => {
        setText(data.text);
        setActiveTab("texto");
        setAgentResult(null);
        toast({ title: "Texto extraído", description: "Revise o texto e clique em Analisar." });
      },
      onError: () => toast({ title: "Erro de extração", description: "Não foi possível extrair o texto desta URL.", variant: "destructive" }),
    });
  };

  const handleHistorySelect = (item: SavedEdital) => {
    setText(item.originalText);
    setSelectedAgent("simples");
    setAgentResult({ type: "simples", scoreOportunidade: 0, categoria: "Edital Público", resumo: item.resumo, objetivo: item.objetivo, publicoAlvo: item.quemPodeParticipar, prazo: item.prazoInscricao, requisitos: [], ondeInscrever: item.ondeSeInscrever, observacao: "Resultado carregado do histórico salvo." });
    setSavedThisResult(true);
    setShowHistory(false);
  };

  const handleAgentHistorySelect = (item: AgentResultRecord) => {
    setText(item.originalText);
    setSelectedAgent(item.agentId as AgentId);
    const parsed = item.resultJson as unknown as AgentResult;
    applyResult(parsed);
    setSavedThisResult(true);
    setShowHistory(false);
  };

  const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

  const handleShare = async () => {
    if (!agentResult) return;
    setIsSharing(true);
    try {
      const title = agentResult.type === "simples"
        ? (agentResult as { resumo?: string }).resumo?.slice(0, 60) ?? "Edital"
        : "Análise de Edital";
      const res = await fetch(`${BASE}/api/edital/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agentResult.type, title, resultJson: agentResult }),
      });
      if (!res.ok) throw new Error();
      const { token } = await res.json() as { token: string };
      setShareToken(token);
      setShowShareLink(true);
    } catch {
      toast({ title: "Erro", description: "Não foi possível gerar o link.", variant: "destructive" });
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!shareToken) return;
    const base = import.meta.env.BASE_URL as string;
    const url = `${window.location.origin}${base.replace(/\/$/, "")}/compartilhado/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copiado!", description: "Cole em qualquer lugar para compartilhar." });
    }).catch(() => {});
  };

  const handleSaveAgent = () => {
    if (!agentResult || !text.trim()) return;
    const title = text.trim().slice(0, 80).replace(/\n/g, " ") + ` [${currentAgentMeta.name}]`;
    saveAgentResultMutation.mutate(
      { data: { agentId: selectedAgent, title, originalText: text, resultJson: agentResult as unknown as Record<string, unknown> } },
      {
        onSuccess: () => {
          setSavedThisResult(true);
          queryClient.invalidateQueries({ queryKey: getListAgentHistoryQueryKey() });
          toast({ title: "Análise salva!", description: "Disponível no Histórico de Análises." });
        },
        onError: () => toast({ title: "Erro", description: "Não foi possível salvar a análise.", variant: "destructive" }),
      }
    );
  };

  const handleExportPDF = async () => {
    if (!printRef.current || !agentResult) return;
    setIsExporting(true);
    try {
      await exportToPDF(printRef.current, `lupa-${selectedAgent}`);
    } catch {
      toast({ title: "Erro", description: "Não foi possível gerar o PDF.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,67,142,0.08),transparent)]">
      {showHistory && <HistoryPanel onSelect={handleHistorySelect} onSelectAgent={handleAgentHistorySelect} onClose={() => setShowHistory(false)} />}

      <main className="container mx-auto px-4 py-8 max-w-7xl flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-800 via-primary to-blue-600 bg-clip-text text-transparent">
              Teste a Inteligência Artificial
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Agentes especializados para simplificar, extrair indicadores, acompanhar prazos e verificar elegibilidade de qualquer edital público.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 rounded-xl shrink-0 border-primary/20 hover:bg-primary/5" onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline font-medium">Histórico</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ── Left Column ── */}
          <section className="flex flex-col gap-5">
            {/* Agent selector */}
            <AgentSelector selected={selectedAgent} onSelect={(id) => { setSelectedAgent(id); setAgentResult(null); }} />

            {/* Profile form for Elegibilidade */}
            {selectedAgent === "elegibilidade" && (
              <ProfileForm profile={profile} onChange={setProfile} />
            )}

            {/* Text / URL / PDF input */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-3 bg-muted/60">
                <TabsTrigger value="texto">Colar Texto</TabsTrigger>
                <TabsTrigger value="url">Usar URL</TabsTrigger>
                <TabsTrigger value="pdf">Ler PDF</TabsTrigger>
              </TabsList>
              <TabsContent value="texto">
                <Textarea
                  placeholder="Cole aqui o texto do edital que deseja analisar..."
                  className="min-h-[280px] resize-y text-sm p-4 rounded-2xl border-border/60 bg-card/80 shadow-sm focus-visible:ring-primary/30 focus-visible:border-primary/40"
                  value={text}
                  onChange={(e) => { setText(e.target.value); setAgentResult(null); setShareToken(null); setShowShareLink(false); }}
                  disabled={isAnalyzing}
                  data-testid="input-edital-text"
                />
                {text && (
                  <p className="text-xs text-muted-foreground mt-1.5 text-right">{text.length} caracteres</p>
                )}
              </TabsContent>
              <TabsContent value="url">
                <Card className="border-border shadow-sm">
                  <CardContent className="pt-5 pb-5 flex flex-col gap-4">
                    <div className="space-y-2">
                      <label htmlFor="url-input" className="text-sm font-medium">URL Pública do Edital</label>
                      <div className="flex gap-2">
                        <Input id="url-input" placeholder="https://exemplo.gov.br/edital..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="flex-1" />
                        <Button onClick={handleExtractUrl} disabled={extractUrlMutation.isPending}>
                          {extractUrlMutation.isPending ? <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                          Extrair
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">O link deve ser acessível publicamente (sem login).</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="pdf">
                <Card className="border-border shadow-sm">
                  <CardContent className="pt-5 pb-5 flex flex-col gap-4">
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Arquivo PDF do Edital</label>
                      <div
                        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
                          isPdfLoading ? "border-primary/30 bg-primary/5" : "border-border/60 hover:border-primary/40 hover:bg-primary/5"
                        } cursor-pointer`}
                        onClick={() => !isPdfLoading && document.getElementById("pdf-input")?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files[0];
                          if (file?.type === "application/pdf") handlePdfUpload(file);
                        }}
                      >
                        <input
                          id="pdf-input"
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePdfUpload(file);
                            e.target.value = "";
                          }}
                        />
                        {isPdfLoading ? (
                          <>
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground">Extraindo texto do PDF...</p>
                          </>
                        ) : (
                          <>
                            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                            <p className="text-sm font-medium mb-1">Clique ou arraste o PDF aqui</p>
                            <p className="text-xs text-muted-foreground">PDF até 20 MB — o texto será extraído automaticamente</p>
                          </>
                        )}
                      </div>
                      {text && activeTab === "pdf" && (
                        <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Texto extraído com sucesso ({text.length} caracteres). Revise e clique em Analisar.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className={`rounded-xl h-12 px-6 text-sm font-semibold shadow-sm flex-1 sm:flex-none ${currentAgentMeta.textColor.replace("text-", "bg-").replace("-600", "-600")} text-white hover:opacity-90`}
                style={{}}
                onClick={handleAnalyze}
                disabled={isAnalyzing || !text.trim()}
                data-testid="button-analyze"
              >
                {isAnalyzing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Analisando...</>
                ) : (
                  <>{ICON_MAP[currentAgentMeta.iconName] && <span className="mr-2 opacity-90">{ICON_MAP[currentAgentMeta.iconName]}</span>}Analisar com {currentAgentMeta.name}</>
                )}
              </Button>

              {agentResult && !isAnalyzing && (
                <>
                  <Button size="lg" variant="outline" className="rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in" onClick={handleExportPDF} disabled={isExporting}>
                    {isExporting ? <><div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />PDF...</> : <><Download className="w-4 h-4" />Exportar PDF</>}
                  </Button>
                  <Button
                    size="lg"
                    variant={savedThisResult ? "ghost" : "outline"}
                    className={`rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in ${savedThisResult ? "text-emerald-600 border-emerald-200 bg-emerald-50" : ""}`}
                    onClick={handleSaveAgent}
                    disabled={savedThisResult || saveAgentResultMutation.isPending}
                  >
                    {saveAgentResultMutation.isPending ? (
                      <><div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />Salvando...</>
                    ) : savedThisResult ? (
                      <><Sparkles className="w-4 h-4" />Salvo</>
                    ) : (
                      <><History className="w-4 h-4" />Salvar análise</>
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl h-12 px-5 text-sm gap-2 animate-in fade-in border-primary/20 hover:bg-primary/5"
                    onClick={showShareLink ? handleCopyShareLink : handleShare}
                    disabled={isSharing}
                  >
                    {isSharing ? (
                      <><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />Gerando...</>
                    ) : showShareLink ? (
                      <><Copy className="w-4 h-4 text-primary" />Copiar link</>
                    ) : (
                      <><Share2 className="w-4 h-4 text-primary" />Compartilhar</>
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Agent description banner */}
            {!agentResult && !isAnalyzing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl p-3 border border-border/50">
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                <span>Cole o texto do edital, escolha o agente e clique em <strong>Analisar</strong> para ver o resultado.</span>
              </div>
            )}
          </section>

          {/* ── Right Column: Results ── */}
          <section className="relative min-h-[500px]">
            {!agentResult && !isAnalyzing && (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-border rounded-3xl bg-muted/20">
                <div className={`w-16 h-16 mb-5 rounded-2xl ${currentAgentMeta.color} ${currentAgentMeta.textColor} flex items-center justify-center`}>
                  <span className="scale-150">{ICON_MAP[currentAgentMeta.iconName]}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{currentAgentMeta.name}</h3>
                <p className="text-sm text-muted-foreground max-w-[280px]">{currentAgentMeta.description}</p>
                <Badge variant="outline" className={`mt-4 ${currentAgentMeta.textColor} border-current`}>
                  Aguardando análise
                </Badge>
              </div>
            )}

            {isAnalyzing && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground font-medium">{currentAgentMeta.name} está analisando o edital...</p>
                </div>
                <Skeleton className="h-28 w-full rounded-2xl" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-24 rounded-xl" />
                </div>
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            )}

            {agentResult && !isAnalyzing && (
              <AgentResultPanel result={agentResult} onCheckToggle={handleCheckToggle} printRef={printRef} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
