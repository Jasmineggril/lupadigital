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

import { apiFetch } from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { newKey, saveRequest, useAutosave } from "@/lib/persistence";
import { SaveStatus } from "@/components/lupa/SaveStatus";

const ARTIGO_MAX_CHARS = 20_000;
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
// Leitor de PDF carregado só quando um arquivo é enviado
const extractTextFromPdf = async (...args: Parameters<(typeof import("@/lib/pdf"))["extractTextFromPdf"]>) => (await import("@/lib/pdf")).extractTextFromPdf(...args);
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

  // Leitura integral ou parcial do último resultado, item aberto e anotações (salvas na conta)
  const [leitura, setLeitura] = useState<{ integral: boolean; caracteres_lidos: number; caracteres_totais: number } | null>(null);
  const [currentItem, setCurrentItem] = useState<ArticleAnalysis | null>(null);
  const [notes, setNotes] = useState("");
  const notesVersion = useRef<number | null>(null);
  const notesSave = useAutosave<string>({
    enabled: Boolean(currentItem?.id),
    value: notes,
    save: async (v) => {
      const meta = { ...((currentItem?.metadata as Record<string, unknown>) ?? {}), anotacoes: v };
      const r = await saveRequest<{ version: number; metadata: unknown }>(`/resources/article_analyses/${currentItem!.id}`, { method: "PUT", body: { metadata: meta }, version: notesVersion.current });
      if (r.ok) {
        notesVersion.current = r.data.version;
        setCurrentItem((c) => (c ? ({ ...c, metadata: r.data.metadata } as ArticleAnalysis) : c));
      }
      return r;
    },
  });

  // Histórico de artigos analisados
  const [history, setHistory] = useState<ArticleAnalysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Carrega histórico de análises de artigos ao montar.
   * listArticleAnalyses() usa Supabase se autenticado, localStorage como fallback.
   */
  // Trabalhos anteriores: falha ao carregar aparece como falha (antes virava lista vazia, parecendo perda)
  const [historyError, setHistoryError] = useState<string | null>(null);
  const loadHistory = () => {
    setHistoryLoading(true);
    setHistoryError(null);
    listArticleAnalyses()
      .then((items) => setHistory(items))
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
      apiFetch<ArticleAnalysis>(`/resources/article_analyses/${encodeURIComponent(id)}`)
        .then((item) => handleHistorySelect(item))
        .catch(() => toast({ title: "Item não encontrado", description: "Este trabalho não está na sua conta (ou foi excluído).", variant: "destructive" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoading]);

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
    saveKeyRef.current = newKey(); // nova análise = novo registro (nunca sobrescreve outra)
    setErrorMessage("");
    startStageAnimation();

    try {
      // Chamada autenticada: a sessão vai junto (limite de uso da conta, não de visitante)
      // O servidor lê até 20 mil caracteres por artigo: acima disso, a leitura é PARCIAL e isso fica dito
      const sent = text.slice(0, ARTIGO_MAX_CHARS);
      const leitura = { integral: text.length <= ARTIGO_MAX_CHARS, caracteres_lidos: sent.length, caracteres_totais: text.length };
      const data = await apiFetch<ArtigoResult>("/niasci/artigos/analyze", { method: "POST", body: JSON.stringify({ text: sent }) });
      setLeitura(leitura);

      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      // Persiste resultado — Supabase ou localStorage
      const saved = await saveArticleAnalysis({
        title: data.titulo ?? "Artigo sem título",
        authors: [],
        summary: data.resumo ?? "",
        // Só o resultado e a fonte (título); o texto do artigo NÃO é guardado
        metadata: { result: data, leitura, anotacoes: "" } as any,
      }, { idempotencyKey: saveKeyRef.current }).catch((e: unknown) => {
        // A análise está pronta; só a gravação falhou — dizer isso, sem marcar a análise como erro
        toast({ title: "Resultado pronto, mas não foi salvo", description: e instanceof Error ? e.message : "Não foi possível salvar no histórico.", variant: "destructive" });
        return null;
      });

      if (saved) {
        setHistory((prev) => [saved as ArticleAnalysis, ...prev].slice(0, 20));
        setCurrentItem(saved as ArticleAnalysis);
        setNotes("");
        notesVersion.current = (saved as { version?: number }).version ?? 1;
        setTimeout(() => notesSave.markSaved(), 0);
      }
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
      setLeitura(((item.metadata as any)?.leitura as typeof leitura) ?? null);
      setCurrentItem(item);
      setNotes(String((item.metadata as any)?.anotacoes ?? ""));
      notesVersion.current = (item as { version?: number }).version ?? 1;
      setTimeout(() => notesSave.markSaved(), 0);
      setStage("completed");
      toast({ title: "Análise restaurada", description: "Resultado carregado do histórico." });
    }
  };

  const handleHistoryDelete = async (id: string) => {
    if (!window.confirm("Excluir este item do histórico? Isso não pode ser desfeito.")) return;
    try {
      await deleteArticleAnalysis(id);
      setHistory((prev) => prev.filter((p) => p.id !== id));
      toast({ title: "Removido do histórico" });
    } catch (e) {
      toast({ title: "Não foi possível excluir", description: e instanceof Error ? e.message : "Nada foi apagado; tente novamente.", variant: "destructive" });
    }
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
        moduleColor="text-lens dark:text-amber-400"
        title="Artigos Científicos"
        description="Analise artigos acadêmicos com IA e extraia automaticamente todos os componentes estruturais: objetivo, metodologia, resultados, conclusões, limitações, citações, referências e palavras-chave."
      />

      <HistoryPanel
        items={history}
        error={historyError}
        onRetry={loadHistory}
        onSelect={handleHistorySelect}
        onDelete={handleHistoryDelete}
        getLabel={(a) => (a.metadata as any)?.result?.titulo ?? a.title ?? "Artigo sem título"}
        isLoading={historyLoading}
        accentBg="bg-lens-tint"
      />

      <InputSection
        text={text}
        onTextChange={setText}
        onFileLoad={handleFileLoad}
        onSubmit={handleAnalyze}
        isLoading={isLoading}
        submitLabel="Analisar artigo"
        placeholder="Cole aqui o texto completo do artigo científico (título, resumo, introdução, métodos, resultados, conclusão, referências)…"
        accentColor="amber"
      />

      <AnalysisProgress
        stage={stage}
        stages={STAGES}
        accentColor="text-lens"
        errorMessage={errorMessage}
      />

      {/* Resultados */}
      {result && stage === "completed" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-lens" />
              <h2 className="text-lg font-bold">{result.titulo ?? "Artigo analisado"}</h2>
              {result.tipo && (
                <Badge variant="outline" className="text-lens border-lens/30">{result.tipo}</Badge>
              )}
            </div>
            <ExportButton filename={`artigo-${result.titulo ?? "analise"}`} sections={buildExportSections()} />
          </div>

          {leitura && (
            <p
              data-testid="artigo-leitura"
              data-integral={leitura.integral ? "1" : "0"}
              className={`mb-3 rounded-md border p-2 text-xs ${leitura.integral ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`}
            >
              {leitura.integral
                ? `Leitura integral: ${leitura.caracteres_totais.toLocaleString("pt-BR")} caracteres analisados.`
                : `Leitura PARCIAL: foram analisados ${leitura.caracteres_lidos.toLocaleString("pt-BR")} de ${leitura.caracteres_totais.toLocaleString("pt-BR")} caracteres (início do texto). Seções finais podem não estar refletidas.`}
            </p>
          )}

          {currentItem?.id && (
            <div className="mb-4 rounded-lg border p-3">
              <label htmlFor="artigo-anotacoes" className="text-sm font-semibold">Minhas anotações sobre este artigo</label>
              <p className="text-xs text-muted-foreground">Salvas automaticamente na sua conta junto com o resultado. O texto do artigo não é guardado — só a análise e as anotações.</p>
              <textarea
                id="artigo-anotacoes"
                data-testid="artigo-anotacoes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 20_000))}
                rows={3}
                className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
              />
              <SaveStatus
                state={notesSave.state}
                error={notesSave.error}
                savedAt={notesSave.savedAt}
                onRetry={notesSave.retry}
                onResolveConflict={(c) => {
                  const atual = notesSave.conflict as ArticleAnalysis | null;
                  if (!atual) return;
                  notesVersion.current = (atual as { version?: number }).version ?? null;
                  setCurrentItem(atual);
                  if (c === "servidor") {
                    const n = String((atual.metadata as any)?.anotacoes ?? "");
                    setNotes(n);
                    notesSave.markSaved(n);
                  } else {
                    // Manter a minha: grava por cima da versão atual (agora conhecida)
                    notesSave.markSaved(String((atual.metadata as any)?.anotacoes ?? ""));
                    setTimeout(() => notesSave.retry(), 0);
                  }
                }}
              />
            </div>
          )}

          {/* Palavras-chave em destaque */}
          {(result.keywords?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(result.keywords ?? []).map((k, i) => (
                <Badge key={i} className="bg-lens-tint text-lens dark:text-amber-300 border-0 text-xs">{k}</Badge>
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
                <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4 text-lens" /> Resumo executivo</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.resumo ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Objetivo */}
            <TabsContent value="objetivo">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-lens" /> Objetivo da pesquisa</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.objetivo ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Metodologia */}
            <TabsContent value="metodologia">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-lens" /> Metodologia</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.metodologia ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Resultados */}
            <TabsContent value="resultados">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-lens" /> Resultados</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.resultados ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Conclusões */}
            <TabsContent value="conclusoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><CheckSquare className="w-4 h-4 text-lens" /> Conclusões</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.conclusoes ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Limitações */}
            <TabsContent value="limitacoes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-lens" /> Limitações do estudo</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.limitacoes ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Referências */}
            <TabsContent value="referencias">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-lens" /> Referências bibliográficas</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {(result.referencias ?? []).map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-foreground/80">
                        <span className="text-lens shrink-0 font-bold">[{i + 1}]</span>
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Quote className="w-4 h-4 text-lens" /> Citações relevantes</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(result.citacoes ?? []).map((c, i) => (
                      <div key={i} className="border-l-2 border-lens/30 pl-4">
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-lens" /> Sugestões de uso</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(result.sugestoesDeUso ?? []).map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-lens shrink-0">→</span>
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
                <Card className="border-lens/30">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-lens"><AlertCircle className="w-4 h-4" /> Pontos de atenção</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(result.alertas ?? []).map((a, i) => (
                        <li key={i} className="text-sm text-lens dark:text-amber-300">{a}</li>
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
          <div className="w-16 h-16 rounded-2xl bg-lens-tint flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-lens" />
          </div>
          <p className="text-sm font-medium">Nenhum artigo analisado ainda</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Faça upload do PDF ou cole o texto do artigo científico para começar a análise.
          </p>
          <div className="mt-6">
            <Link href="/niasci" className={buttonVariants({ variant: "ghost", size: "sm" })}>← Voltar ao NIASci</Link>
          </div>
        </div>
      )}
    </div>
  );
}
