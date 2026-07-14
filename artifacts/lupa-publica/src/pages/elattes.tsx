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

import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { extractTextFromPdf } from "@/lib/pdf";
import {
  saveLattesProfile,
  getLattesProfiles,
  deleteLattesProfile,
} from "@/services/analisesService";
import type { LattesProfile } from "@/lib/supabase-types";
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
  useEffect(() => {
    getLattesProfiles()
      .then((profiles) => setHistory(profiles as LattesProfile[]))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

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
    setErrorMessage("");
    startStageAnimation();

    try {
      const response = await fetch(`${API_BASE}/niasci/elattes/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${response.status}`);
      }

      const data: LattesResult = await response.json();

      // Para a animação e marca como concluído
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      // Persiste no Supabase ou localStorage
      const saved = await saveLattesProfile({
        name: data.nomeInferido ?? "Pesquisador",
        lattes_xml: text.slice(0, 2000),
        summary: data.resumo ?? "",
        metadata: { result: data } as any,
      });

      // Atualiza o histórico com o novo item
      setHistory((prev) => [saved as LattesProfile, ...prev].slice(0, 20));

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
      toast({ title: "Análise restaurada", description: "Resultado carregado do histórico." });
    }
  };

  /**
   * Exclui um item do histórico pelo ID.
   */
  const handleHistoryDelete = async (id: string) => {
    await deleteLattesProfile(id);
    setHistory((prev) => prev.filter((p) => p.id !== id));
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
        moduleColor="text-emerald-600 dark:text-emerald-400"
        title="e-Lattes"
        description="Faça upload do seu currículo Lattes em PDF ou cole o texto para receber uma análise completa: resumo executivo, linha do tempo, competências, publicações e sugestões de editais compatíveis com seu perfil."
      />

      {/* Histórico de análises anteriores */}
      <HistoryPanel
        items={history}
        onSelect={handleHistorySelect}
        onDelete={handleHistoryDelete}
        getLabel={(p) => (p.metadata as any)?.result?.resumo?.slice(0, 80) ?? p.name ?? "Análise sem título"}
        isLoading={historyLoading}
        accentBg="bg-emerald-500/10"
      />

      {/* Seção de entrada: upload PDF + textarea */}
      <InputSection
        text={text}
        onTextChange={setText}
        onFileLoad={handleFileLoad}
        onSubmit={handleAnalyze}
        isLoading={isLoading}
        submitLabel="Analisar currículo"
        placeholder="Cole aqui o texto do seu currículo Lattes (Plataforma Lattes → Imprimir CV → copiar texto)..."
        accentColor="emerald"
      />

      {/* Indicador visual de progresso durante a análise */}
      <AnalysisProgress
        stage={stage}
        stages={STAGES}
        accentColor="text-emerald-500"
        errorMessage={errorMessage}
      />

      {/* Resultados em abas */}
      {result && stage === "completed" && (
        <div>
          {/* Cabeçalho dos resultados com botão de exportação */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-bold">Resultado da análise</h2>
              {result.nomeInferido && (
                <Badge variant="outline" className="text-emerald-600 border-emerald-500/30">
                  {result.nomeInferido}
                </Badge>
              )}
            </div>
            <ExportButton
              filename={`lattes-${result.nomeInferido ?? "perfil"}`}
              sections={buildExportSections()}
            />
          </div>

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
                <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-4 h-4 text-emerald-500" /> Resumo executivo</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-foreground/90">{result.resumo ?? "Sem resumo disponível."}</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Linha do tempo acadêmica */}
            <TabsContent value="timeline">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-500" /> Linha do tempo acadêmica</CardTitle></CardHeader>
                <CardContent>
                  {(result.timeline ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum evento identificado no currículo.</p>
                  ) : (
                    <div className="space-y-3">
                      {(result.timeline ?? []).map((item, i) => (
                        <div key={i} className="flex gap-4">
                          <div className="shrink-0 w-14 text-right">
                            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30">{item.year}</Badge>
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-emerald-500" /> Competências identificadas</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(result.competencias ?? []).map((c, i) => (
                      <Badge key={i} className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-0">{c}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Produção científica */}
            <TabsContent value="publicacoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-500" /> Produção científica</CardTitle></CardHeader>
                <CardContent>
                  {(result.publicacoes ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma publicação identificada.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(result.publicacoes ?? []).map((p, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-emerald-500 shrink-0">•</span>
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-500" /> Áreas de pesquisa</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(result.areas ?? []).map((a, i) => (
                      <Badge key={i} variant="outline" className="text-emerald-600 border-emerald-500/30">{a}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba: Sugestões de editais */}
            <TabsContent value="sugestoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-emerald-500" /> Editais sugeridos</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(result.sugestoes ?? []).map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-emerald-500" /> Oportunidades</CardTitle></CardHeader>
                <CardContent>
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
                  <Card className="border-emerald-500/30 bg-emerald-50/40">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-emerald-500" />
                        ⭐ Índice de Maturidade Científica
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-4">
                        <p className={`text-4xl font-black ${(result.maturidadeCientifica.score ?? 0) >= 70 ? "text-emerald-600" : (result.maturidadeCientifica.score ?? 0) >= 40 ? "text-amber-600" : "text-red-500"}`}>
                          {result.maturidadeCientifica.score}<span className="text-base font-normal text-muted-foreground">/100</span>
                        </p>
                        <div className="flex-1">
                          <div className="w-full bg-muted rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all ${(result.maturidadeCientifica.score ?? 0) >= 70 ? "bg-emerald-500" : (result.maturidadeCientifica.score ?? 0) >= 40 ? "bg-amber-400" : "bg-red-400"}`}
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
                                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
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
                        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-500" /> Currículo</CardTitle></CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {(result.sugestoesMelhoria.curriculo ?? []).map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span>{s}</span></li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    {(result.sugestoesMelhoria.producaoCientifica ?? []).length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-500" /> Produção Científica</CardTitle></CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {(result.sugestoesMelhoria.producaoCientifica ?? []).map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span>{s}</span></li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                    {(result.sugestoesMelhoria.competencias ?? []).length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-emerald-500" /> Competências</CardTitle></CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {(result.sugestoesMelhoria.competencias ?? []).map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span>{s}</span></li>
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
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-emerald-500" />
          </div>
          <p className="text-sm font-medium">Nenhuma análise realizada ainda</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Faça upload do PDF ou cole o texto do seu currículo Lattes para começar.
          </p>
          <div className="mt-6">
            <Link href="/niasci">
              <Button variant="ghost" size="sm">← Voltar ao NIASci</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
