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
 *   POST  /edital/share              — gera token público de compartilhamento
 *   GET   /edital/share/:token       — recupera resultado compartilhado (público)
 *
 * Segurança:
 *   - assertPublicHost(): proteção contra SSRF em URLs externas
 *   - multer: valida MIME type e limita tamanho (20MB) de PDFs
 *   - requireAuth() aplicado em rotas que persistem dados
 *   - Autoria verificada em delete/share para prevenir acesso cruzado
 */

import { Router, type IRouter } from "express";
import * as cheerio from "cheerio";
import { z } from "zod";
import multer from "multer";
import { randomUUID } from "crypto";
import { httpSelect, httpSelectTwoFilters, httpInsert, httpDelete, httpCount, mapKeys } from "../lib/db-http";
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

import { analyzeAgent, AgentAnalyzeBodySchema, simplifyEdital, ocrPdf, buildCanonicalAnalysis, validateDocumentAnalysis } from "../lib/aiService";
import { getReqUserId, requireAuth, getSupabaseAdmin } from "../lib/supabase";
import { safeFetch, UnsafeUrlError } from "../lib/safeFetch";
import { classifyAiError } from "../lib/processingErrors";

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

  // Limpa o texto antes de processar — remove binário de PDF e ruído tipográfico.
  // Documentos extensos não são bloqueados; eles são analisados em partes e consolidados.
  const cleaned = cleanEditalText(text);

  try {
    const result = await analyzeAgent(agentId, cleaned, profile, { userId: getReqUserId(req), documentId: null });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyAiError(message);
    req.log?.error({ requestId: (error as any)?.requestId, error: message, reason: classification.reason }, classification.logMessage ?? "AIService failed");

    res.status(classification.status).json({ error: classification.userMessage });
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

  const rows = await httpSelect("agent_results", { user_id: userId }, { order: "created_at", ascending: false });
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
  try {
    // Se existir um resultado estruturado dentro de `resultJson` (por exemplo,
    // vindo de uma análise remota ou de um agente), construímos a versão
    // canônica e a incorporamos ao JSON salvo. Isso garante que todas as
    // áreas da interface possam consumir a mesma fonte de verdade sem mudar
    // o schema do banco (usar `result_json` existente).
    if (payload.resultJson && typeof payload.resultJson === "object") {
      try {
        const originalAgentResult = payload.resultJson as Record<string, unknown>;
        const canonical = buildCanonicalAnalysis(payload.agentId, originalAgentResult, payload.originalText || "", undefined as any);
        
        // Validação documental antes de salvar
        const validation = validateDocumentAnalysis(canonical as unknown as Record<string, unknown>, payload.originalText || "");
        if (!validation.valid) {
          req.log?.warn({ errors: validation.errors }, "Validação documental falhou");
          // Adiciona alertas de validação ao resultado
          const existingAlerts = Array.isArray((canonical as any).alertas) ? (canonical as any).alertas : [];
          (canonical as any).alertas = [
            ...existingAlerts,
            ...validation.errors.map(error => ({
              categoria: "validacao",
              descricao: error,
              severidade: "média",
            })),
          ];
        }
        
        // Para compatibilidade com o frontend, salvamos a análise CANÔNICA em `resultJson`.
        // Mantemos o resultado original do agente em `agentResult` para auditabilidade.
        payload.resultJson = { ...canonical, agentResult: originalAgentResult } as any;
      } catch (err) {
        // Em caso de falha na construção canônica, logamos e prosseguimos salvando o resultado do agente.
        req.log?.warn({ err }, "Falha ao construir análise canônica; salvando resultado do agente sem canonical.");
      }
    }
  } catch (e) {
    req.log?.warn({ e }, "Erro não crítico preparando payload de agent-history");
  }
  const saved = await httpInsert("agent_results", payload);
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

  const deleted = await httpDelete("agent_results", "id", params.data.id, "user_id", userId);

  if (!deleted) {
    res.status(404).json({ error: "Análise não encontrada." });
    return;
  }

  res.sendStatus(204);
});

// ── SSRF guard: ver lib/safeFetch.ts (cada redirecionamento é verificado) ──

router.post("/edital/extract-url", async (req, res): Promise<void> => {
  const parsed = ExtractEditalFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;
  const fetchedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  let html: string;
  try {
    const response = await safeFetch(fetchedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LUPA Digital/NIASci/1.0; +https://lupadigital.dev)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 15000,
    });

    if (!response.ok) {
      res.status(422).json({ error: `Não foi possível acessar a URL (status ${response.status}). Verifique se ela é pública e tente novamente.` });
      return;
    }

    // Detect charset from Content-Type header before decoding
    const contentType = response.contentType;
    let charset = "utf-8";

    // e.g. "text/html; charset=windows-1252"
    const ctMatch = contentType.match(/charset=([^\s;]+)/i);
    if (ctMatch) charset = ctMatch[1].trim().toLowerCase();

    const bytes = response.body;
    let rawHtml: string;
    try {
      rawHtml = new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch {
      rawHtml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      charset = "utf-8";
    }

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
    if (err instanceof UnsafeUrlError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    req.log?.warn({ url: fetchedUrl, message }, "Failed to fetch URL");
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

  try {
    const result = await simplifyEdital(text, { userId: getReqUserId(req), documentId: null });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const classification = classifyAiError(message);
    req.log?.error({ requestId: (error as any)?.requestId, error: message, reason: classification.reason }, classification.logMessage ?? "AIService simplify failed");
    res.status(classification.status).json({ error: classification.userMessage });
    return;
  }
});

router.get("/edital/history", async (req, res): Promise<void> => {
  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const rows = await httpSelect("saved_editals", { user_id: userId }, { order: "created_at", ascending: false });

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
  const saved = await httpInsert("saved_editals", payload);
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

  const deleted = await httpDelete("saved_editals", "id", params.data.id, "user_id", userId);

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

  const total = await httpCount("agent_results", { user_id: userId });

  const allRows = await httpSelect("agent_results", { user_id: userId }, { order: "created_at", ascending: false });

  // Group by agentId in JS (PostgREST doesn't support GROUP BY directly)
  const agentMap = new Map<string, number>();
  for (const row of allRows) {
    const agentId = (row as any).agentId ?? "unknown";
    agentMap.set(agentId, (agentMap.get(agentId) ?? 0) + 1);
  }
  const byAgent = Array.from(agentMap.entries()).map(([agentId, count]) => ({ agentId, count }));

  const recentAnalyses = allRows.slice(0, 10);

  res.json({
    total,
    byAgent,
    recentAnalyses,
  });
});

// ── POST /edital/share — create a share link ──────────────────────
const ShareBodySchema = z.object({
  agentId: z.string().min(1).max(64),
  title: z.string().max(300),
  resultJson: z.record(z.string(), z.unknown()),
});

/** Tamanho máximo do JSON compartilhado (evita usar o banco como depósito de dados). */
export const MAX_SHARE_JSON_BYTES = 512 * 1024;

router.post("/edital/share", async (req, res) => {
  const parsed = ShareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { agentId, title, resultJson } = parsed.data;
  if (Buffer.byteLength(JSON.stringify(resultJson), "utf8") > MAX_SHARE_JSON_BYTES) {
    res.status(413).json({ error: "O resultado é grande demais para ser compartilhado." });
    return;
  }
  const token = randomUUID();
  const userId = getReqUserId(req);
  try {
    const supabase = getSupabaseAdmin();
    const row: Record<string, unknown> = { token, agent_id: agentId, title, result_json: resultJson };
    // Registra quem criou o link quando o usuário está logado
    if (userId) row.user_id = String(userId);
    let { error } = await supabase.from("shared_results").insert(row);
    // Bancos sem a migration 20260713 (coluna user_id): grava sem o dono
    if (error && userId && /user_id/.test(error.message)) {
      delete row.user_id;
      ({ error } = await supabase.from("shared_results").insert(row));
    }
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    req.log?.error({ error: error instanceof Error ? error.message : String(error) }, "Failed to create share link");
    res.status(503).json({ error: "Falha ao criar o link de compartilhamento. Tente novamente." });
    return;
  }
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
  // Cada página é uma imagem JPEG em base64 (sem o prefixo data:), até ~3 MB
  const invalidPage = pages.some(
    (p) => typeof p !== "string" || p.length === 0 || p.length > 4_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(p),
  );
  if (invalidPage) {
    res.status(400).json({ error: "Página inválida: envie imagens em base64 de até 3 MB." });
    return;
  }

  try {
    // Delegado ao AIService para garantir logging centralizado e rastreabilidade
    const text = await ocrPdf(pages as string[]);
    res.json({ text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const classification = classifyAiError(msg);
    req.log?.error({ error: msg, reason: classification.reason }, classification.logMessage ?? "ocr-pdf failed");
    res.status(classification.status).json({ error: classification.userMessage });
  }
});

// ── GET /edital/share/:token — retrieve shared result ─────────────
router.get("/edital/share/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shared_results")
      .select("*")
      .eq("token", token)
      .limit(1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) {
      res.status(404).json({ error: "Link não encontrado ou expirado." });
      return;
    }
    res.json(mapKeys(data[0]));
  } catch (error) {
    req.log?.error({ error: error instanceof Error ? error.message : String(error) }, "Failed to fetch shared result");
    res.status(503).json({ error: "Falha ao buscar o link compartilhado. Tente novamente." });
    return;
  }
});

export default router;
