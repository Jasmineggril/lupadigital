/**
 * @file artigos.tsx
 * @description Módulo Artigos Científicos do NIASci — análise de artigos via IA.
 *
 * Objetivo do componente:
 *   Permite ao usuário fazer upload de um artigo em PDF ou colar o texto,
 *   e receber análise estruturada com todos os componentes acadêmicos (IMRaD):
 *   resumo, objetivo, metodologia, resultados, conclusões, limitações,
 *   referências, citações, palavras-chave e sugestões de uso.
 *
 * Fluxo de execução:
 *   1. Usuário envia PDF ou cola texto do artigo
 *   2. Texto é extraído do PDF via extractTextFromPdf() (lib/pdf.ts)
 *   3. POST /api/niasci/artigos/analyze envia o texto ao backend
 *   4. Backend chama analyzeArtigo() do AIService
 *   5. Resultado é exibido em abas e salvo via saveArticleAnalysis()
 *   6. Histórico carregado via listArticleAnalyses()
 *
 * Integração com AIService:
 *   - Todo processamento passa pelo backend → aiService.analyzeArtigo()
 *
 * Integração com Supabase:
 *   - saveArticleAnalysis(): persiste resultado
 *   - listArticleAnalyses(): carrega histórico
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
  saveArticleAnalysis,
  listArticleAnalyses,
  deleteArticleAnalysis,
} from "@/services/analisesService";
import type { ArticleAnalysis } from "@/lib/supabase-types";
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
  FileText, Target, FlaskConical, TrendingUp, CheckSquare, BookOpen,
  Quote, Tag, Lightbulb, AlertCircle, Sparkles, AlertTriangle,
} from "lucide-react";

// ── Tipos locais ─────────────────────────────────────────────────────────────

/**
 * Estrutura retornada pela API ao analisar um artigo científico.
 * Cobre todos os componentes do formato IMRaD (Introduction, Methods, Results, Discussion).
 */
interface ArtigoResult {
  titulo?: string;
  tipo?: string;
  resumo?: string;
  objetivo?: string;
  metodologia?: string;
  resultados?: string;
  conclusoes?: string;
  limitacoes?: string;
  referencias?: string[];
  citacoes?: { trecho: string; relevancia: string }[];
  keywords?: string[];
  sugestoesDeUso?: string[];
  alertas?: string[];
}

// ── Estágios de análise ───────────────────────────────────────────────────────
const STAGES = [
  { key: "reading",    label: "Lendo o artigo",           description: "Interpretando estrutura e conteúdo do documento." },
  { key: "extracting", label: "Analisando estrutura",      description: "Identificando metodologia, resultados e conclusões." },
  { key: "finalizing", label: "Gerando insights de uso",   description: "Extraindo citações, referências e sugestões de aplicação." },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function Artigos() {
  const { toast } = useToast();

  const [text, setText] = useState("");
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<ArtigoResult | null>(null);

  // Histórico de artigos analisados
  const [history, setHistory] = useState<ArticleAnalysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Carrega histórico de análises de artigos ao montar.
   * listArticleAnalyses() usa Supabase se autenticado, localStorage como fallback.
   */
  useEffect(() => {
    listArticleAnalyses()
      .then((items) => setHistory(items))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    return () => { if (stageTimerRef.current) clearInterval(stageTimerRef.current); };
  }, []);

  /**
   * Extrai texto de um arquivo PDF usando a lib de processamento do LUPA.
   */
  const handleFileLoad = async (file: File) => {
    try {
      const extracted = await extractTextFromPdf(file);
      setText(typeof extracted === "string" ? extracted : (extracted as any).text ?? "");
      toast({ title: "PDF carregado", description: "Texto extraído. Clique em Analisar para continuar." });
    } catch {
      toast({ title: "Erro ao ler PDF", description: "Tente colar o texto manualmente.", variant: "destructive" });
    }
  };

  /**
   * Inicia animação de progresso entre os estágios durante o processamento.
   * Avança entre os estágios a cada 4 segundos (artigos costumam ser maiores).
   */
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
   * Executa a análise do artigo científico.
   *
   * Fluxo:
   * 1. Valida tamanho mínimo do texto
   * 2. Inicia animação de estágios
   * 3. Chama POST /api/niasci/artigos/analyze
   * 4. Persiste resultado via saveArticleAnalysis()
   * 5. Atualiza histórico e exibe resultado em abas
   */
  const handleAnalyze = async () => {
    if (text.trim().length < 50) {
      toast({
        title: "Texto insuficiente",
        description: "Cole um artigo com pelo menos 50 caracteres para análise.",
        variant: "destructive",
      });
      return;
    }

    setResult(null);
    setErrorMessage("");
    startStageAnimation();

    try {
      const response = await fetch(`${API_BASE}/niasci/artigos/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${response.status}`);
      }

      const data: ArtigoResult = await response.json();

      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      // Persiste resultado — Supabase ou localStorage
      const saved = await saveArticleAnalysis({
        title: data.titulo ?? "Artigo sem título",
        authors: [],
        summary: data.resumo ?? "",
        metadata: { result: data } as any,
      });

      setHistory((prev) => [saved as ArticleAnalysis, ...prev].slice(0, 20));
      toast({ title: "Artigo analisado!", description: "A análise completa está pronta." });
    } catch (err) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      const msg = getFriendlyErrorMessage(err);
      setStage("error");
      setErrorMessage(msg);
      toast({ title: "Erro na análise", description: msg, variant: "destructive" });
    }
  };

  /**
   * Restaura análise do histórico — extrai o resultado do campo metadata.
   */
  const handleHistorySelect = (item: ArticleAnalysis) => {
    const r = (item.metadata as any)?.result;
    if (r) {
      setResult(r as ArtigoResult);
      setStage("completed");
      toast({ title: "Análise restaurada", description: "Resultado carregado do histórico." });
    }
  };

  const handleHistoryDelete = async (id: string) => {
    await deleteArticleAnalysis(id);
    setHistory((prev) => prev.filter((p) => p.id !== id));
  };

  /**
   * Monta as seções para exportação como arquivo .txt
   */
  const buildExportSections = () => {
    if (!result) return [];
    return [
      { title: "Título", content: result.titulo ?? "" },
      { title: "Tipo", content: result.tipo ?? "" },
      { title: "Resumo", content: result.resumo ?? "" },
      { title: "Objetivo", content: result.objetivo ?? "" },
      { title: "Metodologia", content: result.metodologia ?? "" },
      { title: "Resultados", content: result.resultados ?? "" },
      { title: "Conclusões", content: result.conclusoes ?? "" },
      { title: "Limitações", content: result.limitacoes ?? "" },
      { title: "Palavras-chave", content: (result.keywords ?? []).join(", ") },
      { title: "Referências", content: (result.referencias ?? []).join("\n") },
      { title: "Sugestões de Uso", content: (result.sugestoesDeUso ?? []).join("\n") },
    ];
  };

  const isLoading = stage !== "idle" && stage !== "completed" && stage !== "error";

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <NiasciHeader
        module="Artigos Científicos"
        moduleColor="text-amber-600 dark:text-amber-400"
        title="Artigos Científicos"
        description="Analise artigos acadêmicos com IA e extraia automaticamente todos os componentes estruturais: objetivo, metodologia, resultados, conclusões, limitações, citações, referências e palavras-chave."
      />

      <HistoryPanel
        items={history}
        onSelect={handleHistorySelect}
        onDelete={handleHistoryDelete}
        getLabel={(a) => (a.metadata as any)?.result?.titulo ?? a.title ?? "Artigo sem título"}
        isLoading={historyLoading}
        accentBg="bg-amber-500/10"
      />

      <InputSection
        text={text}
        onTextChange={setText}
        onFileLoad={handleFileLoad}
        onSubmit={handleAnalyze}
        isLoading={isLoading}
        submitLabel="Analisar artigo"
        placeholder="Cole aqui o texto completo do artigo científico (título, resumo, introdução, métodos, resultados, conclusão, referências)..."
        accentColor="amber"
      />

      <AnalysisProgress
        stage={stage}
        stages={STAGES}
        accentColor="text-amber-500"
        errorMessage={errorMessage}
      />

      {/* Resultados */}
      {result && stage === "completed" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold">{result.titulo ?? "Artigo analisado"}</h2>
              {result.tipo && (
                <Badge variant="outline" className="text-amber-600 border-amber-500/30">{result.tipo}</Badge>
              )}
            </div>
            <ExportButton filename={`artigo-${result.titulo ?? "analise"}`} sections={buildExportSections()} />
          </div>

          {/* Palavras-chave em destaque */}
          {(result.keywords?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(result.keywords ?? []).map((k, i) => (
                <Badge key={i} className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-0 text-xs">{k}</Badge>
              ))}
            </div>
          )}

          <Tabs defaultValue="resumo" className="space-y-4">
            <TabsList className="flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="objetivo">Objetivo</TabsTrigger>
              <TabsTrigger value="metodologia">Metodologia</TabsTrigger>
              <TabsTrigger value="resultados">Resultados</TabsTrigger>
              <TabsTrigger value="conclusoes">Conclusões</TabsTrigger>
              <TabsTrigger value="limitacoes">Limitações</TabsTrigger>
              <TabsTrigger value="referencias">Referências</TabsTrigger>
              <TabsTrigger value="citacoes">Citações</TabsTrigger>
              <TabsTrigger value="uso">Sugestões de Uso</TabsTrigger>
              {(result.alertas?.length ?? 0) > 0 && <TabsTrigger value="alertas">Alertas</TabsTrigger>}
            </TabsList>

            {/* Resumo executivo */}
            <TabsContent value="resumo">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4 text-amber-500" /> Resumo executivo</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.resumo ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Objetivo */}
            <TabsContent value="objetivo">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-amber-500" /> Objetivo da pesquisa</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.objetivo ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Metodologia */}
            <TabsContent value="metodologia">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-amber-500" /> Metodologia</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.metodologia ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Resultados */}
            <TabsContent value="resultados">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-500" /> Resultados</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.resultados ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Conclusões */}
            <TabsContent value="conclusoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><CheckSquare className="w-4 h-4 text-amber-500" /> Conclusões</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.conclusoes ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Limitações */}
            <TabsContent value="limitacoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Limitações do estudo</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.limitacoes ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Referências */}
            <TabsContent value="referencias">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-amber-500" /> Referências bibliográficas</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {(result.referencias ?? []).map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-foreground/80">
                        <span className="text-amber-500 shrink-0 font-bold">[{i + 1}]</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Citações relevantes */}
            <TabsContent value="citacoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Quote className="w-4 h-4 text-amber-500" /> Citações relevantes</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(result.citacoes ?? []).map((c, i) => (
                      <div key={i} className="border-l-2 border-amber-500/30 pl-4">
                        <p className="text-sm italic text-foreground/80">"{c.trecho}"</p>
                        <p className="text-xs text-muted-foreground mt-1">{c.relevancia}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sugestões de uso */}
            <TabsContent value="uso">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Sugestões de uso</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(result.sugestoesDeUso ?? []).map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-amber-500 shrink-0">→</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Alertas */}
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

      {/* Estado vazio */}
      {stage === "idle" && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-sm font-medium">Nenhum artigo analisado ainda</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Faça upload do PDF ou cole o texto do artigo científico para começar a análise.
          </p>
          <div className="mt-6">
            <Link href="/niasci"><Button variant="ghost" size="sm">← Voltar ao NIASci</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
