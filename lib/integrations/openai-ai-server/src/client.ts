import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIModel(): string {
  return "gemini-2.5-flash";
}

/** Converte mensagens OpenAI → payload nativo Gemini e devolve resposta no formato OpenAI. */
async function geminiCreate(params: Record<string, unknown>): Promise<unknown> {
  // Usa o proxy Replit se disponível, senão cai no Google AI Studio direto (free tier)
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const apiKey =
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Nenhuma chave Gemini encontrada. Configure AI_INTEGRATIONS_GEMINI_API_KEY ou GEMINI_API_KEY.");
  }

  const messages = (params.messages as Array<{ role: string; content: unknown }>) ?? [];
  const systemMsg = messages.find((m) => m.role === "system");
  const turns     = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    contents: turns.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
    })),
    generationConfig: {
      maxOutputTokens:
        (params.max_completion_tokens as number | undefined) ??
        (params.max_tokens as number | undefined) ??
        8192,
    },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const rf = params.response_format as { type?: string } | undefined;
  if (rf?.type === "json_object") {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const res = await fetch(`${baseUrl}/models/gemini-2.5-flash:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) {
      throw new Error("GEMINI_RATE_LIMIT: A IA está sobrecarregada no momento. Aguarde alguns segundos e tente novamente.");
    }
    throw new Error(`Gemini ${res.status}: ${txt}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)
    ?.parts as Array<{ text?: string }> | undefined;
  const text = parts?.[0]?.text ?? "";
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

  const hasReplit = !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const hasGeminiKey = !!(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY);

  if (!hasReplit && !hasGeminiKey) {
    throw new Error("Configure GEMINI_API_KEY no painel Vercel → Environment Variables.");
  }

  _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
  return _client;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});
