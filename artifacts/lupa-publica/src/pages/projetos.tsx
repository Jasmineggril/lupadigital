import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Layers, Plus, Trash2, ChevronRight, ArrowLeft, CheckCircle2,
  Circle, Clock, AlertCircle, ChevronDown, ChevronUp, PenLine,
  Calendar, Users, Target,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type StageStatus = "pendente" | "em andamento" | "concluída";

type Stage = {
  id: string;
  name: string;
  description: string;
  deadline: string;
  status: StageStatus;
};

type Project = {
  id: string;
  title: string;
  objective: string;
  description: string;
  team: string;
  startDate: string;
  endDate: string;
  status: "ativo" | "pausado" | "concluído";
  stages: Stage[];
  createdAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "niasci-projetos-v1";

function loadProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function progress(stages: Stage[]) {
  if (!stages.length) return 0;
  return Math.round((stages.filter((s) => s.status === "concluída").length / stages.length) * 100);
}

const statusColor: Record<StageStatus, string> = {
  pendente: "text-muted-foreground",
  "em andamento": "text-blue-500",
  concluída: "text-emerald-500",
};

const statusIcon: Record<StageStatus, React.ReactNode> = {
  pendente: <Circle className="w-4 h-4" />,
  "em andamento": <Clock className="w-4 h-4" />,
  concluída: <CheckCircle2 className="w-4 h-4" />,
};

const projectStatusBadge: Record<Project["status"], string> = {
  ativo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pausado: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  concluído: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

// ── Modal de novo projeto ──────────────────────────────────────────────────

function NewProjectModal({ onSave, onClose }: {
  onSave: (p: Omit<Project, "id" | "createdAt" | "stages">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: "", objective: "", description: "", team: "",
    startDate: "", endDate: "", status: "ativo" as Project["status"],
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="font-bold text-base">Novo projeto de pesquisa</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Título *</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)}
              placeholder="Ex: Análise de dados climáticos do Cerrado"
              className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Objetivo principal *</label>
            <textarea value={form.objective} onChange={(e) => set("objective", e.target.value)}
              placeholder="O que este projeto pretende alcançar?"
              className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm resize-none min-h-[72px] focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Descrição</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Contexto, metodologia e resultados esperados..."
              className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm resize-none min-h-[90px] focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Início</label>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Previsão de término</label>
              <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Equipe / Colaboradores</label>
            <input value={form.team} onChange={(e) => set("team", e.target.value)}
              placeholder="Ex: Prof. Ana, Aluno João, Lab. de Bioinformática"
              className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value as Project["status"])}
              className="w-full px-3 py-2 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30">
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="concluído">Concluído</option>
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border/60 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!form.title.trim() || !form.objective.trim()}
            onClick={() => { onSave(form); onClose(); }}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            Criar projeto
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Stage row ──────────────────────────────────────────────────────────────

function StageRow({ stage, onUpdate, onDelete }: {
  stage: Stage;
  onUpdate: (s: Stage) => void;
  onDelete: () => void;
}) {
  const nextStatus: Record<StageStatus, StageStatus> = {
    pendente: "em andamento",
    "em andamento": "concluída",
    concluída: "pendente",
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0 group">
      <button
        onClick={() => onUpdate({ ...stage, status: nextStatus[stage.status] })}
        className={`mt-0.5 shrink-0 transition-colors ${statusColor[stage.status]} hover:scale-110`}
        title="Clique para avançar status"
      >
        {statusIcon[stage.status]}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${stage.status === "concluída" ? "line-through text-muted-foreground" : ""}`}>
            {stage.name}
          </p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stage.status === "concluída" ? "bg-emerald-500/10 text-emerald-600" : stage.status === "em andamento" ? "bg-blue-500/10 text-blue-600" : "bg-muted/40 text-muted-foreground"}`}>
            {stage.status}
          </span>
        </div>
        {stage.description && <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>}
        {stage.deadline && (
          <p className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {new Date(stage.deadline + "T12:00:00").toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Project card ───────────────────────────────────────────────────────────

function ProjectCard({ project, onUpdate, onDelete }: {
  project: Project;
  onUpdate: (p: Project) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [newStage, setNewStage] = useState({ name: "", description: "", deadline: "" });
  const pct = progress(project.stages);

  const addStage = () => {
    if (!newStage.name.trim()) return;
    const stage: Stage = { id: uid(), status: "pendente", ...newStage };
    onUpdate({ ...project, stages: [...project.stages, stage] });
    setNewStage({ name: "", description: "", deadline: "" });
    setAddingStage(false);
  };

  const updateStage = (id: string, s: Stage) =>
    onUpdate({ ...project, stages: project.stages.map((x) => x.id === id ? s : x) });

  const deleteStage = (id: string) =>
    onUpdate({ ...project, stages: project.stages.filter((x) => x.id !== id) });

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${projectStatusBadge[project.status]}`}>
                {project.status}
              </span>
              {project.endDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> até {new Date(project.endDate + "T12:00:00").toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
            <CardTitle className="text-base font-bold leading-snug">{project.title}</CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/40 transition-colors">
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{project.stages.length} etapa{project.stages.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold text-foreground">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0">
          {/* Meta */}
          <div className="space-y-2 mb-4 pb-4 border-b border-border/40">
            {project.objective && (
              <div className="flex gap-2 text-sm">
                <Target className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                <div><span className="font-medium">Objetivo:</span> <span className="text-muted-foreground">{project.objective}</span></div>
              </div>
            )}
            {project.description && (
              <div className="flex gap-2 text-sm">
                <PenLine className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{project.description}</span>
              </div>
            )}
            {project.team && (
              <div className="flex gap-2 text-sm">
                <Users className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{project.team}</span>
              </div>
            )}
          </div>

          {/* Stages */}
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Etapas e cronograma</p>
            {project.stages.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-2">Nenhuma etapa adicionada ainda.</p>
            ) : (
              project.stages.map((s) => (
                <StageRow key={s.id} stage={s}
                  onUpdate={(updated) => updateStage(s.id, updated)}
                  onDelete={() => deleteStage(s.id)} />
              ))
            )}
          </div>

          {addingStage ? (
            <div className="border border-border/60 rounded-xl p-3 space-y-2 bg-muted/10">
              <input value={newStage.name} onChange={(e) => setNewStage((n) => ({ ...n, name: e.target.value }))}
                placeholder="Nome da etapa *"
                className="w-full px-3 py-1.5 rounded-lg border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
              <input value={newStage.description} onChange={(e) => setNewStage((n) => ({ ...n, description: e.target.value }))}
                placeholder="Descrição (opcional)"
                className="w-full px-3 py-1.5 rounded-lg border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
              <input type="date" value={newStage.deadline} onChange={(e) => setNewStage((n) => ({ ...n, deadline: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
              <div className="flex gap-2">
                <Button size="sm" onClick={addStage} disabled={!newStage.name.trim()} className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7">
                  Adicionar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingStage(false)} className="text-xs h-7">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingStage(true)}
              className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium mt-1 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Adicionar etapa
            </button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Projetos() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { setProjects(loadProjects()); }, []);

  const persist = (ps: Project[]) => { setProjects(ps); saveProjects(ps); };

  const createProject = (data: Omit<Project, "id" | "createdAt" | "stages">) => {
    const p: Project = { id: uid(), stages: [], createdAt: new Date().toISOString(), ...data };
    persist([p, ...projects]);
    toast({ title: "Projeto criado", description: `"${p.title}" adicionado com sucesso.` });
  };

  const updateProject = (p: Project) => persist(projects.map((x) => x.id === p.id ? p : x));

  const deleteProject = (id: string) => {
    if (!confirm("Remover este projeto permanentemente?")) return;
    persist(projects.filter((x) => x.id !== id));
  };

  const active = projects.filter((p) => p.status === "ativo").length;
  const done = projects.filter((p) => p.status === "concluído").length;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Link href="/niasci">
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> NIASci
            </button>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">Projetos</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Projetos de pesquisa</h1>
            <p className="text-muted-foreground mt-2 text-base leading-7">
              Planeje, acompanhe etapas e monitore o progresso dos seus projetos científicos.
            </p>
          </div>
          <Button onClick={() => setShowModal(true)} className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Novo projeto
          </Button>
        </div>

        {/* Stats */}
        {projects.length > 0 && (
          <div className="flex gap-4 mt-4">
            {[
              { label: "Total", value: projects.length },
              { label: "Ativos", value: active },
              { label: "Concluídos", value: done },
            ].map((s) => (
              <div key={s.label} className="text-xs text-muted-foreground">
                <strong className="text-foreground font-bold text-lg">{s.value}</strong> {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/40 bg-muted/5 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 text-violet-500 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-7 h-7" />
          </div>
          <p className="font-semibold">Nenhum projeto ainda</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Crie seu primeiro projeto de pesquisa e organize suas etapas.</p>
          <Button onClick={() => setShowModal(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
            <Plus className="w-4 h-4" /> Criar projeto
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p}
              onUpdate={updateProject}
              onDelete={() => deleteProject(p.id)} />
          ))}
        </div>
      )}

      {showModal && <NewProjectModal onSave={createProject} onClose={() => setShowModal(false)} />}
    </div>
  );
}
