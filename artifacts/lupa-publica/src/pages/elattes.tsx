import { Link } from "wouter";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { saveLattesProfile, saveAiAnalysis } from "@/services/analisesService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  User, FileText, Clock, BookOpen, Target, Globe, Lightbulb,
  Upload, ChevronRight, Sparkles, BarChart2, ArrowLeft,
} from "lucide-react";
import { extractTextFromPdf } from "@/lib/pdf";

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/** Returns a meaningful bio paragraph (skips address/phone lines) */
function buildSummary(text: string) {
  const lines = text
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 40);

  const skip =
    /(telefone|endereço|lattes\.cnpq|cep\s*\d|dd?d?\s*\d{2}|\d{5}-\d{3}|http|ID Lattes|Cor ou Raça|Nascimento|Nome em citações)/i;

  const good = lines.filter((l) => !skip.test(l));
  return good.slice(0, 4).join(" ").slice(0, 600) || "Resumo não disponível.";
}

/** Chronological timeline — deduped, clean */
function extractTimeline(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const entries: { year: string; text: string }[] = [];
  const skipRe = /(telefone|endereço|cep\s*\d|dd?d?\s*\d{2}|lattes\.cnpq)/i;

  for (const line of lines) {
    const m = line.match(/\b((19|20)\d{2})\b/);
    if (!m || skipRe.test(line)) continue;
    const key = m[1] + line.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    // Trim to first 160 chars and strip trailing partial word
    let excerpt = line.slice(0, 160).trim();
    if (excerpt.length === 160) excerpt = excerpt.replace(/\s\S+$/, "") + "…";
    entries.push({ year: m[1], text: excerpt });
    if (entries.length >= 12) break;
  }

  return entries.sort((a, b) => Number(a.year) - Number(b.year));
}

/** Scientific publications — cleaned */
function extractPublications(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pubRe = /(artigo|publicaç|revista|doi|ISSN|Proceedings|Anais|journal|paper)/i;
  const pubs: string[] = [];
  for (const line of lines) {
    if (pubs.length >= 20) break;
    if (pubRe.test(line) && line.length > 30) {
      pubs.push(line.slice(0, 180));
    }
  }
  return pubs;
}

/** Skill tags — keyword-matched or frequency-based */
function extractCompetencies(text: string) {
  const techRe = /(python|java(?:script)?|react|node|sql|machine learning|deep learning|nlp|processamento de linguagem|visão computacional|tensorflow|pytorch|análise de dados|estatística|r\s+(?:language|linguagem)|matlab|excel|power\s*bi|tableau|docker|git|cloud|aws|azure)/gi;
  const matches = text.match(techRe) || [];
  const normalized = Array.from(new Set(matches.map((m) => m.trim().toLowerCase()))).slice(0, 14);
  if (normalized.length) return normalized;

  // Fallback: frequent meaningful words
  const words = text.toLowerCase().replace(/[^a-záéíóúâêôãõç\s-]/g, "").split(/\s+/).filter((w) => w.length >= 6);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

function detectAreas(text: string) {
  const map: Record<string, string> = {
    "Biologia / Biomédica": /biologia|biomédic|genética|bioquím/i,
    "Computação / TI": /computação|software|programação|sistemas de informação|inteligência artificial|machine learning/i,
    "Educação": /educaç|pedagogia|ensino|docência/i,
    "Engenharia": /engenharia/i,
    "Saúde": /saúde|medicina|enfermagem|farmácia/i,
    "Ciências Sociais": /ciências sociais|sociologia|antropologia|política/i,
    "Química / Física": /química|física|termodinâmica/i,
    "Matemática / Estatística": /matemática|estatística|cálculo/i,
    "Agricultura / Agrárias": /agricultura|agrárias|agronomia|veterinária/i,
  };
  const found = Object.entries(map)
    .filter(([, re]) => re.test(text))
    .map(([name]) => name);
  return found.length ? found : ["Ciências Aplicadas", "Pesquisa e Inovação"];
}

function suggestEditais(areas: string[]) {
  const suggestions: string[] = [];
  if (areas.some((a) => /saúde|biologia|química|física/i.test(a)))
    suggestions.push("Fomento à pesquisa em saúde e ciências biomédicas — FAPs / CNPq");
  if (areas.some((a) => /computação|engenharia|matemática/i.test(a)))
    suggestions.push("Projetos em tecnologia e inovação — FINEP / CNPq / FAPESP");
  if (areas.some((a) => /educaç/i.test(a)))
    suggestions.push("Pesquisa em educação e extensão universitária — CAPES / FNDE");
  if (areas.some((a) => /agricultura/i.test(a)))
    suggestions.push("Projetos de pesquisa agropecuária — Embrapa / MAPA");
  if (!suggestions.length)
    suggestions.push("Bolsas e fomento à pesquisa locais e nacionais — CNPq / FAPs estaduais");
  suggestions.push("Programa de Apoio à Pós-Graduação — PROAP / CAPES");
  return suggestions;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Results = {
  summary: string;
  timeline: { year: string; text: string }[];
  competencies: string[];
  publications: string[];
  areas: string[];
  suggestions: string[];
};

const EMPTY: Results = {
  summary: "",
  timeline: [],
  competencies: [],
  publications: [],
  areas: [],
  suggestions: [],
};

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 h-24 flex items-center justify-center">
      <span className="text-xs text-muted-foreground/50">{label}</span>
    </div>
  );
}

export default function ELattes() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<Results>(EMPTY);
  const hasResults = results.summary !== "";

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

  const handleAnalyze = () => {
    if (!text.trim()) return;
    setIsProcessing(true);
    try {
      const summary = buildSummary(text);
      const timeline = extractTimeline(text);
      const competencies = extractCompetencies(text);
      const publications = extractPublications(text);
      const areas = detectAreas(text);
      const suggestions = suggestEditais(areas);

      setResults({ summary, timeline, competencies, publications, areas, suggestions });

      (async () => {
        try {
          await saveLattesProfile({ summary, metadata: { generatedAt: new Date().toISOString() } } as any);
          await saveAiAnalysis({ model: "local-elattes", input: text.slice(0, 2000), output: { summary, timeline, competencies, publications, areas, suggestions }, metadata: { source: "elattes" } } as any);
          toast({ title: "Interpretação salva", description: "Resultado registrado no histórico." });
        } catch {
          // silent — local parsing still works
        }
      })();
    } finally {
      setIsProcessing(false);
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
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">e-Lattes</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
          Interpretação inteligente de currículo Lattes
        </h1>
        <p className="text-muted-foreground mt-2 text-base leading-7 max-w-2xl">
          Envie o PDF do Lattes ou cole o texto para gerar resumo executivo, linha do tempo, competências, produções e sugestões de editais.
        </p>
      </div>

      {/* Input section */}
      <div className="grid md:grid-cols-[280px_1fr] gap-4 mb-8">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 min-h-[180px] p-6 text-center
            ${isDragging
              ? "border-emerald-500 bg-emerald-500/5"
              : "border-border/60 hover:border-emerald-500/50 hover:bg-muted/20"
            }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadPdf(f); }}
          />
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Upload className="w-5 h-5" />
          </div>
          {fileName ? (
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-1">Clique para trocar o arquivo</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold">Arraste o PDF aqui</p>
              <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground/60 mt-2">Apenas PDF com texto pesquisável</p>
            </div>
          )}
        </div>

        {/* Text paste */}
        <div className="flex flex-col gap-3">
          <div className="relative flex-1">
            <div className="absolute top-3 left-3 text-muted-foreground/40">
              <FileText className="w-4 h-4" />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ou cole aqui o texto extraído do currículo Lattes..."
              className="w-full h-full min-h-[180px] pl-9 pr-3 py-3 rounded-2xl border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
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
              disabled={isProcessing || !text.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing ? "Interpretando…" : "Gerar interpretação"}
            </Button>
            {hasResults && (
              <span className="text-xs text-muted-foreground">
                ✓ Interpretação gerada
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {hasResults ? (
        <div className="space-y-4">
          {/* Summary — full width, highlighted */}
          <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <User className="w-4 h-4" /> Resumo executivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/80">{results.summary}</p>
              {/* Stats row */}
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border/40">
                {[
                  { label: "Publicações detectadas", value: results.publications.length, icon: <BookOpen className="w-3.5 h-3.5" /> },
                  { label: "Competências", value: results.competencies.length, icon: <Target className="w-3.5 h-3.5" /> },
                  { label: "Eventos na linha do tempo", value: results.timeline.length, icon: <Clock className="w-3.5 h-3.5" /> },
                  { label: "Áreas de pesquisa", value: results.areas.length, icon: <Globe className="w-3.5 h-3.5" /> },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-emerald-500">{s.icon}</span>
                    <strong className="text-foreground font-semibold">{s.value}</strong> {s.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 3-column grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Timeline */}
            <Card className="border-border shadow-sm md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" /> Linha do tempo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento cronológico detectado.</p>
                ) : (
                  <ol className="relative border-l border-border/50 ml-2 space-y-3">
                    {results.timeline.map((t, i) => (
                      <li key={i} className="pl-4 relative">
                        <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500/20 border border-blue-500/40" />
                        <span className="text-xs font-bold text-blue-500">{t.year}</span>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.text}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            {/* Competencies */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-violet-500" /> Competências
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.competencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma competência detectada.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {results.competencies.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 text-xs font-medium capitalize"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Areas */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-500" /> Áreas de pesquisa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {results.areas.map((a) => (
                    <div key={a} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                      {a}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Suggestions */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" /> Sugestão de editais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.suggestions.map((s) => (
                    <div key={s} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                      {s}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Publications */}
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-rose-500" /> Produção científica
                  {results.publications.length > 0 && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {results.publications.length} encontrada{results.publications.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.publications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma produção detectada automaticamente.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                    {results.publications.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                        <BarChart2 className="w-3 h-3 text-rose-400 mt-0.5 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* Pre-analysis placeholder */
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-border/40 bg-muted/5 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold">Aguardando interpretação</p>
            <p className="text-xs text-muted-foreground mt-1">
              Envie o PDF ou cole o texto do Lattes e clique em <strong>Gerar interpretação</strong>.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {["Resumo executivo", "Linha do tempo", "Competências", "Áreas de pesquisa", "Sugestão de editais", "Produção científica"].map((l) => (
              <EmptyCard key={l} label={l} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
