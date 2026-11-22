/**
 * @file elattes.tsx
 * @description Módulo e-Lattes do NIASci — análise de currículo Lattes via IA.
 *
 * Objetivo do componente:
 *   Permite ao usuário fazer upload de um currículo Lattes em PDF ou colar o texto,
 *   e receber uma análise estruturada com resumo executivo, linha do tempo acadêmica,
 *   competências, publicações, áreas de pesquisa, sugestões de editais e oportunidades.
 *
 * Fluxo de execução:
 *   1. Usuário envia PDF ou cola texto do currículo
 *   2. Texto é extraído do PDF via extractTextFromPdf() (lib/pdf.ts)
 *   3. POST /api/niasci/elattes/analyze envia o texto ao backend
 *   4. Backend chama analyzeLattes() do AIService (nunca OpenAI diretamente)
 *   5. Resultado é exibido em abas e salvo no Supabase/localStorage via saveLattesProfile()
 *   6. Histórico mostra análises anteriores via getLattesProfiles()
 *
 * Integração com AIService:
 *   - Todo processamento de IA passa pelo backend → aiService.analyzeLattes()
 *   - Nenhuma chamada direta à OpenAI no frontend
 *
 * Integração com Supabase:
 *   - saveLattesProfile(): persiste o resultado (Supabase se autenticado, localStorage como fallback)
 *   - getLattesProfiles(): carrega histórico de análises anteriores
 */

import { apiFetch } from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { newKey } from "@/lib/persistence";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
// Leitor de PDF carregado só quando um arquivo é enviado
const extractTextFromPdf = async (...args: Parameters<(typeof import("@/lib/pdf"))["extractTextFromPdf"]>) => (await import("@/lib/pdf")).extractTextFromPdf(...args);
import {
  saveLattesProfile,
  getLattesProfiles,
  deleteLattesProfile,
} from "@/services/analisesService";
import type { LattesProfile } from "@/lib/supabase-types";
import { useAuth } from "@/lib/auth";
import type { TeacherProfile } from "@/lib/lupa-types";
import {
  API_BASE,
  NiasciHeader,
  AnalysisProgress,
  HistoryPanel,
  InputSection,
  ExportButton,
  getFriendlyErrorMessage,
  type AnalysisStage,
} from "@/lib/niasci-utils";
import {
  User, Clock, Target, Globe, Lightbulb, BookOpen, BarChart2,
  CheckCircle2, AlertCircle, Sparkles,
} from "lucide-react";

// ── Tipos locais ─────────────────────────────────────────────────────────────

/**
 * Forma do objeto retornado pelo backend ao analisar um currículo Lattes.
 * Todos os campos são opcionais pois o texto pode não conter todas as seções.
 */
interface LattesResult {
  resumo?: string;
  nomeInferido?: string;
  timeline?: { year: string; text: string }[];
  competencias?: string[];
  publicacoes?: string[];
  areas?: string[];
  sugestoes?: string[];
  oportunidades?: string[];
  /** Sugestões de melhoria organizadas por categoria */
  sugestoesMelhoria?: {
    curriculo?: string[];
    producaoCientifica?: string[];
    competencias?: string[];
  };
  /** Índice de Maturidade Científica (0-100) com explicação e ações prioritárias */
  maturidadeCientifica?: {
    score: number;
    explicacao: string;
    fatoresRedutores?: string[];
    acoesPrioritarias?: string[];
  };
  alertas?: string[];
}

// ── Estágios de análise ───────────────────────────────────────────────────────
/**
 * Definição dos estágios visuais de progresso exibidos durante o processamento.
 * Segue o mesmo padrão do módulo Editais (testar.tsx).
 */
const STAGES = [
  { key: "reading",    label: "Lendo o currículo",     description: "Interpretando estrutura e conteúdo do Lattes." },
  { key: "extracting", label: "Extraindo dados",        description: "Identificando publicações, competências e timeline." },
  { key: "finalizing", label: "Gerando insights",       description: "Montando sugestões de editais e oportunidades." },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function ELattes() {
  const { toast } = useToast();

  // Estado do texto de entrada e do estágio de análise
  const [text, setText] = useState("");
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Resultado da análise
  const [result, setResult] = useState<LattesResult | null>(null);

  // Histórico de análises anteriores
  const [history, setHistory] = useState<LattesProfile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Intervalo de animação de estágios (simula progresso durante a chamada à IA)
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Carrega o histórico de análises ao montar o componente.
   * getLattesProfiles() usa Supabase se autenticado, localStorage como fallback.
   */
  // Trabalhos anteriores: falha ao carregar aparece como falha (antes virava lista vazia, parecendo perda)
  const [historyError, setHistoryError] = useState<string | null>(null);
  const loadHistory = () => {
    setHistoryLoading(true);
    setHistoryError(null);
    getLattesProfiles()
      .then((profiles) => setHistory(profiles as LattesProfile[]))
      .catch(() => setHistoryError("Não foi possível carregar seus trabalhos anteriores agora. Eles continuam salvos na sua conta."))
      .finally(() => setHistoryLoading(false));
  };
  useEffect(loadHistory, []);
  // Chave de idempotência da análise atual (clique repetido ou nova tentativa não duplica)
  const saveKeyRef = useRef(newKey());
  // Aberto pelo Meu histórico (?item=ID): o MESMO resultado salvo, sem rodar a IA de novo
  const openedFromUrl = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("item");
    if (!id || openedFromUrl.current || historyLoading) return;
    openedFromUrl.current = true;
    const found = history.find((h) => String(h.id) === id);
    if (found) handleHistorySelect(found);
    else
      apiFetch<LattesProfile>(`/resources/lattes_profiles/${encodeURIComponent(id)}`)
        .then((item) => handleHistorySelect(item))
        .catch(() => toast({ title: "Item não encontrado", description: "Este trabalho não está na sua conta (ou foi excluído).", variant: "destructive" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoading]);

  /**
   * Limpa o timer de animação de estágios ao desmontar o componente.
   */
  useEffect(() => {
    return () => { if (stageTimerRef.current) clearInterval(stageTimerRef.current); };
  }, []);

  /**
   * Recebe um arquivo PDF, extrai o texto e preenche o textarea.
   * Usa a lib/pdf.ts que aplica extração por camada de texto com fallback para OCR.
   *
   * @param file - Arquivo PDF selecionado pelo usuário
   */
  const handleFileLoad = async (file: File) => {
    try {
      const extracted = await extractTextFromPdf(file);
      setText(typeof extracted === "string" ? extracted : (extracted as any).text ?? "");
      toast({ title: "PDF carregado", description: "Texto extraído com sucesso. Clique em Analisar para continuar." });
    } catch {
      toast({ title: "Erro ao ler PDF", description: "Não foi possível extrair o texto. Tente colar o conteúdo manualmente.", variant: "destructive" });
    }
  };

  /**
   * Inicia a animação de estágios, simulando progresso visual enquanto a IA processa.
   * Avança automaticamente entre os estágios com intervalos de 3 segundos.
   */
  const startStageAnimation = () => {
    let current = 0;
    const keys = STAGES.map((s) => s.key) as AnalysisStage[];
    setStage(keys[0]);
    stageTimerRef.current = setInterval(() => {
      current++;
      if (current < keys.length) {
        setStage(keys[current]);
      } else {
        if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      }
    }, 3000);
  };

  /**
   * Executa a análise do currículo Lattes.
   *
   * Fluxo:
   * 1. Valida entrada mínima
   * 2. Inicia animação de estágios
   * 3. Envia texto ao backend via POST /api/niasci/elattes/analyze
   * 4. Salva resultado no Supabase/localStorage
   * 5. Atualiza histórico e exibe resultado
   */
  const handleAnalyze = async () => {
    if (text.trim().length < 100) {
      toast({
        title: "Texto insuficiente",
        description: "O currículo deve ter pelo menos 100 caracteres para análise.",
        variant: "destructive",
      });
      return;
    }

    setResult(null);
    saveKeyRef.current = newKey(); // nova análise = novo registro (nunca sobrescreve outra)
    setErrorMessage("");
    startStageAnimation();

    try {
      // Chamada autenticada: a sessão vai junto (limite de uso da conta, não de visitante)
      const data = await apiFetch<LattesResult>("/niasci/elattes/analyze", { method: "POST", body: JSON.stringify({ text }) });

      // Para a animação e marca como concluído
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      // Persiste no Supabase ou localStorage
      const saved = await saveLattesProfile({
        name: data.nomeInferido ?? "Pesquisador",
        // Currículo guardado (até 60 mil caracteres) para reabrir esta versão e continuar a revisão
        lattes_xml: text.slice(0, 60_000),
        summary: data.resumo ?? "",
        metadata: { result: data, caracteres: text.length, guardado_integral: text.length <= 60_000 } as any,
      }, { idempotencyKey: saveKeyRef.current }).catch((e: unknown) => {
        // A análise está pronta; só a gravação falhou — dizer isso, sem marcar a análise como erro
        toast({ title: "Resultado pronto, mas não foi salvo", description: e instanceof Error ? e.message : "Não foi possível salvar no histórico.", variant: "destructive" });
        return null;
      });

      // Atualiza o histórico com o novo item
      if (saved) setHistory((prev) => [saved as LattesProfile, ...prev].slice(0, 20));

      toast({ title: "Análise concluída!", description: "O currículo foi analisado com sucesso." });
    } catch (err) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      const msg = getFriendlyErrorMessage(err);
      setStage("error");
      setErrorMessage(msg);
      toast({ title: "Erro na análise", description: msg, variant: "destructive" });
    }
  };

  /**
   * Restaura um resultado do histórico para a tela principal.
   * Extrai o objeto de resultado do campo metadata do perfil salvo.
   */
  const handleHistorySelect = (item: LattesProfile) => {
    const resultData = (item.metadata as any)?.result;
    if (resultData) {
      setResult(resultData as LattesResult);
      setStage("completed");
      // Volta também o texto do currículo desta versão: dá para revisar e analisar de novo
      if (typeof item.lattes_xml === "string" && item.lattes_xml.length > 0) setText(item.lattes_xml);
      toast({ title: "Versão reaberta", description: "Leitura e currículo desta versão carregados da sua conta, sem nova análise. Nada foi alterado no seu perfil." });
    }
  };

  /**
   * Exclui um item do histórico pelo ID.
   */
  const handleHistoryDelete = async (id: string) => {
    if (!window.confirm("Excluir este item do histórico? Isso não pode ser desfeito.")) return;
    try {
      await deleteLattesProfile(id);
      setHistory((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Removido do histórico" });
    } catch (e) {
      toast({ title: "Não foi possível excluir", description: e instanceof Error ? e.message : "Nada foi apagado; tente novamente.", variant: "destructive" });
    }
  };

  /**
   * Monta as seções de exportação com todos os dados do resultado.
   */
  const buildExportSections = () => {
    if (!result) return [];
    return [
      { title: "Resumo Executivo", content: result.resumo ?? "" },
      { title: "Nome", content: result.nomeInferido ?? "" },
      { title: "Linha do Tempo", content: (result.timeline ?? []).map((t) => `${t.year}: ${t.text}`).join("\n") },
      { title: "Competências", content: (result.competencias ?? []).join("\n") },
      { title: "Publicações", content: (result.publicacoes ?? []).join("\n") },
      { title: "Áreas de Pesquisa", content: (result.areas ?? []).join("\n") },
      { title: "Editais Sugeridos", content: (result.sugestoes ?? []).join("\n") },
      { title: "Oportunidades", content: (result.oportunidades ?? []).join("\n") },
    ];
  };

  const isLoading = stage !== "idle" && stage !== "completed" && stage !== "error";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Cabeçalho padronizado NIASci */}
      <NiasciHeader
        module="e-Lattes"
        moduleColor="text-lens dark:text-emerald-400"
        title="e-Lattes"
        description="Faça upload do seu currículo Lattes em PDF ou cole o texto para receber uma análise completa: resumo executivo, linha do tempo, competências, publicações e sugestões de editais compatíveis com seu perfil."
      />

      {/* Histórico de análises anteriores */}
      <HistoryPanel
        items={history}
        error={historyError}
        onRetry={loadHistory}
        onSelect={handleHistorySelect}
        onDelete={handleHistoryDelete}
        getLabel={(p) => `Versão — ${(p.metadata as any)?.result?.nomeInferido ?? p.name ?? "currículo"}: ${((p.metadata as any)?.result?.resumo ?? "").slice(0, 60)}`}
        isLoading={historyLoading}
        accentBg="bg-lens-tint"
      />

      {/* Seção de entrada: upload PDF + textarea */}
      <InputSection
        text={text}
        onTextChange={setText}
        onFileLoad={handleFileLoad}
        onSubmit={handleAnalyze}
        isLoading={isLoading}
        submitLabel="Analisar currículo"
        placeholder="Cole aqui o texto do seu currículo Lattes (Plataforma Lattes → Imprimir CV → copiar texto)…"
        accentColor="emerald"
      />

      {/* Indicador visual de progresso durante a análise */}
      <AnalysisProgress
        stage={stage}
        stages={STAGES}
        accentColor="text-lens"
        errorMessage={errorMessage}
      />

      {/* Resultados em abas */}
      {result && stage === "completed" && (
        <div>
          {/* Cabeçalho dos resultados com botão de exportação */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-lens" />
              <h2 className="text-lg font-bold">Resultado da análise</h2>
              {result.nomeInferido && (
                <Badge variant="outline" className="text-lens border-lens/30">
                  {result.nomeInferido}
                </Badge>
              )}
            </div>
            <ExportButton
              filename={`lattes-${result.nomeInferido ?? "perfil"}`}
              sections={buildExportSections()}
            />
          </div>

          <AddToProfile areas={result.areas ?? []} competencias={result.competencias ?? []} />
          <Tabs defaultValue="resumo" className="space-y-4">
            <TabsList className="flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
              <TabsTrigger value="competencias">Competências</TabsTrigger>
              <TabsTrigger value="publicacoes">Produção Científica</TabsTrigger>
              <TabsTrigger value="areas">Áreas de Pesquisa</TabsTrigger>
              <TabsTrigger value="sugestoes">Editais Sugeridos</TabsTrigger>
              <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
              <TabsTrigger value="melhorias">Sugestões de Melhoria</TabsTrigger>
              {(result.alertas?.length ?? 0) > 0 && <TabsTrigger value="alertas">Alertas</TabsTrigger>}
            </TabsList>

            {/* Aba: Resumo executivo */}
            <TabsContent value="resumo">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-4 h-4 text-lens" /> Resumo executivo</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-foreground/90">{result.resumo ?? "Sem resumo disponível."}</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Linha do tempo acadêmica */}
            <TabsContent value="timeline">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4 text-lens" /> Linha do tempo acadêmica</CardTitle></CardHeader>
                <CardContent>
                  {(result.timeline ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum evento identificado no currículo.</p>
                  ) : (
                    <div className="space-y-3">
                      {(result.timeline ?? []).map((item, i) => (
                        <div key={i} className="flex gap-4">
                          <div className="shrink-0 w-14 text-right">
                            <Badge variant="outline" className="text-xs text-lens border-lens/30">{item.year}</Badge>
                          </div>
                          <div className="flex-1 border-l border-border/40 pl-4 pb-3">
                            <p className="text-sm text-foreground/90">{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Competências */}
            <TabsContent value="competencias">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-lens" /> Competências identificadas</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(result.competencias ?? []).map((c, i) => (
                      <Badge key={i} className="bg-lens-tint text-lens dark:text-emerald-300 border-0">{c}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Produção científica */}
            <TabsContent value="publicacoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-lens" /> Produção científica</CardTitle></CardHeader>
                <CardContent>
                  {(result.publicacoes ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma publicação identificada.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(result.publicacoes ?? []).map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-lens shrink-0">•</span>
                          <span className="text-foreground/90">{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Áreas de pesquisa */}
            <TabsContent value="areas">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-4 h-4 text-lens" /> Áreas de pesquisa</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(result.areas ?? []).map((a, i) => (
                      <Badge key={i} variant="outline" className="text-lens border-lens/30">{a}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Sugestões de editais */}
            <TabsContent value="sugestoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-lens" /> Editais sugeridos</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(result.sugestoes ?? []).map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-lens shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Oportunidades */}
            <TabsContent value="oportunidades">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-lens" /> Ideias de oportunidades</CardTitle></CardHeader>
                <CardContent>
                  <p role="note" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Sugestões geradas pela IA a partir do currículo: <strong>não são editais nem vagas reais</strong> e podem citar instituições de exemplo.
                    Para editais reais e verificados, veja o{" "}
                    <Link href="/oportunidades" className="font-semibold underline">catálogo de editais</Link>.
                  </p>
                  <ul className="space-y-2">
                    {(result.oportunidades ?? []).map((o, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-amber-500 shrink-0">→</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Sugestões de Melhoria */}
            <TabsContent value="melhorias">
              <div className="space-y-4">
                {/* Índice de Maturidade Científica */}
                {result.maturidadeCientifica && (
                  <Card className="border-lens/30 bg-lens-tint/40">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-lens" />
                        ⭐ Índice de Maturidade Científica
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-4">
                        <p className={`text-4xl font-black ${(result.maturidadeCientifica.score ?? 0) >= 70 ? "text-lens" : (result.maturidadeCientifica.score ?? 0) >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {result.maturidadeCientifica.score}<span className="text-base font-normal text-muted-foreground">/100</span>
                        </p>
                        <div className="flex-1">
                          <div className="w-full bg-muted rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition ${(result.maturidadeCientifica.score ?? 0) >= 70 ? "bg-lens" : (result.maturidadeCientifica.score ?? 0) >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${result.maturidadeCientifica.score ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/80">{result.maturidadeCientifica.explicacao}</p>
                      {(result.maturidadeCientifica.fatoresRedutores ?? []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Fatores que reduziram a pontuação</p>
                          <ul className="space-y-1">
                            {(result.maturidadeCientifica.fatoresRedutores ?? []).map((f, i) => (
                              <li key={i} className="flex gap-2 text-sm"><span className="text-red-400 shrink-0">↓</span><span>{f}</span></li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(result.maturidadeCientifica.acoesPrioritarias ?? []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ações prioritárias para melhorar</p>
                          <ol className="space-y-1">
                            {(result.maturidadeCientifica.acoesPrioritarias ?? []).map((a, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="w-4 h-4 rounded-full bg-lens-tint text-lens text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                <span>{a}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground italic">⚠ Esta pontuação é uma estimativa gerada pela IA com base no conteúdo do currículo. Não substitui avaliação oficial.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Sugestões por categoria */}
                {result.sugestoesMelhoria && (
                  <div className="space-y-3">
                    {(result.sugestoesMelhoria.curriculo ?? []).length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-lens" /> Currículo</CardTitle></CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {(result.sugestoesMelhoria.curriculo ?? []).map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-lens shrink-0 mt-0.5" /><span>{s}</span></li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    {(result.sugestoesMelhoria.producaoCientifica ?? []).length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-lens" /> Produção Científica</CardTitle></CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {(result.sugestoesMelhoria.producaoCientifica ?? []).map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-lens shrink-0 mt-0.5" /><span>{s}</span></li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    {(result.sugestoesMelhoria.competencias ?? []).length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-lens" /> Competências</CardTitle></CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {(result.sugestoesMelhoria.competencias ?? []).map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-lens shrink-0 mt-0.5" /><span>{s}</span></li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    <p className="text-xs text-muted-foreground italic px-1">💡 Estas sugestões são recomendações geradas pela IA com base no conteúdo do currículo.</p>
                  </div>
                )}

                {!result.sugestoesMelhoria && !result.maturidadeCientifica && (
                  <p className="text-sm text-muted-foreground">Nenhuma sugestão de melhoria disponível.</p>
                )}
              </div>
            </TabsContent>

            {/* Aba: Alertas (exibida apenas se houver) */}
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
        </div>
      )}

      {/* Estado vazio — antes de qualquer análise */}
      {stage === "idle" && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-lens-tint flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-lens" />
          </div>
          <p className="text-sm font-medium">Nenhuma análise realizada ainda</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Faça upload do PDF ou cole o texto do seu currículo Lattes para começar.
          </p>
          <div className="mt-6">
            <Link href="/niasci" className={buttonVariants({ variant: "ghost", size: "sm" })}>← Voltar ao NIASci</Link>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Vínculo com o perfil docente: leva áreas e competências extraídas do currículo para
 * "Meu perfil" (somando ao que já existe, sem duplicar), com confirmação. Ficam como
 * dado autodeclarado — o docente revisa em Meu perfil.
 */
function AddToProfile({ areas, competencias }: { areas: string[]; competencias: string[] }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!areas.length && !competencias.length) return null;
  if (!user)
    return (
      <p className="mb-4 rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink-2">
        <Link href="/login?next=/niasci/elattes" className="font-semibold text-lens underline">Entre</Link> para levar estas áreas e competências para o seu perfil docente e receber recomendações de editais.
      </p>
    );
  const add = async () => {
    if (busy) return;
    if (!window.confirm(`Adicionar ${areas.length} área(s) e ${competencias.length} competência(s) ao seu perfil docente? Você pode revisar tudo em Meu perfil.`)) return;
    setBusy(true);
    try {
      const { profile } = await apiFetch<{ profile: TeacherProfile }>("/profile");
      const merge = (a: string[], b: string[]) => Array.from(new Set([...a, ...b.map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 120)])).slice(0, 40);
      await apiFetch("/profile", { method: "PUT", body: JSON.stringify({ areas: merge(profile.areas, areas), competencies: merge(profile.competencies, competencias) }) });
      setDone(true);
      toast({ title: "Perfil atualizado", description: "Áreas e competências adicionadas. As recomendações serão recalculadas." });
    } catch (e) {
      toast({ title: "Não foi possível atualizar o perfil", description: e instanceof Error ? e.message : "Nada foi alterado.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-white px-4 py-3">
      <p className="text-sm text-ink-2">
        {done ? "Adicionado ao seu perfil docente." : `Usar ${areas.length} área(s) e ${competencias.length} competência(s) deste currículo nas suas recomendações de editais?`}
      </p>
      {done ? (
        <Link href="/perfil" className="text-sm font-semibold text-lens underline">Revisar em Meu perfil</Link>
      ) : (
        <Button size="sm" onClick={add} disabled={busy} aria-busy={busy}>{busy ? "Adicionando…" : "Adicionar ao meu perfil docente"}</Button>
      )}
    </div>
  );
}
