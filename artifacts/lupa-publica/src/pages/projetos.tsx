/**
 * @file projetos.tsx
 * @description Módulo Projetos do NIASci — assistente de projetos de pesquisa.
 *
 * Objetivo do componente:
 *   Página dual: permite ao usuário (1) descrever um projeto de pesquisa e
 *   receber um plano completo gerado por IA, e (2) gerenciar seus projetos
 *   salvos com etapas, prazos e controle de progresso.
 *
 * Fluxo de execução:
 *   Modo IA: usuário descreve o projeto → POST /api/niasci/projetos/analyze
 *          → AIService gera plano completo → resultado exibido em abas
 *   Modo CRUD: projetos salvos em localStorage com etapas editáveis
 *
 * Integração com AIService:
 *   - analyzeProject() chamada via backend → nunca diretamente OpenAI
 *
 * Integração com Supabase:
 *   - saveResearchProject(): persiste projetos gerados por IA
 *   - listResearchProjects(): carrega histórico de projetos
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  saveResearchProject,
  listResearchProjects,
  deleteResearchProject,
} from "@/services/analisesService";
import type { ResearchProject } from "@/lib/supabase-types";
import {
  API_BASE,
  NiasciHeader,
  AnalysisProgress,
  HistoryPanel,
  ExportButton,
  getFriendlyErrorMessage,
  type AnalysisStage,
} from "@/lib/niasci-utils";
import {
  Target, Users, Calendar, Layers, BarChart2, AlertTriangle,
  ListChecks, ArrowRight, Sparkles, AlertCircle, Loader2,
  Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2, Clock,
  Circle, FolderKanban,
} from "lucide-react";

// ── Tipos locais ─────────────────────────────────────────────────────────────

/**
 * Plano de projeto gerado pela IA.
 * Cobre todos os componentes de gestão de projetos científicos.
 */
interface ProjetoResult {
  titulo?: string;
  resumo?: string;
  objetivos?: string[];
  equipe?: { papel: string; responsabilidades: string }[];
  cronograma?: { fase: string; duracao: string; descricao: string }[];
  etapas?: { nome: string; descricao: string; entregavel: string }[];
  indicadores?: { nome: string; meta: string; metodologia: string }[];
  riscos?: { risco: string; probabilidade: string; mitigacao: string }[];
  pendencias?: string[];
  proximasAcoes?: string[];
  alertas?: string[];
}

/**
 * Projeto salvo pelo usuário no gerenciador local.
 * Cada projeto tem etapas com controle de progresso.
 */
interface LocalProject {
  id: string;
  title: string;
  objective: string;
  description: string;
  status: "planejamento" | "em andamento" | "concluído" | "pausado";
  startDate: string;
  endDate: string;
  stages: LocalStage[];
  createdAt: string;
}

/**
 * Etapa individual de um projeto com controle de status.
 */
interface LocalStage {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: "pendente" | "em andamento" | "concluída";
}

// ── Estágios de análise da IA ─────────────────────────────────────────────────
const STAGES = [
  { key: "reading",    label: "Analisando descrição",      description: "Interpretando o escopo e objetivos do projeto." },
  { key: "extracting", label: "Estruturando componentes",  description: "Montando equipe, cronograma, etapas e indicadores." },
  { key: "finalizing", label: "Identificando riscos",      description: "Gerando análise de riscos e próximas ações." },
];

// ── Chave localStorage para projetos manuais ──────────────────────────────────
const LOCAL_KEY = "niasci-projetos-v1";

function loadLocalProjects(): LocalProject[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"); }
  catch { return []; }
}

function saveLocalProjects(projects: LocalProject[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Projetos() {
  const { toast } = useToast();

  // Estado da seção de geração por IA
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<ProjetoResult | null>(null);

  // Histórico de projetos gerados por IA (Supabase/localStorage)
  const [aiHistory, setAiHistory] = useState<ResearchProject[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Gerenciador local de projetos
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Formulário de novo projeto local
  const [newProjectForm, setNewProjectForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newObjective, setNewObjective] = useState("");

  // Abas da página (gerador IA | meus projetos)
  const [pageTab, setPageTab] = useState<"ia" | "projetos">("ia");

  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Carrega histórico de projetos gerados por IA
    listResearchProjects()
      .then((items) => setAiHistory(items))
      .catch(() => setAiHistory([]))
      .finally(() => setHistoryLoading(false));

    // Carrega projetos do gerenciador local
    setLocalProjects(loadLocalProjects());
  }, []);

  useEffect(() => {
    return () => { if (stageTimerRef.current) clearInterval(stageTimerRef.current); };
  }, []);

  const startStageAnimation = () => {
    let current = 0;
    const keys = STAGES.map((s) => s.key) as AnalysisStage[];
    setStage(keys[0]);
    stageTimerRef.current = setInterval(() => {
      current++;
      if (current < keys.length) setStage(keys[current]);
      else if (stageTimerRef.current) clearInterval(stageTimerRef.current);
    }, 4000);
  };

  /**
   * Gera plano de projeto via IA.
   *
   * Fluxo:
   * 1. Valida descrição mínima
   * 2. Inicia animação de estágios
   * 3. Chama POST /api/niasci/projetos/analyze
   * 4. Salva resultado via saveResearchProject()
   * 5. Exibe resultado em abas
   */
  const handleGenerate = async () => {
    if (description.trim().length < 30) {
      toast({ title: "Descrição muito curta", description: "Descreva o projeto com pelo menos 30 caracteres.", variant: "destructive" });
      return;
    }

    setResult(null);
    setErrorMessage("");
    startStageAnimation();

    try {
      const response = await fetch(`${API_BASE}/niasci/projetos/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${response.status}`);
      }

      const data: ProjetoResult = await response.json();

      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      // Persiste no Supabase ou localStorage
      const saved = await saveResearchProject({
        title: data.titulo ?? "Projeto sem título",
        description: data.resumo ?? "",
        team: (data.equipe ?? []) as any,
        timeline: (data.cronograma ?? []) as any,
      });

      setAiHistory((prev) => [saved as ResearchProject, ...prev].slice(0, 20));
      toast({ title: "Plano gerado!", description: "O plano do projeto está pronto." });
    } catch (err) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      const msg = getFriendlyErrorMessage(err);
      setStage("error");
      setErrorMessage(msg);
      toast({ title: "Erro ao gerar plano", description: msg, variant: "destructive" });
    }
  };

  const handleHistorySelect = (item: ResearchProject) => {
    const r = (item as any)?.metadata?.result ?? item;
    if (r.objetivos || r.cronograma) {
      setResult(r as ProjetoResult);
      setStage("completed");
      toast({ title: "Plano restaurado", description: "Resultado carregado do histórico." });
    }
  };

  const handleHistoryDelete = async (id: string) => {
    await deleteResearchProject(id);
    setAiHistory((prev) => prev.filter((p) => p.id !== id));
  };

  const buildExportSections = () => {
    if (!result) return [];
    return [
      { title: "Título", content: result.titulo ?? "" },
      { title: "Resumo", content: result.resumo ?? "" },
      { title: "Objetivos", content: (result.objetivos ?? []).join("\n") },
      { title: "Equipe", content: (result.equipe ?? []).map((e) => `${e.papel}: ${e.responsabilidades}`).join("\n") },
      { title: "Cronograma", content: (result.cronograma ?? []).map((c) => `${c.fase} (${c.duracao}): ${c.descricao}`).join("\n") },
      { title: "Etapas", content: (result.etapas ?? []).map((e) => `${e.nome}: ${e.descricao} → ${e.entregavel}`).join("\n") },
      { title: "Indicadores", content: (result.indicadores ?? []).map((i) => `${i.nome}: ${i.meta} (${i.metodologia})`).join("\n") },
      { title: "Riscos", content: (result.riscos ?? []).map((r) => `[${r.probabilidade}] ${r.risco}: ${r.mitigacao}`).join("\n") },
      { title: "Pendências", content: (result.pendencias ?? []).join("\n") },
      { title: "Próximas Ações", content: (result.proximasAcoes ?? []).join("\n") },
    ];
  };

  // ── Gerenciador local de projetos ──────────────────────────────────────────

  /** Cria um novo projeto local com os dados do formulário. */
  const createLocalProject = () => {
    if (!newTitle.trim()) return;
    const project: LocalProject = {
      id: crypto.randomUUID(),
      title: newTitle,
      objective: newObjective,
      description: "",
      status: "planejamento",
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      stages: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [project, ...localProjects];
    setLocalProjects(updated);
    saveLocalProjects(updated);
    setNewTitle("");
    setNewObjective("");
    setNewProjectForm(false);
    setExpandedProject(project.id);
    toast({ title: "Projeto criado!", description: "Adicione etapas para acompanhar o progresso." });
  };

  /** Remove um projeto local pelo ID. */
  const deleteLocalProject = (id: string) => {
    const updated = localProjects.filter((p) => p.id !== id);
    setLocalProjects(updated);
    saveLocalProjects(updated);
    if (expandedProject === id) setExpandedProject(null);
  };

  /** Adiciona uma etapa vazia ao projeto especificado. */
  const addStage = (projectId: string) => {
    const updated = localProjects.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        stages: [...p.stages, {
          id: crypto.randomUUID(),
          name: "Nova etapa",
          description: "",
          deadline: "",
          status: "pendente" as const,
        }],
      };
    });
    setLocalProjects(updated);
    saveLocalProjects(updated);
  };

  /** Avança o status de uma etapa no ciclo: pendente → em andamento → concluída → pendente. */
  const cycleStageStatus = (projectId: string, stageId: string) => {
    const cycle: LocalStage["status"][] = ["pendente", "em andamento", "concluída"];
    const updated = localProjects.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        stages: p.stages.map((s) => {
          if (s.id !== stageId) return s;
          const next = cycle[(cycle.indexOf(s.status) + 1) % 3];
          return { ...s, status: next };
        }),
      };
    });
    setLocalProjects(updated);
    saveLocalProjects(updated);
  };

  /** Atualiza o nome de uma etapa. */
  const updateStageName = (projectId: string, stageId: string, name: string) => {
    const updated = localProjects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, stages: p.stages.map((s) => s.id === stageId ? { ...s, name } : s) };
    });
    setLocalProjects(updated);
    saveLocalProjects(updated);
  };

  /** Remove uma etapa do projeto. */
  const deleteStage = (projectId: string, stageId: string) => {
    const updated = localProjects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, stages: p.stages.filter((s) => s.id !== stageId) };
    });
    setLocalProjects(updated);
    saveLocalProjects(updated);
  };

  /** Calcula o percentual de progresso de um projeto com base nas etapas concluídas. */
  const calcProgress = (project: LocalProject) => {
    if (project.stages.length === 0) return 0;
    return Math.round((project.stages.filter((s) => s.status === "concluída").length / project.stages.length) * 100);
  };

  const isLoading = stage !== "idle" && stage !== "completed" && stage !== "error";

  const statusIcon = (s: LocalStage["status"]) => {
    if (s === "concluída") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (s === "em andamento") return <Clock className="w-4 h-4 text-amber-500" />;
    return <Circle className="w-4 h-4 text-muted-foreground/40" />;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <NiasciHeader
        module="Projetos"
        moduleColor="text-violet-600 dark:text-violet-400"
        title="Projetos de Pesquisa"
        description="Descreva sua ideia de pesquisa e a IA gera um plano completo com objetivos, equipe, cronograma, indicadores e análise de riscos. Ou gerencie seus projetos existentes com controle de etapas e progresso."
      />

      {/* Alternador entre seções da página */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={pageTab === "ia" ? "default" : "outline"}
          size="sm"
          onClick={() => setPageTab("ia")}
          className="gap-2"
        >
          <Sparkles className="w-4 h-4" /> Gerar com IA
        </Button>
        <Button
          variant={pageTab === "projetos" ? "default" : "outline"}
          size="sm"
          onClick={() => setPageTab("projetos")}
          className="gap-2"
        >
          <FolderKanban className="w-4 h-4" /> Meus Projetos
          {localProjects.length > 0 && (
            <Badge className="ml-1 py-0 px-1.5 text-xs">{localProjects.length}</Badge>
          )}
        </Button>
      </div>

      {/* ── Seção: Gerador com IA ── */}
      {pageTab === "ia" && (
        <>
          <HistoryPanel
            items={aiHistory}
            onSelect={handleHistorySelect}
            onDelete={handleHistoryDelete}
            getLabel={(p) => p.title ?? "Projeto sem título"}
            isLoading={historyLoading}
            accentBg="bg-violet-500/10"
          />

          {/* Textarea de descrição do projeto */}
          <div className="mb-6">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Descreva seu projeto de pesquisa
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Projeto de pesquisa sobre uso de machine learning para diagnóstico precoce de diabetes em populações rurais do Brasil. Equipe de 3 pesquisadores, duração de 18 meses, financiamento via CNPq..."
              rows={6}
              className="w-full px-4 py-3 rounded-2xl border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
            />
            {description && (
              <p className="text-xs text-muted-foreground/40 mt-1 text-right">{description.length} caracteres</p>
            )}
            <div className="mt-3">
              <Button
                onClick={handleGenerate}
                disabled={isLoading || description.trim().length < 30}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isLoading ? "Gerando plano…" : "Gerar plano de projeto"}
              </Button>
            </div>
          </div>

          <AnalysisProgress
            stage={stage}
            stages={STAGES}
            accentColor="text-violet-500"
            errorMessage={errorMessage}
          />

          {/* Resultados do plano gerado */}
          {result && stage === "completed" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  <h2 className="text-lg font-bold">{result.titulo ?? "Plano de projeto"}</h2>
                </div>
                <ExportButton filename={`projeto-${result.titulo ?? "plano"}`} sections={buildExportSections()} />
              </div>

              {result.resumo && (
                <Card className="mb-4 border-violet-500/20 bg-violet-500/5">
                  <CardContent className="pt-4">
                    <p className="text-sm leading-7">{result.resumo}</p>
                  </CardContent>
                </Card>
              )}

              <Tabs defaultValue="objetivos" className="space-y-4">
                <TabsList className="flex flex-wrap gap-1 h-auto">
                  <TabsTrigger value="objetivos">Objetivos</TabsTrigger>
                  <TabsTrigger value="equipe">Equipe</TabsTrigger>
                  <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
                  <TabsTrigger value="etapas">Etapas</TabsTrigger>
                  <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
                  <TabsTrigger value="riscos">Riscos</TabsTrigger>
                  <TabsTrigger value="acoes">Próximas Ações</TabsTrigger>
                  {(result.alertas?.length ?? 0) > 0 && <TabsTrigger value="alertas">Alertas</TabsTrigger>}
                </TabsList>

                <TabsContent value="objetivos">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-violet-500" /> Objetivos</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {(result.objetivos ?? []).map((o, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-violet-500 font-bold shrink-0">{i === 0 ? "◈" : "◦"}</span>
                            <span className={i === 0 ? "font-semibold" : ""}>{o}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="equipe">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-violet-500" /> Equipe sugerida</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(result.equipe ?? []).map((e, i) => (
                          <div key={i} className="flex gap-3">
                            <Badge variant="outline" className="shrink-0 text-violet-600 border-violet-500/30 h-fit">{e.papel}</Badge>
                            <p className="text-sm text-foreground/80">{e.responsabilidades}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="cronograma">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-500" /> Cronograma por fases</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(result.cronograma ?? []).map((c, i) => (
                          <div key={i} className="flex gap-4">
                            <div className="shrink-0 text-right w-24">
                              <Badge variant="outline" className="text-xs">{c.duracao}</Badge>
                            </div>
                            <div className="flex-1 border-l border-border/40 pl-4 pb-2">
                              <p className="text-sm font-semibold">{c.fase}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="etapas">
                  <div className="space-y-3">
                    {(result.etapas ?? []).map((e, i) => (
                      <Card key={i}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-semibold">{e.nome}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <ArrowRight className="w-3 h-3 text-violet-500" />
                            <span className="text-xs text-foreground/70 italic">{e.entregavel}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="indicadores">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-violet-500" /> Indicadores de desempenho</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(result.indicadores ?? []).map((ind, i) => (
                          <div key={i} className="p-3 rounded-xl bg-muted/20 space-y-1">
                            <p className="text-sm font-semibold">{ind.nome}</p>
                            <p className="text-xs text-foreground/70">Meta: {ind.meta}</p>
                            <p className="text-xs text-muted-foreground">Como medir: {ind.metodologia}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="riscos">
                  <div className="space-y-3">
                    {(result.riscos ?? []).map((r, i) => {
                      const probColor = r.probabilidade === "Alta" ? "text-red-600 border-red-500/30" : r.probabilidade === "Média" ? "text-amber-600 border-amber-500/30" : "text-emerald-600 border-emerald-500/30";
                      return (
                        <Card key={i}>
                          <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${r.probabilidade === "Alta" ? "text-red-500" : r.probabilidade === "Média" ? "text-amber-500" : "text-emerald-500"}`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-semibold">{r.risco}</p>
                                  <Badge variant="outline" className={`text-xs ${probColor}`}>{r.probabilidade}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">↪ {r.mitigacao}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="acoes">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-violet-500" /> Próximas ações</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {(result.pendencias ?? []).map((p, i) => (
                          <li key={i} className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                            <span>{p}</span>
                          </li>
                        ))}
                        {(result.proximasAcoes ?? []).map((a, i) => (
                          <li key={`a-${i}`} className="flex gap-2 text-sm">
                            <ArrowRight className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </TabsContent>

                {(result.alertas?.length ?? 0) > 0 && (
                  <TabsContent value="alertas">
                    <Card className="border-amber-500/30">
                      <CardHeader><CardTitle className="flex items-center gap-2 text-amber-600"><AlertCircle className="w-4 h-4" /> Pontos de atenção</CardTitle></CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {(result.alertas ?? []).map((a, i) => (
                            <li key={i} className="text-sm text-amber-700 dark:text-amber-300">{a}</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>

              {/* Botão para salvar como projeto local */}
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const project: LocalProject = {
                      id: crypto.randomUUID(),
                      title: result.titulo ?? "Projeto gerado pela IA",
                      objective: (result.objetivos ?? [])[0] ?? "",
                      description: result.resumo ?? "",
                      status: "planejamento",
                      startDate: new Date().toISOString().split("T")[0],
                      endDate: "",
                      stages: (result.etapas ?? []).map((e) => ({
                        id: crypto.randomUUID(),
                        name: e.nome,
                        description: e.descricao,
                        deadline: "",
                        status: "pendente" as const,
                      })),
                      createdAt: new Date().toISOString(),
                    };
                    const updated = [project, ...localProjects];
                    setLocalProjects(updated);
                    saveLocalProjects(updated);
                    setPageTab("projetos");
                    setExpandedProject(project.id);
                    toast({ title: "Projeto salvo!", description: "Acesse a aba Meus Projetos para acompanhar." });
                  }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Salvar como projeto
                </Button>
              </div>
            </div>
          )}

          {stage === "idle" && (
            <div className="text-center py-10 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8 text-violet-500" />
              </div>
              <p className="text-sm font-medium">Descreva seu projeto para começar</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                A IA irá gerar um plano completo com objetivos, cronograma, equipe, indicadores e análise de riscos.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Seção: Gerenciador de projetos ── */}
      {pageTab === "projetos" && (
        <div className="space-y-4">
          {/* Botão de criar novo projeto */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {localProjects.length === 0 ? "Nenhum projeto cadastrado" : `${localProjects.length} projeto${localProjects.length > 1 ? "s" : ""}`}
            </p>
            <Button size="sm" onClick={() => setNewProjectForm(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Novo projeto
            </Button>
          </div>

          {/* Formulário de novo projeto */}
          {newProjectForm && (
            <Card className="border-violet-500/30">
              <CardHeader><CardTitle className="text-sm">Novo projeto</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título do projeto"
                  className="w-full px-3 py-2 rounded-lg border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <input
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  placeholder="Objetivo principal (opcional)"
                  className="w-full px-3 py-2 rounded-lg border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={createLocalProject} className="bg-violet-600 hover:bg-violet-700 text-white">Criar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewProjectForm(false)}>Cancelar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de projetos */}
          {localProjects.map((project) => {
            const progress = calcProgress(project);
            const isExpanded = expandedProject === project.id;

            return (
              <Card key={project.id} className={`transition-all ${isExpanded ? "border-violet-500/30" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                      className="flex-1 text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base group-hover:text-violet-600 transition-colors">
                          {project.title}
                        </CardTitle>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      {project.objective && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-normal">{project.objective}</p>
                      )}
                    </button>
                    <button
                      onClick={() => deleteLocalProject(project.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Barra de progresso */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{progress}% concluído</span>
                      <span className="text-xs text-muted-foreground">{project.stages.filter((s) => s.status === "concluída").length}/{project.stages.length} etapas</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </CardHeader>

                {/* Etapas do projeto */}
                {isExpanded && (
                  <CardContent>
                    <div className="space-y-1.5 mb-3">
                      {project.stages.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 group">
                          <button
                            onClick={() => cycleStageStatus(project.id, s.id)}
                            className="shrink-0"
                            title="Clique para avançar o status"
                          >
                            {statusIcon(s.status)}
                          </button>
                          <input
                            value={s.name}
                            onChange={(e) => updateStageName(project.id, s.id, e.target.value)}
                            className={`flex-1 text-sm bg-transparent border-0 focus:outline-none transition-colors
                              ${s.status === "concluída" ? "line-through text-muted-foreground/50" : ""}
                              ${s.status === "em andamento" ? "text-amber-600 dark:text-amber-400" : ""}`}
                          />
                          <button
                            onClick={() => deleteStage(project.id, s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addStage(project.id)}
                      className="gap-1 text-xs text-muted-foreground hover:text-violet-600"
                    >
                      <Plus className="w-3 h-3" /> Adicionar etapa
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {localProjects.length === 0 && !newProjectForm && (
            <div className="text-center py-10 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-8 h-8 text-violet-500" />
              </div>
              <p className="text-sm font-medium">Nenhum projeto cadastrado</p>
              <p className="text-xs mt-1">Use o botão "Novo projeto" ou gere um plano com IA.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-10">
        <Link href="/niasci"><Button variant="ghost" size="sm">← Voltar ao NIASci</Button></Link>
      </div>
    </div>
  );
}
