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

import { apiFetch } from "@/lib/api";
import { saveRequest, type SaveState } from "@/lib/persistence";
import { SaveStatus } from "@/components/lupa/SaveStatus";
import { planFromRecord, recordFromPlan, type ProjectPlan, type ProjectOrigin, type ResearchProjectRecord } from "@workspace/project-contract";
import { useState, useRef, useEffect } from "react";
import { Link, useSearch } from "wouter";
import type { ProjectContext } from "@/lib/participacao";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  saveResearchProject,
  listResearchProjects,
  deleteResearchProject,
} from "@/services/analisesService";
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
/** Plano de projeto: mesmo contrato da API e do banco (@workspace/project-contract). */
type ProjetoResult = ProjectPlan;

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
  /** "Salvar versão": marcos guardados pela pessoa (no máximo 10, mais recentes primeiro) */
  versoes?: ProjectSnapshot[];
}

type ProjectSnapshot = { em: string; title: string; objective: string; description: string; status: LocalProject["status"]; stages: LocalStage[] };
const MAX_VERSOES = 10;

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
// Chave ANTIGA, global (sem dono): só lida para oferecer importação explícita. Projetos manuais
// agora ficam na conta (research_projects, source "manual").
const LEGACY_LOCAL_KEY = "niasci-projetos-v1";

function readLegacyDrafts(): LocalProject[] {
  try {
    const v = JSON.parse(localStorage.getItem(LEGACY_LOCAL_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function clearLegacyDrafts(): boolean {
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
    return true;
  } catch {
    return false;
  }
}

const manualBody = (p: LocalProject) => ({ title: p.title, description: p.description, source: "manual" as const, manual: p });

// ── Componente principal ──────────────────────────────────────────────────────
export default function Projetos() {
  const { toast } = useToast();

  // Estado da seção de geração por IA
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<ProjetoResult | null>(null);

  // Histórico de projetos gerados por IA (Supabase/localStorage)
  const [aiHistory, setAiHistory] = useState<ResearchProjectRecord[]>([]);
  // Registro antigo reaberto: só parte do plano existia
  const [partialRecord, setPartialRecord] = useState(false);
  // Vínculo com a participação (preenchido quando a página abre a partir de "Quero participar")
  const [origin, setOrigin] = useState<ProjectOrigin | null>(null);
  // ── Vindo de "Quero participar": ?participacao=<id> (só o id; contexto vem do servidor) ──
  const search = new URLSearchParams(useSearch());
  const participationId = search.get("participacao");
  // Reabrir pelo "Meu histórico": ?projeto=<id>
  const projectParam = search.get("projeto");
  const [ctx, setCtx] = useState<ProjectContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  useEffect(() => {
    if (!participationId) return;
    let alive = true;
    apiFetch<ProjectContext>(`/participations/${participationId}/projeto-contexto`)
      .then(async (c) => {
        if (!alive) return;
        setCtx(c);
        setOrigin({ participation_id: c.participacao.id, opportunity_id: c.edital?.id ?? null, opportunity_version: c.edital?.versao ?? null });
        const problema = c.proposta.find((x) => x.secao === "problema")?.texto;
        if (problema) setDescription((d) => d || problema);
        // Já existe projeto vinculado: reabre no mesmo ponto
        if (c.participacao.project_id) {
          const rec = await apiFetch<ResearchProjectRecord>(`/resources/research_projects/${c.participacao.project_id}`).catch(() => null);
          if (alive && rec) {
            const { plan, parcial } = planFromRecord(rec);
            setResult(plan);
            setPartialRecord(parcial);
            setStage("completed");
          }
        }
      })
      .catch((e) => alive && setCtxError(e instanceof Error ? e.message : "Não foi possível carregar a participação."));
    return () => {
      alive = false;
    };
  }, [participationId]);

  /** Depois de salvar, vincula o projeto à participação (sem criar outra entidade). */
  const onSaved = async (rec: ResearchProjectRecord) => {
    if (!ctx) return;
    try {
      await apiFetch(`/participations/${ctx.participacao.id}/vincular-projeto`, { method: "POST", body: JSON.stringify({ project_id: rec.id }) });
      setCtx({ ...ctx, participacao: { ...ctx.participacao, project_id: rec.id } });
    } catch (e) {
      toast({ title: "Projeto salvo, mas não foi vinculado à participação", description: e instanceof Error ? e.message : "Tente vincular de novo.", variant: "destructive" });
    }
  };
  const [historyLoading, setHistoryLoading] = useState(true);

  // Gerenciador local de projetos
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([]);
  const [legacyDrafts, setLegacyDrafts] = useState<LocalProject[]>([]);
  const [manualLoadError, setManualLoadError] = useState<string | null>(null);

  // Versão de cada projeto no servidor: uma gravação com versão antiga recebe 409 (outra aba/aparelho)
  const projectVersions = useRef(new Map<string, number>());
  const [manualSave, setManualSave] = useState<{ state: SaveState; error: string | null; at: Date | null }>({ state: "idle", error: null, at: null });
  // O que o servidor confirmou × o que está na tela. A sincronização envia só a diferença,
  // uma de cada vez (sem corrida entre gravações) e com espera ao digitar (sem uma requisição por tecla).
  const synced = useRef<LocalProject[]>([]);
  const latest = useRef<LocalProject[]>([]);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const swapId = (from: string, to: string) => {
    latest.current = latest.current.map((x) => (x.id === from ? { ...x, id: to } : x));
    setLocalProjects((cur) => cur.map((x) => (x.id === from ? { ...x, id: to } : x)));
    setExpandedProject((e) => (e === from ? to : e));
  };

  const syncOnce = async (): Promise<boolean> => {
    const before = new Map(synced.current.map((p) => [p.id, p]));
    const now = latest.current;
    for (const p of now) {
      const old = before.get(p.id);
      if (!old) {
        // Criar: o id gerado no navegador é a chave de idempotência (repetir não duplica)
        const r = await saveRequest<ResearchProjectRecord & { version?: number }>("/resources/research_projects", {
          method: "POST",
          body: manualBody(p),
          idempotencyKey: /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : undefined,
        });
        if (!r.ok) return failSync(r.error);
        projectVersions.current.set(r.data.id, r.data.version ?? 1);
        synced.current = [{ ...p, id: r.data.id }, ...synced.current];
        if (r.data.id !== p.id) swapId(p.id, r.data.id);
      } else if (JSON.stringify(old) !== JSON.stringify(p)) {
        const r = await saveRequest<{ version?: number }>(`/resources/research_projects/${p.id}`, {
          method: "PUT",
          body: manualBody(p),
          version: projectVersions.current.get(p.id) ?? null,
        });
        if (!r.ok && r.status === 409) {
          // Outra aba ou aparelho mudou este projeto: nada é sobrescrito; mostra a versão salva
          const atual = r.atual as (ResearchProjectRecord & { version?: number }) | undefined;
          const server = atual?.manual ? { ...(atual.manual as LocalProject), id: p.id } : old;
          projectVersions.current.set(p.id, atual?.version ?? projectVersions.current.get(p.id) ?? 1);
          synced.current = synced.current.map((x) => (x.id === p.id ? server : x));
          latest.current = latest.current.map((x) => (x.id === p.id ? server : x));
          setLocalProjects((cur) => cur.map((x) => (x.id === p.id ? server : x)));
          setManualSave({ state: "conflict", error: null, at: null });
          toast({
            title: "Projeto alterado em outra aba ou aparelho",
            description: "Nada foi sobrescrito. Carregamos a versão salva na sua conta — refaça a última alteração se ainda quiser.",
            variant: "destructive",
          });
          return false;
        }
        if (!r.ok) return failSync(r.error);
        projectVersions.current.set(p.id, r.data.version ?? (projectVersions.current.get(p.id) ?? 1) + 1);
        synced.current = synced.current.map((x) => (x.id === p.id ? p : x));
      }
    }
    const ids = new Set(latest.current.map((p) => p.id));
    for (const old of [...synced.current]) {
      if (ids.has(old.id)) continue;
      const r = await saveRequest(`/resources/research_projects/${old.id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 404) return failSync(r.error);
      projectVersions.current.delete(old.id);
      synced.current = synced.current.filter((x) => x.id !== old.id);
    }
    return true;
  };
  const failSync = (error: string) => {
    // O conteúdo CONTINUA na tela (não é descartado); só não chegou à conta
    setManualSave({ state: "error", error: `${error} O que está na tela ainda não chegou à sua conta.`, at: null });
    return false;
  };
  const syncNow = async () => {
    if (syncing.current) {
      syncAgain.current = true;
      return;
    }
    syncing.current = true;
    setManualSave((m) => ({ ...m, state: "saving", error: null }));
    let ok = false;
    try {
      ok = await syncOnce();
    } finally {
      syncing.current = false;
    }
    if (syncAgain.current) {
      syncAgain.current = false;
      return void syncNow();
    }
    if (ok) setManualSave({ state: "saved", error: null, at: new Date() });
  };
  /** Mostra a mudança na tela e agenda a gravação (`delay` > 0 enquanto a pessoa digita). */
  const saveLocalProjects = (next: LocalProject[], delay = 0) => {
    latest.current = next;
    setManualSave((m) => ({ ...m, state: "dirty" }));
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncNow(), delay);
  };
  const retryManualSave = () => void syncNow();
  // Voltou a conexão ou a aba foi escondida com algo pendente: tenta de novo
  useEffect(() => {
    const pendingSync = () => JSON.stringify(latest.current) !== JSON.stringify(synced.current) && void syncNow();
    const onHide = () => document.visibilityState === "hidden" && pendingSync();
    window.addEventListener("online", pendingSync);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", pendingSync);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** "Salvar versão": guarda um marco do projeto (título, objetivo, situação e etapas). */
  const saveProjectVersion = (id: string) => {
    const updated = localProjects.map((p) => {
      if (p.id !== id) return p;
      const snap: ProjectSnapshot = { em: new Date().toISOString(), title: p.title, objective: p.objective, description: p.description, status: p.status, stages: p.stages };
      return { ...p, versoes: [snap, ...(p.versoes ?? [])].slice(0, MAX_VERSOES) };
    });
    setLocalProjects(updated);
    saveLocalProjects(updated);
  };
  const restoreProjectVersion = (id: string, snap: ProjectSnapshot) => {
    if (!window.confirm(`Voltar o projeto para a versão de ${new Date(snap.em).toLocaleString("pt-BR")}? O estado atual vira uma nova versão guardada antes.`)) return;
    const updated = localProjects.map((p) => {
      if (p.id !== id) return p;
      const atual: ProjectSnapshot = { em: new Date().toISOString(), title: p.title, objective: p.objective, description: p.description, status: p.status, stages: p.stages };
      return { ...p, title: snap.title, objective: snap.objective, description: snap.description, status: snap.status, stages: snap.stages, versoes: [atual, ...(p.versoes ?? [])].slice(0, MAX_VERSOES) };
    });
    setLocalProjects(updated);
    saveLocalProjects(updated);
  };

  const importLegacy = async () => {
    const created: LocalProject[] = [];
    try {
      for (const d of legacyDrafts) {
        const rec = await apiFetch<ResearchProjectRecord>("/resources/research_projects", { method: "POST", body: JSON.stringify(manualBody(d)) });
        created.push({ ...d, id: rec.id });
      }
      clearLegacyDrafts();
      setLegacyDrafts([]);
      synced.current = [...created, ...synced.current];
      latest.current = [...created, ...latest.current];
      setLocalProjects((cur) => [...created, ...cur]);
      toast({ title: "Rascunhos importados", description: `${created.length} projeto(s) agora estão na sua conta.` });
    } catch (e) {
      synced.current = [...created, ...synced.current];
      latest.current = [...created, ...latest.current];
      setLocalProjects((cur) => [...created, ...cur]);
      setLegacyDrafts((cur) => cur.slice(created.length));
      toast({ title: "Importação incompleta", description: `${created.length} importado(s). ${e instanceof Error ? e.message : "Tente de novo."}`, variant: "destructive" });
    }
  };
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Formulário de novo projeto local
  const [newProjectForm, setNewProjectForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newObjective, setNewObjective] = useState("");

  // Abas da página (gerador IA | meus projetos)
  const [pageTab, setPageTab] = useState<"ia" | "projetos">("ia");

  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Projetos da CONTA: gerados com IA (histórico) e manuais (gerenciador)
    listResearchProjects()
      .then((items) => {
        setAiHistory(items.filter((i) => i.source !== "manual"));
        setLocalProjects(items.filter((i) => i.source === "manual" && i.manual).map((i) => ({ ...(i.manual as LocalProject), id: i.id })));
        for (const i of items) projectVersions.current.set(i.id, (i as { version?: number }).version ?? 1);
        synced.current = latest.current = items.filter((i) => i.source === "manual" && i.manual).map((i) => ({ ...(i.manual as LocalProject), id: i.id }));
        if (projectParam) {
          const hit = items.find((i) => i.id === projectParam);
          if (hit?.source === "manual") {
            setPageTab("projetos");
            setExpandedProject(hit.id);
          } else if (hit) handleHistorySelect(hit);
        }
        setManualLoadError(null);
      })
      .catch((e: unknown) => {
        setAiHistory([]);
        setManualLoadError(e instanceof Error ? e.message : "Não foi possível carregar seus projetos.");
      })
      .finally(() => setHistoryLoading(false));

    // Rascunhos antigos deste navegador: só mostrados para importar ou descartar
    setLegacyDrafts(readLegacyDrafts());
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
      // Chamada autenticada: a sessão vai junto (limite de uso da conta, não de visitante)
      const data = await apiFetch<ProjetoResult>("/niasci/projetos/analyze", {
        method: "POST",
        body: JSON.stringify({ description, ...(ctx ? { participation_id: ctx.participacao.id } : {}) }),
      });

      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      setPartialRecord(false);
      // Grava o plano INTEIRO (o mesmo que aparece na tela e no PDF)
      const saved = await saveResearchProject(recordFromPlan(data, origin)).catch((e: unknown) => {
        // A análise está pronta; só a gravação falhou — o resultado continua na tela
        toast({ title: "Plano pronto, mas não foi salvo", description: e instanceof Error ? e.message : "Não foi possível salvar no histórico. O plano continua na tela.", variant: "destructive" });
        return null;
      });

      if (saved) {
        setAiHistory((prev) => [saved, ...prev].slice(0, 20));
        await onSaved(saved);
        toast({ title: "Plano gerado e salvo", description: "Ele está no seu histórico de projetos." });
      }
    } catch (err) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      const msg = getFriendlyErrorMessage(err);
      setStage("error");
      setErrorMessage(msg);
      toast({ title: "Erro ao gerar plano", description: msg, variant: "destructive" });
    }
  };

  const handleHistorySelect = (item: ResearchProjectRecord) => {
    // Reabre EXATAMENTE o que foi salvo; registros antigos mostram só o que existia
    const { plan, parcial } = planFromRecord(item);
    setResult(plan);
    setPartialRecord(parcial);
    setStage("completed");
    toast({
      title: "Plano reaberto",
      description: parcial ? "Registro antigo: na época só título, resumo, equipe e cronograma eram salvos." : "Todas as seções foram restauradas.",
    });
  };

  const handleHistoryDelete = async (id: string) => {
    if (!window.confirm("Excluir este item do histórico? Isso não pode ser desfeito.")) return;
    try {
      await deleteResearchProject(id);
      setAiHistory((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Removido do histórico" });
    } catch (e) {
      toast({ title: "Não foi possível excluir", description: e instanceof Error ? e.message : "Nada foi apagado; tente novamente.", variant: "destructive" });
    }
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
    saveLocalProjects(updated, 1200); // grava depois de uma pausa na digitação
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
        moduleColor="text-lens dark:text-violet-400"
        title="Projetos de Pesquisa"
        description="Descreva sua ideia de pesquisa e a IA gera um plano completo com objetivos, equipe, cronograma, indicadores e análise de riscos. Ou gerencie seus projetos existentes com controle de etapas e progresso."
      />

      {/* Alternador entre seções da página */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={pageTab === "ia" ? "default" : "outline"}
          size="sm"
          onClick={() => setPageTab("ia")}
          aria-pressed={pageTab === "ia"}
          className="gap-2"
        >
          <Sparkles className="w-4 h-4" /> Gerar com IA
        </Button>
        <Button
          variant={pageTab === "projetos" ? "default" : "outline"}
          size="sm"
          onClick={() => setPageTab("projetos")}
          aria-pressed={pageTab === "projetos"}
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
            accentBg="bg-lens-tint"
          />

          {participationId && (
            <section aria-labelledby="ctx-titulo" className="mb-6 rounded-xl border border-hairline bg-white p-4" data-testid="projeto-contexto">
              {ctxError ? (
                <p role="alert" className="text-sm text-red-800">{ctxError}</p>
              ) : !ctx ? (
                <p role="status" className="text-sm text-slate-700">Carregando a participação…</p>
              ) : (
                <>
                  <h2 id="ctx-titulo" className="font-semibold text-ink">
                    Preparando o projeto para: {ctx.edital?.titulo ?? ctx.participacao.titulo}
                    {ctx.edital?.versao ? <span className="ml-1 text-xs font-normal text-slate-600">(versão {ctx.edital.versao} do edital)</span> : null}
                  </h2>
                  <p className="mt-1 text-sm text-slate-700">Estas informações vão junto para a IA. O que é do edital é exigência; o plano gerado é sugestão e você decide o que manter.</p>
                  <details className="mt-3" open>
                    <summary className="cursor-pointer text-sm font-semibold text-ink">Do edital ({ctx.exigencias.length})</summary>
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pl-1 text-sm text-ink-2">
                      {ctx.exigencias.map((e, i) => (
                        <li key={i}>
                          <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{e.tipo}</span>
                          {e.texto.slice(0, 220)}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">Do seu perfil ({ctx.perfil.length})</summary>
                    <ul className="mt-2 space-y-1 text-sm text-ink-2">
                      {ctx.perfil.map((x) => (
                        <li key={x.campo}>
                          <strong className="font-semibold">{x.campo}:</strong> {x.valor}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {ctx.proposta.length > 0 && (
                    <p className="mt-2 text-sm text-ink-2">Também vai o que você já escreveu na proposta: {ctx.proposta.map((x) => x.secao).join(", ")}.</p>
                  )}
                  {ctx.faltando.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p className="font-semibold">Falta só isto:</p>
                      <ul className="list-disc pl-5">
                        {ctx.faltando.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!ctx.participacao.project_id && aiHistory.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        <span className="block font-semibold text-ink">Ou vincule um projeto que você já tem</span>
                        <select id="vincular-projeto" className="mt-1 h-10 rounded-lg border border-field bg-white px-2 text-sm" defaultValue="">
                          <option value="" disabled>Escolha um projeto</option>
                          {aiHistory.map((h) => (
                            <option key={h.id} value={h.id}>{h.title ?? "Projeto sem título"}</option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const id = (document.getElementById("vincular-projeto") as HTMLSelectElement | null)?.value;
                          const rec = aiHistory.find((h) => h.id === id);
                          if (!rec) return;
                          await onSaved(rec);
                          handleHistorySelect(rec);
                        }}
                      >
                        Vincular
                      </Button>
                    </div>
                  )}
                  <Link href={`/participar/${ctx.participacao.id}`} className="mt-3 inline-block text-sm font-semibold text-lens underline">
                    Voltar à participação
                  </Link>
                </>
              )}
            </section>
          )}

          {/* Textarea de descrição do projeto */}
          <div className="mb-6">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Descreva seu projeto de pesquisa
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Projeto de pesquisa sobre uso de machine learning para diagnóstico precoce de diabetes em populações rurais do Brasil. Equipe de 3 pesquisadores, duração de 18 meses, financiamento via CNPq…"
              rows={6}
              className="w-full px-4 py-3 rounded-2xl border border-field bg-card text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 focus:ring-2 focus:ring-lens/30 focus:border-lens/50 transition"
            />
            {description && (
              <p className="text-xs text-muted-foreground/40 mt-1 text-right">{description.length} caracteres</p>
            )}
            <div className="mt-3">
              <Button
                onClick={handleGenerate}
                disabled={isLoading || description.trim().length < 30}
                className="gap-2 bg-lens hover:bg-lens-deep text-white"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isLoading ? "Gerando plano…" : "Gerar plano de projeto"}
              </Button>
            </div>
          </div>

          <AnalysisProgress
            stage={stage}
            stages={STAGES}
            accentColor="text-lens"
            errorMessage={errorMessage}
          />

          {/* Resultados do plano gerado */}
          {result && stage === "completed" && (
            <div>
            {partialRecord && (
              <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="projeto-parcial">
                Registro antigo: na época só título, resumo, equipe e cronograma eram salvos. As demais seções não existem neste registro.
              </p>
            )}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-lens" />
                  <h2 className="text-lg font-bold">{result.titulo ?? "Plano de projeto"}</h2>
                </div>
                <ExportButton filename={`projeto-${result.titulo ?? "plano"}`} sections={buildExportSections()} />
              </div>

              {result.resumo && (
                <Card className="mb-4 border-lens/30 bg-lens-tint">
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
                    <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-lens" /> Objetivos</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {(result.objetivos ?? []).map((o, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-lens font-bold shrink-0">{i === 0 ? "◈" : "◦"}</span>
                            <span className={i === 0 ? "font-semibold" : ""}>{o}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="equipe">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-lens" /> Equipe sugerida</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(result.equipe ?? []).map((e, i) => (
                          <div key={i} className="flex gap-3">
                            <Badge variant="outline" className="shrink-0 text-lens border-lens/30 h-fit">{e.papel}</Badge>
                            <p className="text-sm text-foreground/80">{e.responsabilidades}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="cronograma">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4 text-lens" /> Cronograma por fases</CardTitle></CardHeader>
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
                            <ArrowRight className="w-3 h-3 text-lens" />
                            <span className="text-xs text-foreground/70 italic">{e.entregavel}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="indicadores">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-lens" /> Indicadores de desempenho</CardTitle></CardHeader>
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
                    <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-lens" /> Próximas ações</CardTitle></CardHeader>
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
                            <ArrowRight className="w-4 h-4 shrink-0 mt-0.5 text-lens" />
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
              <div className="w-16 h-16 rounded-2xl bg-lens-tint flex items-center justify-center mx-auto mb-4">
                <Layers className="w-8 h-8 text-lens" />
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
          <p role="note" className="mb-3 text-xs text-slate-600">
            Seus projetos ficam na sua conta: aparecem em qualquer aparelho em que você entrar e entram em “Baixar meus dados” e “Excluir meus dados”.
          </p>
          <SaveStatus
            className="mb-3"
            state={manualSave.state}
            error={manualSave.error}
            savedAt={manualSave.at}
            onRetry={retryManualSave}
          />
          {manualLoadError && (
            <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {manualLoadError} Nada foi alterado.
            </p>
          )}
          {legacyDrafts.length > 0 && (
            <section aria-labelledby="rascunhos-titulo" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="rascunhos-locais">
              <h3 id="rascunhos-titulo" className="font-semibold text-amber-950">
                Rascunhos antigos neste navegador ({legacyDrafts.length})
              </h3>
              <p className="mt-1 text-sm text-amber-950">
                Antes, projetos manuais ficavam só no navegador, sem ligação com uma conta. Eles podem ter sido criados por outra pessoa que usou este
                aparelho. Nada foi associado à sua conta: confira e escolha.
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-950">
                {legacyDrafts.slice(0, 10).map((d) => (
                  <li key={d.id}>
                    {d.title || "Sem título"} — {d.stages?.length ?? 0} etapa(s){d.createdAt ? `, criado em ${new Date(d.createdAt).toLocaleDateString("pt-BR")}` : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={importLegacy}>
                  Importar para a minha conta
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!window.confirm("Descartar os rascunhos deste navegador? Eles não estão em nenhuma conta e serão apagados.")) return;
                    if (clearLegacyDrafts()) setLegacyDrafts([]);
                    else toast({ title: "Não foi possível descartar", description: "O navegador não permitiu apagar.", variant: "destructive" });
                  }}
                >
                  Descartar
                </Button>
              </div>
            </section>
          )}
          {newProjectForm && (
            <Card className="border-lens/30">
              <CardHeader><CardTitle className="text-sm">Novo projeto</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título do projeto"
                  className="w-full px-3 py-2 rounded-lg border border-field bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 focus:ring-2 focus:ring-lens/30"
                />
                <input
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  placeholder="Objetivo principal (opcional)"
                  className="w-full px-3 py-2 rounded-lg border border-field bg-card text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 focus:ring-2 focus:ring-lens/30"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={createLocalProject} className="bg-lens hover:bg-lens-deep text-white">Criar</Button>
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
              <Card key={project.id} className={`transition ${isExpanded ? "border-lens/30" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                      className="flex-1 text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base group-hover:text-lens transition-colors">
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
                        className="h-full rounded-full bg-lens transition"
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
                            aria-label="Nome da etapa"
                            data-testid="etapa-nome"
                            onChange={(e) => updateStageName(project.id, s.id, e.target.value)}
                            className={`flex-1 text-sm bg-transparent border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 transition-colors
                              ${s.status === "concluída" ? "line-through text-muted-foreground/50" : ""}
                              ${s.status === "em andamento" ? "text-amber-600 dark:text-amber-400" : ""}`}
                          />
                          <button
                            onClick={() => deleteStage(project.id, s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition rounded"
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
                      className="gap-1 text-xs text-muted-foreground hover:text-lens"
                    >
                      <Plus className="w-3 h-3" /> Adicionar etapa
                    </Button>
                    <div className="mt-3 border-t pt-3" data-testid="projeto-versoes">
                      <Button size="sm" variant="outline" onClick={() => saveProjectVersion(project.id)} data-testid="salvar-versao">
                        Salvar versão
                      </Button>
                      <span className="ml-2 text-xs text-muted-foreground">Guarda um marco deste projeto (até {MAX_VERSOES}) para comparar ou voltar depois.</span>
                      {(project.versoes?.length ?? 0) > 0 && (
                        <ul className="mt-2 space-y-1 text-xs">
                          {project.versoes!.map((v) => (
                            <li key={v.em} className="flex flex-wrap items-center gap-2">
                              <span>
                                Versão de {new Date(v.em).toLocaleString("pt-BR")} — {v.stages.length} etapa(s), {v.status}
                              </span>
                              <button type="button" className="font-semibold text-lens underline underline-offset-2" onClick={() => restoreProjectVersion(project.id, v)}>
                                Restaurar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {localProjects.length === 0 && !newProjectForm && (
            <div className="text-center py-10 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-lens-tint flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-8 h-8 text-lens" />
              </div>
              <p className="text-sm font-medium">Nenhum projeto cadastrado</p>
              <p className="text-xs mt-1">Use o botão "Novo projeto" ou gere um plano com IA.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-10">
        <Link href="/niasci" className={buttonVariants({ variant: "ghost", size: "sm" })}>← Voltar ao NIASci</Link>
      </div>
    </div>
  );
}
