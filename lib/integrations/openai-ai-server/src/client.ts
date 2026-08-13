import OpenAI from "openai";

export { OpenAI };

let _client: OpenAI | null = null;

const DUMMY_KEY_SENTINELS = new Set([
  "DUMMY_API_KEY",
  "_DUMMY_API_KEY_",
  "API_KEY",
  "XXXX",
]);

function isUsableKey(value: string | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (DUMMY_KEY_SENTINELS.has(v)) return false;
  if (/^x+$/i.test(v)) return false;
  return true;
}

export function getGeminiApiKey(): string | undefined {
  const integration = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (isUsableKey(integration)) return integration;
  const direct = process.env.GEMINI_API_KEY;
  if (isUsableKey(direct)) return direct;
  return undefined;
}

export function getOpenAIKey(): string | undefined {
  const integration = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (isUsableKey(integration)) return integration;
  const direct = process.env.OPENAI_API_KEY;
  if (isUsableKey(direct)) return direct;
  return undefined;
}

export function getOpenAIBaseURL(): string | undefined {
  const v = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
  return v || undefined;
}

export function getOpenAIModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  if (process.env.GROQ_API_KEY) return "openai/gpt-oss-120b";
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini-2.5-flash";
  if (getGeminiApiKey()) return "gemini-2.5-flash";
  return "gpt-5.4-mini";
}

/** Modelo com suporte a visão (imagens) para OCR. Groq com openai/gpt-oss-120b NÃO suporta imagens. */
export function getVisionModel(): string {
  if (getOpenAIKey()) return "gpt-4o";
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini-2.5-flash";
  if (getGeminiApiKey()) return "gemini-2.5-flash";
  return "";
}

export function hasVisionSupport(): boolean {
  return getVisionClients().length > 0;
}

export interface VisionClient {
  client: OpenAI;
  provider: string;
  model: string;
}

/**
 * Todos os provedores configurados que possuem modelo com visão (para OCR).
 * Ordem de preferência: OpenAI (GPT-4o) → Gemini (gemini-2.5-flash).
 * Permite que o OCR faça fallback quando o provedor preferido falhar
 * (ex.: cota esgotada — 429), em vez de retornar erro direto.
 */
export function getVisionClients(): VisionClient[] {
  const clients: VisionClient[] = [];
  const openaiKey = getOpenAIKey();
  if (openaiKey) {
    clients.push({
      client: new OpenAI({
        apiKey: openaiKey,
        timeout: 120_000,
        ...(getOpenAIBaseURL() ? { baseURL: getOpenAIBaseURL() } : {}),
      }),
      provider: "openai",
      model: "gpt-4o",
    });
  }
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || getGeminiApiKey()) {
    clients.push({
      client: { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI,
      provider: "gemini",
      model: "gemini-2.5-flash",
    });
  }
  return clients;
}

/** Cliente e modelo com suporte a visão para OCR. Lança erro claro quando indisponível. */
export function getVisionClient(): VisionClient {
  const clients = getVisionClients();
  if (clients.length === 0) {
    throw new Error(
      "OCR_INDISPONIVEL: O provedor de IA configurado (Groq/openai/gpt-oss-120b) não oferece suporte a OCR de imagens. " +
        "Configure GEMINI_API_KEY ou OPENAI_API_KEY para habilitar OCR de PDFs escaneados.",
    );
  }
  return clients[0];
}

/** Converte mensagens OpenAI → payload nativo Gemini e devolve resposta no formato OpenAI. */
export async function geminiCreate(params: Record<string, unknown>): Promise<unknown> {
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const apiKey = getGeminiApiKey();

  if (!apiKey) throw new Error("Nenhuma chave Gemini encontrada.");

  const messages = (params.messages as Array<{ role: string; content: unknown }>) ?? [];
  const systemMsg = messages.find((m) => m.role === "system");
  const turns     = messages.filter((m) => m.role !== "system");

  const toGeminiParts = (content: unknown): Array<Record<string, unknown>> => {
    if (typeof content === "string") return [{ text: content }];
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === "string") return { text: part };
        if (part && typeof part === "object") {
          const p = part as { type?: string; text?: string; image_url?: { url?: string } };
          if (p.type === "image_url" && typeof p.image_url?.url === "string") {
            const match = p.image_url.url.match(/^data:image\/(\w+);base64,(.+)$/);
            if (match) return { inline_data: { mime_type: `image/${match[1]}`, data: match[2] } };
            return { text: "" };
          }
          if (p.type === "text" && typeof p.text === "string") return { text: p.text };
        }
        return { text: JSON.stringify(part) };
      });
    }
    return [{ text: JSON.stringify(content) }];
  };

  const body: Record<string, unknown> = {
    contents: turns.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: toGeminiParts(m.content),
    })),
    generationConfig: {
      maxOutputTokens: (params.max_tokens as number | undefined) ?? 4096,
    },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const rf = params.response_format as { type?: string } | undefined;
  if (rf?.type === "json_object") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const model = "gemini-2.5-flash";
  const url = `${baseUrl}/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("GEMINI_RATE_LIMIT: A IA está sobrecarregada no momento.");
    throw new Error(`Gemini ${res.status}: ${txt}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  const firstCandidate = candidates?.[0];
  const finishReason = (firstCandidate?.finishReason ?? firstCandidate?.finish_reason) as string | undefined;

  if (finishReason && finishReason !== "STOP" && finishReason !== "stop") {
    if (finishReason === "SAFETY" || finishReason === "RECITATION") {
      throw new Error("SAFETY_BLOCK: O conteúdo foi bloqueado pelos filtros de segurança do modelo.");
    }
    throw new Error(`Gemini finish_reason=${finishReason}: A resposta foi truncada ou bloqueada.`);
  }

  const parts = (firstCandidate?.content as Record<string, unknown> | undefined)
    ?.parts as Array<{ text?: string }> | undefined;
  const text = parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("GEMINI_EMPTY: O modelo retornou uma resposta vazia. O conteúdo pode ter sido bloqueado.");
  }

  const usage = data.usageMetadata as Record<string, number> | undefined;

  return {
    choices: [{ message: { content: text, role: "assistant" }, finish_reason: "stop" }],
    usage: {
      prompt_tokens:     usage?.promptTokenCount     ?? 0,
      completion_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens:      usage?.totalTokenCount      ?? 0,
    },
  };
}

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    _client = new OpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
      timeout: 120_000,
    });
    return _client;
  }

  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
    return _client;
  }

  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
    return _client;
  }

  const openaiKey = getOpenAIKey();
  if (openaiKey) {
    _client = new OpenAI({
      apiKey: openaiKey,
      timeout: 120_000,
      ...(getOpenAIBaseURL() ? { baseURL: getOpenAIBaseURL() } : {}),
    });
    return _client;
  }

  throw new Error("Nenhuma chave de IA configurada. Adicione GROQ_API_KEY nas variáveis de ambiente (grátis em console.groq.com)." );
}

export function getOpenAIVisionClient(): OpenAI {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY não está configurada. O OCR de PDF requer uma chave OpenAI Vision válida.");
  }

  return new OpenAI({
    apiKey: openaiKey,
    timeout: 120_000,
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  });
}

export function getOpenAIVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});

function isRetryableProviderError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("500") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("internal server error") ||
    m.includes("server had an error") ||
    m.includes("bad gateway") ||
    m.includes("overloaded") ||
    m.includes("service unavailable") ||
    m.includes("temporarily") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("timeout") ||
    m.includes("aborted") ||
    m.includes("upstream")
  );
}

export interface FallbackResult {
  result: unknown;
  provider: string;
  model: string;
  fallbackAttempted: boolean;
  fallbackSucceeded: boolean;
}

export async function createWithFallback(
  payload: Record<string, unknown>,
  requestOptions?: { signal?: AbortSignal | null; timeout?: number },
): Promise<FallbackResult> {
  const primaryProvider = getProviderName();
  const primaryModel = getOpenAIModel();

  try {
    const result = await openai.chat.completions.create(payload as any, requestOptions as any);
    return {
      result,
      provider: primaryProvider,
      model: primaryModel,
      fallbackAttempted: false,
      fallbackSucceeded: false,
    };
  } catch (primaryError) {
    const msg = primaryError instanceof Error ? primaryError.message : String(primaryError);

    if (!isRetryableProviderError(msg)) {
      throw primaryError;
    }

    const fallbackProvider = getFallbackProvider();
    if (!fallbackProvider) {
      const providerName = getProviderName();
      const providerErrors: Record<string, string> = {
        groq: "Provedor primário (Groq) falhou e nenhum fallback está disponível. Verifique as chaves de API dos provedores alternativos.",
        gemini: "Provedor primário (Gemini) falhou e nenhum fallback está disponível. Verifique as chaves de API dos provedores alternativos.",
        openai: "Provedor primário (OpenAI) falhou e nenhum fallback está disponível. Verifique as chaves de API dos provedores alternativos.",
      };
      throw new Error(providerErrors[providerName] ?? "Todos os provedores de IA estão indisponíveis. Nenhum fallback configurado.");
    }

    try {
      const fallbackResult = await fallbackProvider.client.chat.completions.create(payload as any, requestOptions as any);
      return {
        result: fallbackResult,
        provider: fallbackProvider.name,
        model: fallbackProvider.model,
        fallbackAttempted: true,
        fallbackSucceeded: true,
      };
    } catch {
      throw primaryError;
    }
  }
}

function getProviderName(): string {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || getGeminiApiKey()) return "gemini";
  if (getOpenAIKey()) return "openai";
  return "unknown";
}

interface FallbackProvider {
  name: string;
  model: string;
  client: OpenAI;
}

function getFallbackProvider(): FallbackProvider | null {
  const current = getProviderName();
  const skipGemini = process.env.AI_SKIP_GEMINI_FALLBACK === "true";
  const skipOpenai = process.env.AI_SKIP_OPENAI_FALLBACK === "true";

  if (current === "groq") {
    if (!skipGemini && getGeminiApiKey()) {
      return {
        name: "gemini",
        model: "gemini-2.5-flash",
        client: { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI,
      };
    }
    if (!skipOpenai && getOpenAIKey()) {
      return {
        name: "openai",
        model: "gpt-5.4-mini",
        client: new OpenAI({
          apiKey: getOpenAIKey() as string,
          timeout: 120_000,
          ...(getOpenAIBaseURL() ? { baseURL: getOpenAIBaseURL() } : {}),
        }),
      };
    }
  }

  if (current === "gemini") {
    if (process.env.GROQ_API_KEY) {
      return {
        name: "groq",
        model: "openai/gpt-oss-120b",
        client: new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: "https://api.groq.com/openai/v1",
          timeout: 120_000,
        }),
      };
    }
  }

  return null;
}
