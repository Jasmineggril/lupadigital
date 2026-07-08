import { Router, type IRouter } from "express";
import { desc, eq, sql, and } from "drizzle-orm";
import * as cheerio from "cheerio";
import { z } from "zod";
import multer from "multer";
import { openai, getOpenAIModel } from "@workspace/integrations-openai-ai-server";
import { db, savedEditalsTable, agentResultsTable, sharedResultsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import {
  SimplifyEditalBody,
  SimplifyEditalResponse,
  SaveEditalBody,
  DeleteEditalParams,
  ListEditalHistoryResponse,
  ExtractEditalFromUrlBody,
} from "@workspace/api-zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Apenas arquivos PDF são aceitos"));
  },
});

// AI analyze logic consolidated into AIService (see src/lib/aiService.ts)

const router: IRouter = Router();

import { analyzeAgent, AgentAnalyzeBodySchema } from "../lib/aiService";

router.post("/edital/analyze", async (req, res): Promise<void> => {
  const parsed = AgentAnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, text, profile } = parsed.data;
  const truncated = text.length > 12000 ? text.slice(0, 12000) + "\n\n[Texto truncado para processamento]" : text;

  try {
    const result = await analyzeAgent(agentId, truncated, profile, { userId: (req as any).user?.id ?? null, documentId: null });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log?.error({ error: message }, "AIService failed");
    res.status(500).json({ error: "Falha ao processar a resposta da IA. Tente novamente." });
    return;
  }
});

// ── Agent history routes ─────────────────────────────────────────

const SaveAgentResultBodySchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1).max(200),
  originalText: z.string().min(1),
  resultJson: z.record(z.string(), z.unknown()),
});

const DeleteAgentResultParamsSchema = z.object({ id: z.coerce.number().int().positive() });

router.get("/edital/agent-history", async (req, res): Promise<void> => {
  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const rows = await db
    .select()
    .from(agentResultsTable)
    .where(eq((agentResultsTable as any).userId, userId))
    .orderBy(desc(agentResultsTable.createdAt));
  res.json(rows);
});

router.post("/edital/agent-history", async (req, res): Promise<void> => {
  const parsed = SaveAgentResultBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = { ...parsed.data, userId: userId } as any;
  const [saved] = await db.insert(agentResultsTable).values(payload).returning();
  res.status(201).json(saved);
});

router.delete("/edital/agent-history/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentResultParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [deleted] = await db
    .delete(agentResultsTable)
    .where(and(eq(agentResultsTable.id, params.data.id), eq((agentResultsTable as any).userId, userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Análise não encontrada." });
    return;
  }

  res.sendStatus(204);
});

router.post("/edital/extract-url", async (req, res): Promise<void> => {
  const parsed = ExtractEditalFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;

  let fetchedUrl = url;
  if (!/^https?:\/\//i.test(url)) {
    fetchedUrl = `https://${url}`;
  }

  let html: string;
  try {
    const response = await fetch(fetchedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LupaPublicaIA/1.0; +https://lupapublica.replit.app)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      res.status(422).json({ error: `Não foi possível acessar a URL (status ${response.status}). Verifique se ela é pública e tente novamente.` });
      return;
    }

    html = await response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ url: fetchedUrl, message }, "Failed to fetch URL");
    res.status(422).json({ error: "Não foi possível acessar a URL. Verifique se ela está correta e disponível." });
    return;
  }

  const $ = cheerio.load(html);

  // Remove elements that don't contain useful content
  $("script, style, nav, header, footer, aside, iframe, noscript, [aria-hidden='true']").remove();
  $("[class*='menu'], [class*='nav'], [class*='sidebar'], [class*='cookie'], [class*='banner'], [class*='popup']").remove();
  $("[id*='menu'], [id*='nav'], [id*='sidebar'], [id*='cookie'], [id*='banner']").remove();

  const title = $("title").text().trim() || $("h1").first().text().trim() || "";

  // Try to get the main content first, fallback to body
  const mainSelectors = ["main", "article", "[role='main']", ".content", "#content", ".post-content", ".entry-content", ".page-content", ".edital", "#edital"];
  let textContent = "";

  for (const selector of mainSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      textContent = el.text();
      break;
    }
  }

  if (!textContent || textContent.trim().length < 200) {
    textContent = $("body").text();
  }

  // Clean up whitespace
  const cleanedText = textContent
    .replace(/\t/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanedText || cleanedText.length < 100) {
    res.status(422).json({ error: "Não foi possível extrair texto útil desta página. Tente copiar e colar o texto manualmente." });
    return;
  }

  // Limit to 50,000 chars to avoid overloading the AI
  const truncated = cleanedText.length > 50000 ? cleanedText.slice(0, 50000) + "\n\n[Texto truncado para processamento]" : cleanedText;

  res.json({ text: truncated, title });
});

router.post("/edital/simplify", async (req, res): Promise<void> => {
  const parsed = SimplifyEditalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text } = parsed.data;

  const systemPrompt = `Você é um especialista em simplificação de documentos públicos brasileiros.
Sua missão é tornar editais públicos acessíveis para toda a população, independentemente do nível de escolaridade.
Responda SEMPRE em português brasileiro com linguagem simples, clara e direta.
Evite jargões jurídicos e técnicos. Se precisar usar um termo técnico, explique-o.`;

  const userPrompt = `Analise o edital a seguir e retorne as informações no formato JSON especificado.

EDITAL:
${text}

Retorne um JSON válido com exatamente estes campos:
{
  "resumo": "Resumo claro e direto do edital em 3-5 frases simples",
  "objetivo": "O que este edital quer alcançar, em uma ou duas frases simples",
  "quemPodeParticipar": "Quem tem direito de participar, de forma clara e direta",
  "prazoInscricao": "Data e hora limite para se inscrever (ou 'Não informado' se não constar)",
  "ondeSeInscrever": "Como e onde fazer a inscrição (site, endereço, etc.) — ou 'Não informado'",
  "principaisRequisitos": "Lista dos principais requisitos exigidos, em linguagem simples",
  "linguagemSimples": "Reescreva os pontos mais importantes do edital inteiro em linguagem simples, como se estivesse explicando para alguém que nunca leu um edital antes. Use frases curtas e diretas."
}

Responda SOMENTE com o JSON, sem markdown, sem código de formatação, sem texto adicional.`;

  let content = "{}";
  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    content = completion.choices[0]?.message?.content ?? "{}";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log.error({ error: message }, "OpenAI request failed");
    res.status(500).json({
      error:
        message.includes("OPENAI_API_KEY")
          ? "OPENAI_API_KEY is not configured. Set it in Replit Secrets to enable OpenAI features."
          : "Falha ao conectar com o serviço OpenAI. Tente novamente mais tarde.",
    });
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    req.log.error({ content }, "Failed to parse AI response as JSON");
    res.status(500).json({ error: "Falha ao processar a resposta da IA. Tente novamente." });
    return;
  }

  const validated = SimplifyEditalResponse.safeParse(parsedJson);
  if (!validated.success) {
    req.log.error({ errors: validated.error.message, parsedJson }, "AI response does not match expected schema");
    res.status(500).json({ error: "Resposta da IA em formato inesperado. Tente novamente." });
    return;
  }

  res.json(validated.data);
});

router.get("/edital/history", async (req, res): Promise<void> => {
  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const rows = await db
    .select()
    .from(savedEditalsTable)
    .where(eq((savedEditalsTable as any).userId, userId))
    .orderBy(desc(savedEditalsTable.createdAt));

  res.json(ListEditalHistoryResponse.parse(rows));
});

router.post("/edital/history", async (req, res): Promise<void> => {
  const parsed = SaveEditalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = { ...parsed.data, userId: userId } as any;
  const [saved] = await db.insert(savedEditalsTable).values(payload).returning();
  res.status(201).json(saved);
});

router.delete("/edital/history/:id", async (req, res): Promise<void> => {
  const params = DeleteEditalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [deleted] = await db
    .delete(savedEditalsTable)
    .where(and(eq(savedEditalsTable.id, params.data.id), eq((savedEditalsTable as any).userId, userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Edital não encontrado." });
    return;
  }

  res.sendStatus(204);
});

// ── POST /edital/share — create a share link ──────────────────────
const ShareBodySchema = z.object({
  agentId: z.string(),
  title: z.string(),
  resultJson: z.record(z.string(), z.unknown()),
});

router.post("/share", async (req, res) => {
  const parsed = ShareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { agentId, title, resultJson } = parsed.data;
  const token = randomUUID();
  await db.insert(sharedResultsTable).values({ token, agentId, title, resultJson });
  res.status(201).json({ token });
});

// ── GET /edital/share/:token — retrieve shared result ─────────────
router.get("/share/:token", async (req, res) => {
  const { token } = req.params;
  const rows = await db
    .select()
    .from(sharedResultsTable)
    .where(eq(sharedResultsTable.token, token))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Link não encontrado ou expirado." });
    return;
  }
  res.json(rows[0]);
});

export default router;
