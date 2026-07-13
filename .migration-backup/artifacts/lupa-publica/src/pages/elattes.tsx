import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { saveLattesProfile, saveAiAnalysis } from "@/services/analisesService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, FileText, Download, Clock, BookOpen, Target } from "lucide-react";
import { extractTextFromPdf } from "@/lib/pdf";

function firstSentences(text: string, n = 2) {
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  return sentences.slice(0, n).join(" ");
}

function extractYearsTimeline(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries: { year: string; text: string }[] = [];
  const yearRe = /\b(19|20)\d{2}\b/;
  for (const line of lines) {
    const m = line.match(yearRe);
    if (m) {
      entries.push({ year: m[0], text: line.slice(0, 200) });
    }
    if (entries.length >= 10) break;
  }
  return entries;
}

function extractPublications(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pubs: string[] = [];
  const pubRe = /(artigo|publicaç|artigos|revista|doi|ISSN|Proceedings|Anais)/i;
  for (const line of lines) {
    if (pubs.length >= 50) break;
    if (pubRe.test(line) || /\d{4}.+\./.test(line)) {
      if (line.length > 30) pubs.push(line.slice(0, 200));
    }
  }
  return pubs.slice(0, 30);
}

function extractCompetencies(text: string) {
  const matches = text.match(/(competênc[ia]|habilidad|skills|competence)[^\n\r.:;,-]{0,120}/ig) || [];
  const uniq = Array.from(new Set(matches.map((s) => s.trim())));
  if (uniq.length > 0) return uniq.slice(0, 12);
  // fallback: pick frequent nouns-ish words
  const words = text.toLowerCase().replace(/[^a-záéíóúâêôç\s]/g, "").split(/\s+/).filter(Boolean);
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length < 5) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 10);
}

function detectAreas(text: string) {
  const areas = ["biologia", "computação", "educação", "saúde", "engenharia", "agricultura", "ciências sociais", "química", "física", "matemática"];
  const found = areas.filter((a) => new RegExp(a, "i").test(text));
  return found.length ? found : ["Pesquisa em ciências aplicadas", "Pesquisa em políticas públicas"];
}

function suggestEditaisByAreas(areas: string[]) {
  const suggestions: string[] = [];
  if (areas.some((a) => /biologia|saúde|química|física/i.test(a))) {
    suggestions.push("Editais de fomento à pesquisa em saúde e ciências biomédicas (FAPs/CNPq)");
  }
  if (areas.some((a) => /computação|engenharia|matemática/i.test(a))) {
    suggestions.push("Chamada para projetos em tecnologia e inovação (FINEP / CNPq)");
  }
  if (areas.some((a) => /educaç|ciências sociais/i.test(a))) {
    suggestions.push("Editais para pesquisas em educação e extensão universitária");
  }
  if (!suggestions.length) suggestions.push("Editais de bolsas e fomento à pesquisa locais e nacionais");
  return suggestions;
}

export default function ELattes() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState("");
  const [timeline, setTimeline] = useState<{ year: string; text: string }[]>([]);
  const [competencies, setCompetencies] = useState<string[]>([]);
  const [publications, setPublications] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const { text: extracted } = await extractTextFromPdf(file as File);
      setText(extracted || "");
    } catch (err) {
      // ignore — keep simple
    }
  };

  const handleAnalyze = () => {
    setIsProcessing(true);
    try {
      const s = firstSentences(text, 3) || "Resumo não disponível.";
      const t = extractYearsTimeline(text);
      const comps = extractCompetencies(text);
      const pubs = extractPublications(text);
      const ars = detectAreas(text);
      const sugg = suggestEditaisByAreas(ars);

      setSummary(s);
      setTimeline(t);
      setCompetencies(comps);
      setPublications(pubs);
      setAreas(ars);
      setSuggestions(sugg);
      // Auto-save: if user authenticated in Supabase, persist profile and AI analysis
      (async () => {
        try {
          const profilePayload = { name: undefined, lattes_xml: null, summary: s, metadata: { generatedAt: new Date().toISOString() } };
          await saveLattesProfile(profilePayload as any);

          const aiPayload = { model: "local-elattes", input: text.slice(0, 2000), output: { summary: s, timeline: t, competencies: comps, publications: pubs, areas: ars, suggestions: sugg }, metadata: { source: "elattes" } };
          await saveAiAnalysis(aiPayload as any);

              toast({ title: "Interpretação salva", description: "Seu currículo e interpretação foram salvos no histórico." });
        } catch (err) {
          toast({ title: "Erro ao salvar", description: "Não foi possível salvar automaticamente a interpretação.", variant: "destructive" });
        }
      })();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center mb-8">
        <p className="text-sm uppercase tracking-[0.35em] text-primary font-semibold">NIASci / e-Lattes</p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-4">Interpretação inteligente de currículo Lattes</h1>
        <p className="text-muted-foreground mt-3 text-base md:text-lg leading-7">
          Envie seu currículo Lattes (PDF) ou cole o texto para gerar um resumo executivo, linha do tempo, competências, produção científica, áreas de pesquisa e sugestões de editais.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Upload do currículo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <input
                id="lattes-file"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <label htmlFor="lattes-file">
                <Button asChild>
                  <a className="inline-flex items-center gap-2"><FileText className="w-4 h-4" /> Enviar PDF</a>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground">Aceitamos apenas PDF com texto pesquisável.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Ou cole o texto do Lattes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui o texto extraído do currículo Lattes..."
              className="w-full min-h-[160px] p-3 rounded-xl border border-border/60 bg-card text-sm"
            />
            <div className="flex items-center gap-3 mt-3">
              <Button onClick={handleAnalyze} disabled={isProcessing || !text.trim()}>
                {isProcessing ? "Interpretando..." : "Gerar interpretação"}
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/niasci">Voltar ao NIASci</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><User className="w-4 h-4"/> Resumo executivo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{summary || "Nenhuma interpretação gerada ainda."}</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4"/> Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento detectado.</p>
            ) : (
              <ol className="space-y-2">
                {timeline.map((t) => (
                  <li key={`${t.year}-${t.text}`} className="text-sm">
                    <strong>{t.year}</strong> — {t.text}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4"/> Produção científica</CardTitle>
          </CardHeader>
          <CardContent>
            {publications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma produção detectada automaticamente.</p>
            ) : (
              <ul className="list-disc pl-4 text-sm space-y-1">
                {publications.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4"/> Competências</CardTitle>
          </CardHeader>
          <CardContent>
            {competencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Competências não detectadas automaticamente.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {competencies.map((c) => (
                  <span key={c} className="inline-flex items-center px-2 py-1 rounded-full bg-muted/20 text-sm">{c}</span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Áreas de pesquisa</CardTitle>
          </CardHeader>
          <CardContent>
            {areas.map((a) => (
              <div key={a} className="text-sm mb-2">• {a}</div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Sugestão de editais</CardTitle>
          </CardHeader>
          <CardContent>
            {suggestions.map((s) => (
              <div key={s} className="text-sm mb-2">• {s}</div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
