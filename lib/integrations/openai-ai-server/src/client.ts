import OpenAI from "openai";

let _client: OpenAI | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasGemini(): boolean {
  return !!(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL && process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
}

/** Converte mensagens OpenAI para o formato nativo do Gemini. */
function toGeminiPayload(params: Record<string, unknown>) {
  const messages = (params.messages as Array<{ role: string; content: unknown }>) ?? [];
  const systemMsg = messages.find((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    contents: turns.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
    })),
    generationConfig: {
      maxOutputTokens: (params.max_completion_tokens as number | undefined) ??
                       (params.max_tokens as number | undefined) ??
                       8192,
    },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  // response_format: json_object → Gemini responseMimeType
  const rf = params.response_format as { type?: string } | undefined;
  if (rf?.type === "json_object") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  return body;
}

/** Wrapper que chama o proxy Gemini e retorna resposta no formato OpenAI. */
async function geminiCreate(params: Record<string, unknown>): Promise<unknown> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!;
  const apiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY!;
  const model   = "gemini-2.5-flash"; // modelo rápido e gratuito via Replit

  const body = toGeminiPayload(params);

  const res = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${txt}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)?.parts as
    Array<{ text?: string }> | undefined;
  const text = parts?.[0]?.text ?? "";

  const usage = data.usageMetadata as Record<string, number> | undefined;

  // Retorna no formato OpenAI para que aiService.ts não precise mudar
  return {
    choices: [{ message: { content: text, role: "assistant" }, finish_reason: "stop" }],
    usage: {
      prompt_tokens:     usage?.promptTokenCount     ?? 0,
      completion_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens:      usage?.totalTokenCount      ?? 0,
    },
  };
}

/** Mock do cliente OpenAI usando Gemini como backend. */
function createGeminiClient(): OpenAI {
  return {
    chat: { completions: { create: geminiCreate } },
  } as unknown as OpenAI;
}

// ── Exports públicos ──────────────────────────────────────────────────────────

export function getOpenAIModel(): string {
  // Quando Gemini está disponível é ele que responde
  if (hasGemini()) return "gemini-2.5-flash";
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
}

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  if (hasGemini()) {
    // Usa o proxy Gemini da Replit (gratuito via créditos Replit)
    _client = createGeminiClient();
    return _client;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI não configurado. Defina OPENAI_API_KEY nos Secrets ou ative a integração Gemini.",
    );
  }

  _client = new OpenAI({ apiKey });
  return _client;
}

// Lazy proxy — lança erro apenas quando um método é efetivamente chamado
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});
