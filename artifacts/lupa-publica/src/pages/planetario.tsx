import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Globe, Sparkles, BookOpen, HelpCircle, Star, Search,
  ArrowLeft, ChevronRight, Loader2, Users, Lightbulb,
} from "lucide-react";

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

type GlossaryItem = { termo: string; definicao: string };
type RoteiroItem = { subtitulo: string; conteudo: string };
type PlanetarioResult = {
  titulo: string;
  introducao: string;
  roteiro: RoteiroItem[];
  curiosidades: string[];
  perguntas: string[];
  glossario: GlossaryItem[];
  fontes: string[];
};

const audiences = [
  { value: "criancas", label: "Crianças (6–11 anos)", emoji: "🧒" },
  { value: "jovens", label: "Adolescentes (12–17)", emoji: "🧑‍🎓" },
  { value: "adultos", label: "Adultos leigos", emoji: "👩‍💼" },
  { value: "geral", label: "Público geral", emoji: "🌍" },
] as const;

const SUGGESTIONS = [
  "Buracos negros", "Mudanças climáticas", "DNA e genética", "Inteligência artificial",
  "Vacinas e imunidade", "Energia solar", "Micro-organismos", "Sistema solar",
];

export default function Planetario() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState<"criancas" | "jovens" | "adultos" | "geral">("geral");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PlanetarioResult | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/niasci/planetario/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, audience }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao gerar conteúdo");
      }
      const data: PlanetarioResult = await res.json();
      setResult(data);
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Falha ao gerar conteúdo.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Link href="/niasci">
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> NIASci
            </button>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">Planetário</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
          Conteúdo científico acessível para educação
        </h1>
        <p className="text-muted-foreground mt-2 text-base leading-7 max-w-2xl">
          Digite um tema científico e escolha o público. A IA gera roteiro educativo, curiosidades e perguntas para engajar estudantes.
        </p>
      </div>

      {/* Input */}
      <Card className="border-border shadow-sm mb-8">
        <CardContent className="pt-5 space-y-4">
          {/* Topic */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Tema científico
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder="Ex: fotossíntese, gravidade, sistema imune…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/60 bg-card text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all"
              />
            </div>
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setTopic(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/60 hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:text-cyan-600 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Audience */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Público-alvo
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {audiences.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAudience(a.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all
                    ${audience === a.value
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                      : "border-border/60 hover:border-cyan-500/40 hover:bg-muted/20 text-muted-foreground"
                    }`}
                >
                  <span>{a.emoji}</span> {a.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isLoading || !topic.trim()}
            className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2 w-full sm:w-auto"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isLoading ? "Gerando conteúdo com IA…" : "Gerar conteúdo educativo"}
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          <p className="text-sm text-muted-foreground">A IA está criando o conteúdo educativo…</p>
        </div>
      )}

      {/* Results */}
      {result && !isLoading && (
        <div className="space-y-5">
          {/* Title + intro */}
          <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">Planetário NIASci</span>
              </div>
              <CardTitle className="text-xl font-bold leading-snug">{result.titulo}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/80">{result.introducao}</p>
            </CardContent>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Roteiro */}
            <Card className="border-border shadow-sm md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-cyan-700 dark:text-cyan-400">
                  <BookOpen className="w-4 h-4" /> Roteiro educativo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.roteiro?.map((item, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{item.subtitulo}</p>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{item.conteudo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Curiosidades */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Star className="w-4 h-4" /> Curiosidades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {result.curiosidades?.map((c, i) => (
                    <div key={i} className="flex gap-2.5 text-sm">
                      <span className="shrink-0 text-amber-500 mt-0.5">⚡</span>
                      <span className="text-muted-foreground leading-relaxed">{c}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Perguntas */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-violet-600 dark:text-violet-400">
                  <HelpCircle className="w-4 h-4" /> Perguntas para discussão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {result.perguntas?.map((q, i) => (
                    <div key={i} className="flex gap-2.5 text-sm">
                      <span className="shrink-0 font-bold text-violet-400">?</span>
                      <span className="text-muted-foreground leading-relaxed">{q}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Glossário */}
            {result.glossario?.length > 0 && (
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <Lightbulb className="w-4 h-4" /> Glossário
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.glossario.map((g) => (
                      <div key={g.termo}>
                        <span className="text-xs font-bold text-foreground">{g.termo}</span>
                        <span className="text-xs text-muted-foreground"> — {g.definicao}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Fontes */}
            {result.fontes?.length > 0 && (
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <Search className="w-4 h-4" /> Para aprofundar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {result.fontes.map((f, i) => (
                      <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="text-emerald-500 font-bold">{i + 1}.</span> {f}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !isLoading && (
        <div className="rounded-2xl border border-dashed border-border/40 bg-muted/5 p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto mb-3">
            <Globe className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold">Escolha um tema científico</p>
          <p className="text-xs text-muted-foreground mt-1">
            Digite o tema acima, selecione o público e clique em <strong>Gerar conteúdo educativo</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
