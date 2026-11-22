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

import { buildDocumentBase, normalizeEligibilityCriteria, verifyAgainstText } from "../lib/documentBase";
import { applyAnalysisFacts, factIssues } from "../lib/analysisFacts";
import { getStore } from "../lib/lupa/store";
import { Router, type IRouter } from "express";
import * as cheerio from "cheerio";
import { z } from "zod";
import multer from "multer";
import { randomUUID } from "crypto";
import { httpSelect, httpSelectTwoFilters, httpInsert, httpDelete, httpCount, httpUpdate } from "../lib/db-http";
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
import { getReqUserId, requireAuth } from "../lib/supabase";
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

/** Limite de texto por análise (≈ 150 páginas de edital). */
export const MAX_ANALYZE_CHARS = 450_000;

/**
 * Acrescenta à resposta da IA a base documental comum (igual para todos os agentes),
 * a verificação de datas/valores contra o texto e a elegibilidade em 3 estados.
 * Nunca altera o objeto em cache (trabalha numa cópia).
 */
/**
 * Metadados do documento só com o que o TEXTO sustenta (achado em produção, 21/11/2026: a IA
 * devolveu "anoPublicacao: 2024" e "totalPaginas: 45" para um texto colado de 3 linhas, sem ano
 * de publicação nem paginação). Ano só fica se aparecer no texto; número de páginas nunca vem da
 * IA (com texto colado ela não tem como saber).
 */
export function groundDocumentMeta<T extends Record<string, unknown>>(out: T, text: string): T {
  const fix = (doc: unknown) => {
    if (!doc || typeof doc !== "object") return doc;
    const d = { ...(doc as Record<string, unknown>) };
    if (typeof d.anoPublicacao === "number" && !new RegExp(`\\b${d.anoPublicacao}\\b`).test(text)) delete d.anoPublicacao;
    delete d.totalPaginas;
    return d;
  };
  const o = out as Record<string, unknown>;
  if (o.documento) o.documento = fix(o.documento);
  const agent = o.agentResult as Record<string, unknown> | undefined;
  if (agent?.documento) o.agentResult = { ...agent, documento: fix(agent.documento) };
  if (typeof o.anoPublicacao === "number" && !new RegExp(`\\b${o.anoPublicacao}\\b`).test(text)) delete o.anoPublicacao;
  delete o.totalPaginas;
  return out;
}

async function withDocumentBase(result: unknown, text: string, userId: string | null) {
  const out = groundDocumentMeta({ ...(result as Record<string, unknown>) }, text);
  let teacher = null;
  if (userId) {
    try {
      teacher = await getStore().getProfile(userId);
    } catch {
      teacher = null; // sem perfil docente (ou banco indisponível): elegibilidade fica sem comparação
    }
  }
  const base = buildDocumentBase(text, teacher);
  // Fatos conferidos contra o texto: exigências com evidência, prazo único e campos conciliados
  const grounded = applyAnalysisFacts(out, text, base);
  Object.assign(out, grounded);
  out.verificacao = [...verifyAgainstText(result, text), ...factIssues(grounded.fatos)];
  if (Array.isArray(out.criterios)) out.criterios = normalizeEligibilityCriteria(out.criterios);
  const agent = out.agentResult as Record<string, unknown> | undefined;
  if (agent && Array.isArray(agent.criterios)) out.agentResult = { ...agent, criterios: normalizeEligibilityCriteria(agent.criterios) };
  return out;
}

router.post("/edital/analyze", async (req, res): Promise<void> => {
  const parsed = AgentAnalyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { agentId, text, profile } = parsed.data;
  if (text.length > MAX_ANALYZE_CHARS) {
    res.status(413).json({
      error: `O texto tem ${text.length.toLocaleString("pt-BR")} caracteres; o limite é ${MAX_ANALYZE_CHARS.toLocaleString("pt-BR")} (cerca de 150 páginas). Envie só as partes do edital que interessam.`,
    });
    return;
  }

  // Limpa o texto antes de processar — remove binário de PDF e ruído tipográfico.
  // Documentos extensos não são bloqueados; eles são analisados em partes e consolidados.
  const cleaned = cleanEditalText(text);
  if (cleaned.trim().length < 20) {
    res.status(422).json({ error: "Não há texto legível suficiente para analisar. Se for um PDF escaneado, use a leitura por OCR." });
    return;
  }

  try {
    const userId = getReqUserId(req);
    const result = await analyzeAgent(agentId, cleaned, profile, { userId, documentId: null });
    res.json(await withDocumentBase(result, cleaned, userId));
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

  try {
    // Mais recentes primeiro; limite evita respostas enormes (a tela pagina localmente)
    const rows = await httpSelect("agent_results", { user_id: userId }, { order: "created_at", ascending: false, limit: 200 });
    res.json(rows);
  } catch (err) {
    req.log?.error({ error: err instanceof Error ? err.message : String(err) }, "agent-history:list");
    res.status(503).json({ error: "Não foi possível carregar o histórico agora. Tente novamente." });
  }
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
        // Campos do servidor exibidos na tela (base documental, verificação, estado do
        // processamento) são preservados como estavam: reabrir mostra o mesmo resultado.
        const keep: Record<string, unknown> = {};
        for (const k of ["base", "verificacao", "processing", "source", "analysisId", "schemaVersion"]) {
          if (originalAgentResult[k] !== undefined) keep[k] = originalAgentResult[k];
        }
        payload.resultJson = { ...canonical, ...keep, agentResult: originalAgentResult } as any;
      } catch (err) {
        // Em caso de falha na construção canônica, logamos e prosseguimos salvando o resultado do agente.
        req.log?.warn({ err }, "Falha ao construir análise canônica; salvando resultado do agente sem canonical.");
      }
    }
  } catch (e) {
    req.log?.warn({ e }, "Erro não crítico preparando payload de agent-history");
  }
  try {
    const saved = await httpInsert("agent_results", payload);
    res.status(201).json(saved);
  } catch (err) {
    req.log?.error({ error: err instanceof Error ? err.message : String(err) }, "agent-history:insert");
    // Nunca responder "salvo" sem confirmação do banco
    res.status(503).json({ error: "Não foi possível salvar no histórico. Nada foi gravado; tente novamente." });
  }
});

const FavoriteBodySchema = z.object({ favorito: z.boolean() }).strict();

/** Marca/desmarca favorito — só no registro do próprio usuário. */
router.patch("/edital/agent-history/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentResultParamsSchema.safeParse(req.params);
  const body = FavoriteBodySchema.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Requisição inválida." });
    return;
  }
  const userId = (req as any).user?.id ?? null;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const updated = await httpUpdate("agent_results", { favorito: body.data.favorito }, "id", params.data.id, "user_id", userId);
    if (!updated) {
      res.status(404).json({ error: "Análise não encontrada." });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log?.error({ error: err instanceof Error ? err.message : String(err) }, "agent-history:favorite");
    res.status(503).json({ error: "Não foi possível atualizar o favorito. Tente novamente." });
  }
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

  try {
    const deleted = await httpDelete("agent_results", "id", params.data.id, "user_id", userId);
    if (!deleted) {
      res.status(404).json({ error: "Análise não encontrada." });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    req.log?.error({ error: err instanceof Error ? err.message : String(err) }, "agent-history:delete");
    res.status(503).json({ error: "Não foi possível excluir agora. Nada foi apagado; tente novamente." });
  }
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
    // Tempo esgotado ou conexão cortada: o endereço pode estar certo — alguns sites oficiais
    // recusam acessos automáticos ou de fora do Brasil. Dizer isso e oferecer o caminho que funciona.
    const blocked = /timeout|aborted|ECONNRESET|socket hang up|ETIMEDOUT|ECONNREFUSED|UND_ERR/i.test(message) || (err as { name?: string })?.name === "TimeoutError";
    res.status(422).json({
      error: blocked
        ? "O site não respondeu ao LUPA (alguns sites oficiais recusam leitura automática). Baixe o PDF do edital e use “Ler PDF”, ou copie o texto e use “Colar texto”."
        : "Não foi possível acessar a URL. Verifique se ela está correta e disponível.",
      code: blocked ? "SITE_NAO_RESPONDEU" : "URL_INACESSIVEL",
    });
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

// ── Compartilhamento ─────────────────────────────────────────────
// Link público SOMENTE LEITURA, criado por quem está logado (para poder revogar),
// com validade (padrão 30 dias). O conteúdo compartilhado nunca inclui dados do
// perfil de quem compartilhou, e a resposta pública não revela o dono.
const ShareBodySchema = z.object({
  agentId: z.string().min(1).max(64),
  title: z.string().max(300),
  resultJson: z.record(z.string(), z.unknown()),
  validadeDias: z.coerce.number().int().min(1).max(90).optional(),
});

/** Tamanho máximo do JSON compartilhado (evita usar o banco como depósito de dados). */
export const MAX_SHARE_JSON_BYTES = 512 * 1024;
export const SHARE_DEFAULT_DAYS = 30;

/** Remove do resultado o que é pessoal (comparação com o perfil de quem compartilhou). */
export function sanitizeSharedResult(result: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
  const strip = (obj: unknown) => {
    if (obj && typeof obj === "object" && "base" in (obj as Record<string, unknown>)) {
      const base = (obj as Record<string, unknown>).base;
      if (base && typeof base === "object") delete (base as Record<string, unknown>).elegibilidade_perfil;
    }
  };
  strip(clone);
  strip(clone.agentResult);
  delete clone.userId;
  delete clone.user_id;
  return clone;
}

/** Situação de um link a partir da linha do banco (colunas novas podem não existir em bancos antigos). */
export function shareState(row: Record<string, unknown>, now = Date.now()): "ativo" | "revogado" | "expirado" {
  if (row.revoked_at || row.revokedAt) return "revogado";
  const rawExp = row.expires_at ?? row.expiresAt;
  const exp = rawExp ? Date.parse(String(rawExp)) : NaN;
  if (!Number.isNaN(exp) && exp <= now) return "expirado";
  return "ativo";
}

router.post("/edital/share", async (req, res) => {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Entre na sua conta para criar um link. Assim você pode revogá-lo depois." });
    return;
  }
  const parsed = ShareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { agentId, title } = parsed.data;
  const resultJson = sanitizeSharedResult(parsed.data.resultJson);
  if (Buffer.byteLength(JSON.stringify(resultJson), "utf8") > MAX_SHARE_JSON_BYTES) {
    res.status(413).json({ error: "O resultado é grande demais para ser compartilhado." });
    return;
  }
  const token = randomUUID();
  const days = parsed.data.validadeDias ?? SHARE_DEFAULT_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  try {
    await httpInsert("shared_results", { token, agent_id: agentId, title, result_json: resultJson, user_id: String(userId), expires_at: expiresAt });
  } catch (error) {
    req.log?.error({ error: error instanceof Error ? error.message : String(error) }, "Failed to create share link");
    res.status(503).json({ error: "Falha ao criar o link de compartilhamento. Nada foi publicado; tente novamente." });
    return;
  }
  res.status(201).json({ token, expiresAt });
});

// ── GET /edital/shares — links criados por mim ────────────────────
router.get("/edital/shares", async (req, res) => {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const rows = await httpSelect<Record<string, unknown>>("shared_results", { user_id: String(userId) }, { order: "created_at", ascending: false, limit: 100 });
    res.json({
      links: rows.map((r) => ({
        token: r.token,
        title: r.title,
        agentId: r.agentId,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt ?? null,
        estado: shareState(r),
      })),
    });
  } catch (error) {
    req.log?.error({ error: error instanceof Error ? error.message : String(error) }, "Failed to list share links");
    res.status(503).json({ error: "Não foi possível carregar seus links agora." });
  }
});

// ── DELETE /edital/share/:token — revogar (só o dono) ─────────────
router.delete("/edital/share/:token", async (req, res) => {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const updated = await httpUpdate("shared_results", { revoked_at: new Date().toISOString() }, "token", req.params.token, "user_id", String(userId));
    if (!updated) {
      res.status(404).json({ error: "Link não encontrado." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    req.log?.error({ error: error instanceof Error ? error.message : String(error) }, "Failed to revoke share link");
    res.status(503).json({ error: "Não foi possível revogar agora. O link continua ativo; tente novamente." });
  }
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

// ── GET /edital/share/:token — leitura pública (sem dados do dono) ──
router.get("/edital/share/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const rows = await httpSelect<Record<string, unknown>>("shared_results", { token }, { limit: 1 });
    const row = rows[0];
    if (!row || shareState(row) !== "ativo") {
      res.status(404).json({ error: "Link não encontrado, expirado ou revogado por quem o criou." });
      return;
    }
    res.json({
      token: row.token,
      agentId: row.agentId,
      title: row.title,
      resultJson: sanitizeSharedResult((row.resultJson ?? {}) as Record<string, unknown>),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? null,
    });
  } catch (error) {
    req.log?.error({ error: error instanceof Error ? error.message : String(error) }, "Failed to fetch shared result");
    res.status(503).json({ error: "Falha ao buscar o link compartilhado. Tente novamente." });
    return;
  }
});

export default router;
