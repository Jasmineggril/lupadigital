import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIModel(): string {
  if (process.env.GROQ_API_KEY) return "llama-3.3-70b-versatile";
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini-2.5-flash";
  if (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY) return "gemini-2.5-flash";
  return "gpt-5.4-mini";
}

function getGeminiApiKey(): string | undefined {
  return process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
}

/** Converte mensagens OpenAI → payload nativo Gemini e devolve resposta no formato OpenAI. */
async function geminiCreate(params: Record<string, unknown>): Promise<unknown> {
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const apiKey = getGeminiApiKey();

  if (!apiKey) throw new Error("Nenhuma chave Gemini encontrada.");

  const messages = (params.messages as Array<{ role: string; content: unknown }>) ?? [];
  const systemMsg = messages.find((m) => m.role === "system");
  const turns     = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    contents: turns.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
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

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    _client = new OpenAI({ apiKey: openaiKey, timeout: 120_000 });
    return _client;
  }

  throw new Error("Nenhuma chave de IA configurada. Adicione GROQ_API_KEY nas variáveis de ambiente (grátis em console.groq.com).");
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
): Promise<FallbackResult> {
  const primaryProvider = getProviderName();
  const primaryModel = getOpenAIModel();

  try {
    const result = await openai.chat.completions.create(payload as any);
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
      throw primaryError;
    }

    try {
      const fallbackResult = await fallbackProvider.client.chat.completions.create(payload as any);
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
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "unknown";
}

interface FallbackProvider {
  name: string;
  model: string;
  client: OpenAI;
}

function getFallbackProvider(): FallbackProvider | null {
  const current = getProviderName();

  if (current === "groq") {
    if (getGeminiApiKey()) {
      return {
        name: "gemini",
        model: "gemini-2.5-flash",
        client: { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI,
      };
    }
    if (process.env.OPENAI_API_KEY) {
      return {
        name: "openai",
        model: "gpt-5.4-mini",
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000 }),
      };
    }
  }

  if (current === "gemini") {
    if (process.env.GROQ_API_KEY) {
      return {
        name: "groq",
        model: "llama-3.3-70b-versatile",
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
