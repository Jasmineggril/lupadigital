import { Link } from "wouter";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen, FileText, Target, FlaskConical, BarChart2, CheckCircle,
  Quote, Tag, Upload, Sparkles, ArrowLeft, ChevronRight, Loader2,
} from "lucide-react";
import { extractTextFromPdf } from "@/lib/pdf";

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

type CitacaoItem = { trecho: string; relevancia: string };
type ArtigosResult = {
  titulo: string;
  resumo: string;
  objetivo: string;
  metodologia: string;
  resultados: string;
  conclusoes: string;
  referencias: string[];
  citacoes: CitacaoItem[];
  keywords: string[];
  tipo: string;
};

function Section({ icon, title, color, children }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${color}`}>
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function Artigos() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ArtigosResult | null>(null);

  const loadPdf = async (file: File) => {
    setFileName(file.name);
    try {
      const { text: extracted } = await extractTextFromPdf(file);
      setText(extracted || "");
    } catch {
      toast({ title: "Erro ao ler PDF", description: "Verifique se o arquivo contém texto pesquisável.", variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type === "application/pdf") loadPdf(file);
  };

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/niasci/artigos/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro na análise");
      }
      const data: ArtigosResult = await res.json();
      setResult(data);
      toast({ title: "Análise concluída", description: "O artigo foi interpretado com sucesso." });
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Falha ao analisar o artigo.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Link href="/niasci">
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> NIASci
            </button>
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Artigos Científicos</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
          Resumo e insight de artigos científicos
        </h1>
        <p className="text-muted-foreground mt-2 text-base leading-7 max-w-2xl">
          Cole o texto ou envie o PDF do artigo para extrair resumo, objetivo, metodologia, resultados, referências e citações via IA.
        </p>
      </div>

      {/* Input */}
      <div className="grid md:grid-cols-[260px_1fr] gap-4 mb-8">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 min-h-[180px] p-6 text-center
            ${isDragging ? "border-amber-500 bg-amber-500/5" : "border-border/60 hover:border-amber-500/50 hover:bg-muted/20"}`}
        >
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadPdf(f); }} />
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Upload className="w-5 h-5" />
          </div>
          {fileName ? (
            <div>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-1">Clique para trocar</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold">Arraste o PDF aqui</p>
              <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground/60 mt-2">Apenas PDF com texto pesquisável</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="relative flex-1">
            <div className="absolute top-3 left-3 text-muted-foreground/40">
              <FileText className="w-4 h-4" />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ou cole aqui o texto completo do artigo científico..."
              className="w-full h-full min-h-[180px] pl-9 pr-3 py-3 rounded-2xl border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50 transition-all"
            />
            {text && (
              <span className="absolute bottom-3 right-3 text-xs text-muted-foreground/40">
                {text.length.toLocaleString("pt-BR")} caracteres
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleAnalyze}
              disabled={isLoading || !text.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isLoading ? "Analisando com IA…" : "Analisar artigo"}
            </Button>
            {result && <span className="text-xs text-muted-foreground">✓ Análise concluída</span>}
          </div>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-4">
          {/* Title + type */}
          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base font-bold text-foreground leading-snug">
                  {result.titulo || "Artigo analisado"}
                </CardTitle>
                {result.tipo && (
                  <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium">
                    {result.tipo}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/80">{result.resumo}</p>
              {result.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/40">
                  {result.keywords.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-xs text-muted-foreground">
                      <Tag className="w-2.5 h-2.5" /> {k}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Section icon={<Target className="w-4 h-4" />} title="Objetivo" color="text-amber-700 dark:text-amber-400">
              <p className="text-sm text-muted-foreground leading-relaxed">{result.objetivo || "—"}</p>
            </Section>

            <Section icon={<FlaskConical className="w-4 h-4" />} title="Metodologia" color="text-blue-600 dark:text-blue-400">
              <p className="text-sm text-muted-foreground leading-relaxed">{result.metodologia || "—"}</p>
            </Section>

            <Section icon={<BarChart2 className="w-4 h-4" />} title="Resultados" color="text-emerald-600 dark:text-emerald-400">
              <p className="text-sm text-muted-foreground leading-relaxed">{result.resultados || "—"}</p>
            </Section>

            <Section icon={<CheckCircle className="w-4 h-4" />} title="Conclusões" color="text-violet-600 dark:text-violet-400">
              <p className="text-sm text-muted-foreground leading-relaxed">{result.conclusoes || "—"}</p>
            </Section>

            <Section icon={<Quote className="w-4 h-4" />} title={`Citações relevantes ${result.citacoes?.length ? `(${result.citacoes.length})` : ""}`} color="text-rose-600 dark:text-rose-400">
              {result.citacoes?.length ? (
                <div className="space-y-3">
                  {result.citacoes.map((c, i) => (
                    <div key={i} className="border-l-2 border-rose-300 dark:border-rose-700 pl-3">
                      <p className="text-xs italic text-foreground/70 leading-relaxed">"{c.trecho}"</p>
                      <p className="text-xs text-muted-foreground mt-1">{c.relevancia}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Nenhuma citação extraída.</p>}
            </Section>

            <Section icon={<BookOpen className="w-4 h-4" />} title={`Referências ${result.referencias?.length ? `(${result.referencias.length})` : ""}`} color="text-cyan-600 dark:text-cyan-400">
              {result.referencias?.length ? (
                <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {result.referencias.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                      <span className="text-cyan-500 shrink-0">{i + 1}.</span> {r}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Nenhuma referência detectada.</p>}
            </Section>
          </div>
        </div>
      ) : !isLoading ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-border/40 bg-muted/5 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold">Aguardando artigo</p>
            <p className="text-xs text-muted-foreground mt-1">Envie o PDF ou cole o texto e clique em <strong>Analisar artigo</strong>.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {["Objetivo", "Metodologia", "Resultados", "Conclusões", "Citações", "Referências"].map((l) => (
              <div key={l} className="rounded-xl border border-dashed border-border/50 bg-muted/10 h-20 flex items-center justify-center">
                <span className="text-xs text-muted-foreground/50">{l}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm text-muted-foreground">Analisando artigo com IA…</p>
        </div>
      )}
    </div>
  );
}
