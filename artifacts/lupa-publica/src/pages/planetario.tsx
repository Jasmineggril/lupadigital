/**
 * @file planetario.tsx
 * @description Módulo Planetário do NIASci — gerador de conteúdo científico educativo.
 *
 * Objetivo do componente:
 *   Gera roteiros educativos completos sobre qualquer tema científico,
 *   adaptados ao público-alvo escolhido (crianças, jovens, adultos ou geral).
 *   Inclui explicação simplificada, roteiro estruturado, curiosidades, quiz,
 *   slides, glossário e fontes de aprofundamento.
 *
 * Fluxo de execução:
 *   1. Usuário informa o tema e seleciona o público-alvo
 *   2. POST /api/niasci/planetario/generate envia os dados ao backend
 *   3. Backend chama generatePlanetario() do AIService
 *   4. Resultado é exibido em abas e salvo via savePlanetariumContent()
 *   5. Histórico carregado via listPlanetariumContents()
 *
 * Integração com AIService:
 *   - Todo processamento passa pelo backend → aiService.generatePlanetario()
 *
 * Integração com Supabase:
 *   - savePlanetariumContent(): persiste resultado
 *   - listPlanetariumContents(): carrega histórico
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  savePlanetariumContent,
  listPlanetariumContents,
  deletePlanetariumContent,
} from "@/services/analisesService";
import type { PlanetariumContent } from "@/lib/supabase-types";
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
  Star, BookOpen, HelpCircle, Puzzle, Presentation, BookMarked,
  Link2, Sparkles, AlertCircle, Loader2,
} from "lucide-react";

// ── Tipos locais ─────────────────────────────────────────────────────────────

/**
 * Forma do objeto retornado pela API do Planetário.
 * Cada campo corresponde a uma seção do conteúdo educativo gerado.
 */
interface PlanetarioResult {
  titulo?: string;
  introducao?: string;
  explicacaoSimplificada?: string;
  roteiro?: { subtitulo: string; conteudo: string }[];
  curiosidades?: string[];
  perguntas?: string[];
  quiz?: { pergunta: string; opcoes: string[]; resposta: string; explicacao: string }[];
  slides?: { titulo: string; conteudo: string; emoji: string }[];
  glossario?: { termo: string; definicao: string }[];
  fontes?: string[];
}

// ── Configuração de públicos-alvo ─────────────────────────────────────────────
/**
 * Opções de público-alvo com emoji e rótulo para exibição.
 * Enviados ao backend para adaptar a linguagem do conteúdo gerado.
 */
const AUDIENCES = [
  { value: "criancas", label: "Crianças", emoji: "🧒", desc: "6–11 anos, linguagem lúdica" },
  { value: "jovens",   label: "Jovens",    emoji: "🧑‍🎓", desc: "12–17 anos, linguagem engajante" },
  { value: "adultos",  label: "Adultos",   emoji: "👤", desc: "Público leigo adulto" },
  { value: "geral",    label: "Geral",     emoji: "🌍", desc: "Todas as idades" },
] as const;

// ── Sugestões rápidas de temas ────────────────────────────────────────────────
/**
 * Temas sugeridos para clique rápido sem precisar digitar.
 * Representam os tópicos mais solicitados em experiências de divulgação científica.
 */
const QUICK_TOPICS = [
  "Buracos negros", "Fotossíntese", "Evolução das espécies",
  "Inteligência artificial", "Mudanças climáticas", "DNA e genética",
  "Sistema solar", "Física quântica", "Microbioma humano", "Vulcões",
];

// ── Estágios de análise ───────────────────────────────────────────────────────
const STAGES = [
  { key: "reading",    label: "Pesquisando o tema",         description: "Interpretando o tema e selecionando abordagem adequada." },
  { key: "extracting", label: "Criando roteiro educativo",  description: "Estruturando explicação, curiosidades e quiz." },
  { key: "finalizing", label: "Adaptando linguagem",        description: "Ajustando o conteúdo ao público-alvo selecionado." },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function Planetario() {
  const { toast } = useToast();

  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState<"criancas" | "jovens" | "adultos" | "geral">("geral");
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<PlanetarioResult | null>(null);

  // Quiz: estado de resposta selecionada por questão
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizRevealed, setQuizRevealed] = useState<Record<number, boolean>>({});

  // Histórico
  const [history, setHistory] = useState<PlanetariumContent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listPlanetariumContents()
      .then((items) => setHistory(items))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
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
   * Gera o conteúdo educativo via IA.
   *
   * Fluxo:
   * 1. Valida o tema (mínimo 3 caracteres)
   * 2. Inicia animação de estágios
   * 3. Chama POST /api/niasci/planetario/generate
   * 4. Salva resultado via savePlanetariumContent()
   * 5. Atualiza histórico e exibe resultado em abas
   */
  const handleGenerate = async () => {
    if (topic.trim().length < 3) {
      toast({ title: "Tema inválido", description: "Informe um tema com pelo menos 3 caracteres.", variant: "destructive" });
      return;
    }

    setResult(null);
    setQuizAnswers({});
    setQuizRevealed({});
    setErrorMessage("");
    startStageAnimation();

    try {
      const response = await fetch(`${API_BASE}/niasci/planetario/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, audience }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${response.status}`);
      }

      const data: PlanetarioResult = await response.json();

      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      setStage("completed");
      setResult(data);

      // Persiste no Supabase ou localStorage
      const saved = await savePlanetariumContent({
        title: data.titulo ?? topic,
        content: data.introducao ?? "",
        audience,
        metadata: { result: data } as any,
      });

      setHistory((prev) => [saved as PlanetariumContent, ...prev].slice(0, 20));
      toast({ title: "Conteúdo gerado!", description: `Roteiro sobre "${topic}" está pronto.` });
    } catch (err) {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      const msg = getFriendlyErrorMessage(err);
      setStage("error");
      setErrorMessage(msg);
      toast({ title: "Erro ao gerar conteúdo", description: msg, variant: "destructive" });
    }
  };

  const handleHistorySelect = (item: PlanetariumContent) => {
    const r = (item.metadata as any)?.result;
    if (r) {
      setResult(r as PlanetarioResult);
      setStage("completed");
      setQuizAnswers({});
      setQuizRevealed({});
      toast({ title: "Conteúdo restaurado", description: "Resultado carregado do histórico." });
    }
  };

  const handleHistoryDelete = async (id: string) => {
    await deletePlanetariumContent(id);
    setHistory((prev) => prev.filter((p) => p.id !== id));
  };

  const buildExportSections = () => {
    if (!result) return [];
    return [
      { title: "Título", content: result.titulo ?? "" },
      { title: "Introdução", content: result.introducao ?? "" },
      { title: "Explicação simplificada", content: result.explicacaoSimplificada ?? "" },
      { title: "Roteiro", content: (result.roteiro ?? []).map((r) => `${r.subtitulo}\n${r.conteudo}`).join("\n\n") },
      { title: "Curiosidades", content: (result.curiosidades ?? []).join("\n") },
      { title: "Perguntas para discussão", content: (result.perguntas ?? []).join("\n") },
      { title: "Glossário", content: (result.glossario ?? []).map((g) => `${g.termo}: ${g.definicao}`).join("\n") },
      { title: "Fontes", content: (result.fontes ?? []).join("\n") },
    ];
  };

  const isLoading = stage !== "idle" && stage !== "completed" && stage !== "error";

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <NiasciHeader
        module="Planetário"
        moduleColor="text-violet-600 dark:text-violet-400"
        title="Planetário"
        description="Gere roteiros científicos educativos completos sobre qualquer tema — adaptados ao público-alvo. Inclui explicação simplificada, roteiro, curiosidades, quiz interativo, slides e fontes."
      />

      <HistoryPanel
        items={history}
        onSelect={handleHistorySelect}
        onDelete={handleHistoryDelete}
        getLabel={(p) => p.title ?? (p.metadata as any)?.result?.titulo ?? "Conteúdo sem título"}
        isLoading={historyLoading}
        accentBg="bg-violet-500/10"
      />

      {/* Seção de entrada: tema + seletor de público-alvo */}
      <div className="mb-8">
        <div className="grid md:grid-cols-[1fr_260px] gap-4">
          {/* Seletor de público-alvo */}
          <div className="order-2 md:order-1 space-y-3">
            {/* Público-alvo */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                Público-alvo
              </label>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setAudience(a.value)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all
                      ${audience === a.value
                        ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        : "border-border/60 hover:border-violet-500/30 text-muted-foreground"}`}
                  >
                    <span className="text-lg">{a.emoji}</span>
                    <div>
                      <p className="text-xs font-semibold">{a.label}</p>
                      <p className="text-[10px] opacity-70">{a.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sugestões rápidas */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                Sugestões rápidas
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TOPICS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/60 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Campo de tema + botão */}
          <div className="order-1 md:order-2 flex flex-col gap-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tema científico
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Fotossíntese, Buracos negros, Evolução das espécies..."
              rows={4}
              className="w-full px-4 py-3 rounded-2xl border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
            />
            <Button
              onClick={handleGenerate}
              disabled={isLoading || topic.trim().length < 3}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>✦</span>}
              {isLoading ? "Gerando conteúdo…" : "Gerar conteúdo educativo"}
            </Button>
          </div>
        </div>
      </div>

      <AnalysisProgress
        stage={stage}
        stages={STAGES}
        accentColor="text-violet-500"
        errorMessage={errorMessage}
      />

      {/* Resultados */}
      {result && stage === "completed" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <h2 className="text-lg font-bold">{result.titulo ?? topic}</h2>
              <Badge variant="outline" className="text-violet-600 border-violet-500/30">
                {AUDIENCES.find((a) => a.value === audience)?.emoji} {AUDIENCES.find((a) => a.value === audience)?.label}
              </Badge>
            </div>
            <ExportButton filename={`planetario-${topic.replace(/\s+/g, "-")}`} sections={buildExportSections()} />
          </div>

          {/* Introdução em destaque */}
          {result.introducao && (
            <Card className="mb-4 border-violet-500/20 bg-violet-500/5">
              <CardContent className="pt-4">
                <p className="text-sm leading-7 italic text-foreground/90">{result.introducao}</p>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="explicacao" className="space-y-4">
            <TabsList className="flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="explicacao">Explicação</TabsTrigger>
              <TabsTrigger value="roteiro">Roteiro</TabsTrigger>
              <TabsTrigger value="curiosidades">Curiosidades</TabsTrigger>
              <TabsTrigger value="perguntas">Perguntas</TabsTrigger>
              <TabsTrigger value="quiz">Quiz</TabsTrigger>
              <TabsTrigger value="slides">Slides</TabsTrigger>
              <TabsTrigger value="glossario">Glossário</TabsTrigger>
              <TabsTrigger value="fontes">Fontes</TabsTrigger>
              {(result as any).alertas?.length > 0 && <TabsTrigger value="alertas">Alertas</TabsTrigger>}
            </TabsList>

            {/* Explicação simplificada */}
            <TabsContent value="explicacao">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-500" /> Explicação simplificada</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-7">{result.explicacaoSimplificada ?? "—"}</p></CardContent>
              </Card>
            </TabsContent>

            {/* Roteiro educativo */}
            <TabsContent value="roteiro">
              <div className="space-y-3">
                {(result.roteiro ?? []).map((r, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-violet-500/10 text-violet-600 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                        {r.subtitulo}
                      </CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-sm leading-7 text-foreground/90">{r.conteudo}</p></CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Curiosidades */}
            <TabsContent value="curiosidades">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Star className="w-4 h-4 text-violet-500" /> Curiosidades científicas</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {(result.curiosidades ?? []).map((c, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="text-violet-500 font-bold shrink-0">✦</span>
                        <span className="text-sm">{c}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Perguntas para discussão */}
            <TabsContent value="perguntas">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><HelpCircle className="w-4 h-4 text-violet-500" /> Perguntas para discussão</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(result.perguntas ?? []).map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm p-3 rounded-xl bg-muted/20">
                        <span className="text-violet-500 font-bold shrink-0">{i + 1}.</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Quiz interativo */}
            <TabsContent value="quiz">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Puzzle className="w-4 h-4 text-violet-500" /> Quiz</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {(result.quiz ?? []).map((q, i) => (
                      <div key={i} className="space-y-2">
                        <p className="text-sm font-semibold">{i + 1}. {q.pergunta}</p>
                        <div className="grid gap-1.5">
                          {(q.opcoes ?? []).map((opt, j) => {
                            const letter = String.fromCharCode(65 + j); // A, B, C, D
                            const isSelected = quizAnswers[i] === letter;
                            const isCorrect = letter === q.resposta;
                            const revealed = quizRevealed[i];

                            return (
                              <button
                                key={j}
                                onClick={() => {
                                  setQuizAnswers((prev) => ({ ...prev, [i]: letter }));
                                  setQuizRevealed((prev) => ({ ...prev, [i]: true }));
                                }}
                                className={`text-left px-3 py-2 rounded-lg text-sm transition-all border
                                  ${revealed && isCorrect ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}
                                  ${revealed && isSelected && !isCorrect ? "border-red-500 bg-red-500/10 text-red-700" : ""}
                                  ${!revealed ? "border-border/60 hover:border-violet-500/40 hover:bg-violet-500/5" : ""}
                                `}
                              >
                                <span className="font-semibold mr-2">{letter})</span>{opt}
                              </button>
                            );
                          })}
                        </div>
                        {quizRevealed[i] && (
                          <p className="text-xs text-muted-foreground bg-muted/20 px-3 py-2 rounded-lg">
                            💡 {q.explicacao}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Slides */}
            <TabsContent value="slides">
              <div className="grid sm:grid-cols-2 gap-3">
                {(result.slides ?? []).map((s, i) => (
                  <Card key={i} className="border-violet-500/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span className="text-2xl">{s.emoji}</span>
                        {s.titulo}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs leading-6 text-foreground/80">{s.conteudo}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Glossário */}
            <TabsContent value="glossario">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BookMarked className="w-4 h-4 text-violet-500" /> Glossário</CardTitle></CardHeader>
                <CardContent>
                  <dl className="space-y-3">
                    {(result.glossario ?? []).map((g, i) => (
                      <div key={i}>
                        <dt className="text-sm font-semibold text-violet-700 dark:text-violet-300">{g.termo}</dt>
                        <dd className="text-sm text-foreground/80 mt-0.5">{g.definicao}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Fontes */}
            <TabsContent value="fontes">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4 text-violet-500" /> Fontes para aprofundamento</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(result.fontes ?? []).map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-violet-500 shrink-0">→</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Alertas */}
            {(result as any).alertas?.length > 0 && (
              <TabsContent value="alertas">
                <Card className="border-amber-500/30">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-amber-600"><AlertCircle className="w-4 h-4" /> Pontos de atenção</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {((result as any).alertas ?? []).map((a: string, i: number) => (
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
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
            <Star className="w-8 h-8 text-violet-500" />
          </div>
          <p className="text-sm font-medium">Nenhum conteúdo gerado ainda</p>
          <p className="text-xs mt-1 max-w-sm mx-auto">
            Informe um tema científico, escolha o público-alvo e clique em gerar.
          </p>
          <div className="mt-6">
            <Link href="/niasci"><Button variant="ghost" size="sm">← Voltar ao NIASci</Button></Link>
          </div>
        </div>
      )}
    </div>
  );
}
