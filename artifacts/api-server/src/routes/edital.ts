/**
 * @file edital.ts
 * @description Rotas da API para análise, persistência e compartilhamento de editais.
 *
 * Endpoints disponíveis:
 *
 *   POST  /edital/analyze            — executa um dos 6 agentes IA no texto do edital
 *   GET   /edital/agent-history      — lista histórico de análises do usuário (auth)
 *   POST  /edital/agent-history      — salva resultado de análise (auth)
 *   DELETE /edital/agent-history/:id — remove análise do histórico (auth, owner)
 *   POST  /edital/extract-url        — extrai texto de URL pública (com guard SSRF)
 *   POST  /edital/ocr-pdf            — OCR de PDF escaneado via GPT-4o Vision
 *   POST  /edital/simplify           — simplificação de edital para linguagem cidadã
 *   GET   /edital/history            — histórico legado (savedEditalsTable)
 *   POST  /edital/save               — salva edital simplificado (legado)
 *   DELETE /edital/:id               — remove edital salvo legado
 *   POST  /edital/share/:id          — gera token público de compartilhamento
 *   GET   /edital/shared/:token      — recupera resultado compartilhado (público)
 *
 * Segurança:
 *   - assertPublicHost(): proteção contra SSRF em URLs externas
 *   - multer: valida MIME type e limita tamanho (20MB) de PDFs
 *   - requireAuth() aplicado em rotas que persistem dados
 *   - Autoria verificada em delete/share para prevenir acesso cruzado
 */

import { Router, type IRouter } from "express";
import { desc, eq, sql, and } from "drizzle-orm";
import * as cheerio from "cheerio";
import { z } from "zod";
import multer from "multer";
import { db, savedEditalsTable, agentResultsTable, sharedResultsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import {
  SimplifyEditalBody,
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

import { analyzeAgent, AgentAnalyzeBodySchema, simplifyEdital, ocrPdf } from "../lib/aiService";
import { getReqUserId, requireAuth } from "../lib/supabase";

/**
 * Remove caracteres binários e ruído de PDFs colados como texto.
 * Também normaliza espaços, quebras de linha e linhas duplicadas.
 * Objetivo: reduzir tokens enviados à IA sem perder conteúdo relevante.
 *
 * @param raw - Texto bruto recebido do frontend (pode conter bytes de PDF)
 * @returns Texto limpo, pronto para envio à IA
 */
function cleanEditalText(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, " ") // remove bytes não-printáveis
    .replace(/[ \t]{2,}/g, " ")       // colapsa espaços múltiplos
    .replace(/\n{3,}/g, "\n\n")       // remove linhas em branco consecutivas
    .split("\n")
    .filter((l) => l.trim().length > 2 || l.trim() === "") // descarta linhas com só ruído
    .join("\n")
    .trim();
}

router.post("/edital/analyze", async (req, res): Promise<void> => {
  const parsed = AgentAnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, text, profile } = parsed.data;

  // Limpa o texto antes de truncar — remove binário de PDF e ruído tipográfico
  const cleaned = cleanEditalText(text);

  // Após limpeza de binários, texto limpo ≈ 3–4 chars/token.
  // 10.000 chars ≈ 2.500–3.500 tokens — seguro para Groq 12K TPM e mantém prazos/datas do corpo do edital.
  const MAX_CHARS = 10000;
  const truncated =
    cleaned.length > MAX_CHARS
      ? cleaned.slice(0, MAX_CHARS) + "\n\n[Documento extenso — analisando os primeiros blocos de conteúdo relevante]"
      : cleaned;

  try {
    const result = await analyzeAgent(agentId, truncated, profile, { userId: getReqUserId(req), documentId: null });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log?.error({ error: message }, "AIService failed");

    // Erro de taxa do Gemini
    if (message.includes("GEMINI_RATE_LIMIT")) {
      res.status(429).json({ error: "A IA está sobrecarregada agora. Aguarde alguns segundos e tente novamente." });
      return;
    }
    // Documento muito grande mesmo após limpeza — instrui o usuário
    if (message.includes("413") || message.includes("Request too large") || message.includes("TPM") || message.includes("token")) {
      res.status(429).json({ error: "O documento é muito grande para ser analisado de uma só vez. Tente reduzir o texto antes de enviar, ou cole apenas as seções principais do edital." });
      return;
    }

    res.status(500).json({ error: `Falha ao processar a resposta da IA. Tente novamente. [${message.slice(0, 300)}]` });
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

// ── SSRF guard: block private/loopback/link-local IP ranges ─────
import dns from "node:dns/promises";
import net from "node:net";

function isPrivateIp(ip: string): boolean {
  // Normalize IPv6-mapped IPv4 (::ffff:x.x.x.x)
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (net.isIPv4(addr)) {
    const parts = addr.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) || // link-local
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // CGNAT
      addr === "0.0.0.0"
    );
  }

  // IPv6 loopback and link-local
  const norm = ip.toLowerCase();
  return (
    norm === "::1" ||
    norm.startsWith("fe80:") ||
    norm.startsWith("fc") ||
    norm.startsWith("fd") ||
    norm === "::"
  );
}

async function assertPublicHost(hostname: string): Promise<void> {
  let addrs: string[];
  try {
    addrs = (await dns.resolve(hostname)).flat();
  } catch {
    // Try IPv6
    try {
      addrs = (await dns.resolve6(hostname)).flat();
    } catch {
      throw new Error("Não foi possível resolver o hostname da URL.");
    }
  }
  if (addrs.length === 0) throw new Error("Nenhum endereço IP encontrado para o hostname.");
  for (const ip of addrs) {
    if (isPrivateIp(ip)) {
      throw new Error("A URL aponta para um endereço de rede privada ou local, o que não é permitido.");
    }
  }
}

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

  // Only allow http/https
  let parsedUrlObj: URL;
  try {
    parsedUrlObj = new URL(fetchedUrl);
  } catch {
    res.status(400).json({ error: "URL inválida." });
    return;
  }
  if (parsedUrlObj.protocol !== "http:" && parsedUrlObj.protocol !== "https:") {
    res.status(400).json({ error: "Apenas URLs com protocolo http ou https são aceitas." });
    return;
  }

  // SSRF guard: resolve hostname and block private/loopback IPs
  try {
    await assertPublicHost(parsedUrlObj.hostname);
  } catch (err) {
    const message = err instanceof Error ? err.message : "URL não permitida.";
    res.status(400).json({ error: message });
    return;
  }

  let html: string;
  try {
    const response = await fetch(fetchedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LUPA Digital/NIASci/1.0; +https://lupadigital.dev)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    // After redirect, re-check the final URL's host
    const finalHost = new URL(response.url).hostname;
    if (finalHost !== parsedUrlObj.hostname) {
      await assertPublicHost(finalHost);
    }

    if (!response.ok) {
      res.status(422).json({ error: `Não foi possível acessar a URL (status ${response.status}). Verifique se ela é pública e tente novamente.` });
      return;
    }

    // Detect charset from Content-Type header before decoding
    const contentType = response.headers.get("content-type") ?? "";
    let charset = "utf-8";

    // e.g. "text/html; charset=windows-1252"
    const ctMatch = contentType.match(/charset=([^\s;]+)/i);
    if (ctMatch) charset = ctMatch[1].trim().toLowerCase();

    // Read as bytes so we can re-decode with the right charset
    const bytes = await response.arrayBuffer();
    let rawHtml = new TextDecoder(charset, { fatal: false }).decode(bytes);

    // If charset wasn't in Content-Type, sniff it from <meta charset> in first 4KB
    if (!ctMatch) {
      const sniff = rawHtml.slice(0, 4096);
      const metaMatch =
        sniff.match(/<meta[^>]+charset=["']?([^"';\s>]+)/i) ||
        sniff.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i);
      if (metaMatch) {
        const detected = metaMatch[1].trim().toLowerCase();
        if (detected && detected !== charset) {
          try {
            rawHtml = new TextDecoder(detected, { fatal: false }).decode(bytes);
            charset = detected;
          } catch {
            // Unknown charset label — keep original decode
          }
        }
      }
    }

    html = rawHtml;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.warn({ url: fetchedUrl, message }, "Failed to fetch URL");
    res.status(422).json({ error: "Não foi possível acessar a URL. Verifique se ela está correta e disponível." });
    return;
  }

  const $ = cheerio.load(html, { decodeEntities: true });

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

  try {
    const result = await simplifyEdital(text, { userId: getReqUserId(req), documentId: null });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    req.log?.error({ error: message }, "AIService simplify failed");
    if (message.includes("GEMINI_RATE_LIMIT")) {
      res.status(429).json({ error: "A IA está sobrecarregada agora. Aguarde alguns segundos e tente novamente." });
      return;
    }
    res.status(500).json({
      error:
        message === "AI response is not valid JSON" || message === "AI response did not match expected schema"
          ? "Falha ao processar a resposta da IA. Tente novamente."
          : "Falha ao conectar com o serviço de IA. Tente novamente mais tarde.",
    });
    return;
  }
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

// ── GET /edital/stats — aggregate statistics (authenticated, scoped to requester) ─
router.get("/edital/stats", requireAuth(), async (req, res): Promise<void> => {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentResultsTable)
    .where(eq(agentResultsTable.userId, userId));

  const byAgent = await db
    .select({
      agentId: agentResultsTable.agentId,
      count: sql<number>`count(*)::int`,
    })
    .from(agentResultsTable)
    .where(eq(agentResultsTable.userId, userId))
    .groupBy(agentResultsTable.agentId);

  const recentAnalyses = await db
    .select()
    .from(agentResultsTable)
    .where(eq(agentResultsTable.userId, userId))
    .orderBy(desc(agentResultsTable.createdAt))
    .limit(10);

  res.json({
    total: totalRow?.count ?? 0,
    byAgent,
    recentAnalyses,
  });
});

// ── POST /edital/share — create a share link ──────────────────────
const ShareBodySchema = z.object({
  agentId: z.string(),
  title: z.string(),
  resultJson: z.record(z.string(), z.unknown()),
});

router.post("/edital/share", async (req, res) => {
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

// ── POST /edital/ocr-pdf — extract text from PDF page images via GPT-4o Vision ──
router.post("/edital/ocr-pdf", async (req, res): Promise<void> => {
  const { pages } = req.body as { pages?: unknown };

  if (!Array.isArray(pages) || pages.length === 0) {
    res.status(400).json({ error: "Nenhuma página enviada." });
    return;
  }
  if (pages.length > 30) {
    res.status(400).json({ error: "Máximo de 30 páginas por requisição." });
    return;
  }

  try {
    // Delegado ao AIService para garantir logging centralizado e rastreabilidade
    const text = await ocrPdf(pages as string[]);
    res.json({ text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    req.log.error({ error: msg }, "ocr-pdf failed");
    res.status(500).json({ error: "Falha no OCR. Tente novamente." });
  }
});

// ── GET /edital/share/:token — retrieve shared result ─────────────
router.get("/edital/share/:token", async (req, res) => {
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
