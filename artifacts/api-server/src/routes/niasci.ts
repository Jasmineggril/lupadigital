import { Router, type IRouter } from "express";
import { z } from "zod";
import { openai, getOpenAIModel } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── Artigos ──────────────────────────────────────────────────────────────────

const ArtigosAnalyzeSchema = z.object({
  text: z.string().min(50).max(20000),
});

router.post("/niasci/artigos/analyze", async (req, res): Promise<void> => {
  const parsed = ArtigosAnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Texto inválido ou muito curto." });
    return;
  }

  const { text } = parsed.data;
  const truncated = text.length > 14000 ? text.slice(0, 14000) + "\n[Truncado]" : text;

  try {
    const model = getOpenAIModel();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é um assistente de pesquisa acadêmica brasileiro. Analise o artigo científico fornecido e retorne um JSON com os seguintes campos:
- "titulo": título do artigo (string, infira se não estiver explícito)
- "resumo": resumo executivo claro e estruturado em 3-5 frases (string)
- "objetivo": objetivo principal do estudo (string)
- "metodologia": abordagem metodológica usada (string)
- "resultados": principais resultados encontrados (string)
- "conclusoes": conclusões e contribuições do trabalho (string)
- "referencias": lista das referências bibliográficas mencionadas no texto (array de strings, máx 15)
- "citacoes": array de até 5 citações relevantes extraídas do texto, cada uma com "trecho" e "relevancia" (string descrevendo por que é importante)
- "keywords": palavras-chave identificadas (array de strings, máx 8)
- "tipo": tipo do artigo (ex: "Revisão sistemática", "Estudo experimental", "Estudo de caso", etc.)

Responda apenas com JSON válido, sem markdown.`,
        },
        {
          role: "user",
          content: `Analise este artigo científico:\n\n${truncated}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log?.error({ error: message }, "Artigos AI failed");
    res.status(500).json({ error: "Falha ao analisar o artigo. Tente novamente." });
  }
});

// ── Planetário ────────────────────────────────────────────────────────────────

const PlanetarioGenerateSchema = z.object({
  topic: z.string().min(3).max(300),
  audience: z.enum(["criancas", "jovens", "adultos", "geral"]).default("geral"),
});

router.post("/niasci/planetario/generate", async (req, res): Promise<void> => {
  const parsed = PlanetarioGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Tópico inválido." });
    return;
  }

  const { topic, audience } = parsed.data;

  const audienceLabel: Record<string, string> = {
    criancas: "crianças de 6 a 11 anos (linguagem lúdica e simples)",
    jovens: "adolescentes de 12 a 17 anos (linguagem acessível e engajante)",
    adultos: "adultos sem formação científica (linguagem clara e objetiva)",
    geral: "público geral de todas as idades (linguagem acessível e inclusiva)",
  };

  try {
    const model = getOpenAIModel();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é um educador científico brasileiro especializado em divulgação científica. 
Crie conteúdo educativo acessível sobre o tema fornecido para o público-alvo indicado.
Retorne um JSON com:
- "titulo": título criativo e atrativo para o conteúdo (string)
- "introducao": parágrafo de introdução envolvente (string, 3-4 frases)
- "roteiro": roteiro educativo completo em 5-7 tópicos, cada um com "subtitulo" e "conteudo" (array de objetos)
- "curiosidades": 5 curiosidades surpreendentes e verificáveis sobre o tema (array de strings)
- "perguntas": 5 perguntas reflexivas para discussão em sala ou família (array de strings)
- "glossario": 4-6 termos técnicos com definições simples (array de objetos com "termo" e "definicao")
- "fontes": 3 fontes confiáveis para aprofundamento (array de strings com nome da fonte)

Use linguagem adequada para: ${audienceLabel[audience] ?? audienceLabel.geral}
Responda apenas com JSON válido, sem markdown.`,
        },
        {
          role: "user",
          content: `Crie conteúdo educativo sobre: "${topic}"`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log?.error({ error: message }, "Planetario AI failed");
    res.status(500).json({ error: "Falha ao gerar conteúdo. Tente novamente." });
  }
});

export default router;
