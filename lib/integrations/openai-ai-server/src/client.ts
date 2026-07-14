import OpenAI from "openai";

let _client: OpenAI | null = null;
let _useGemini = false;

export function getOpenAIModel(): string {
  // Gemini proxy (Replit): usa o modelo Gemini
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini-2.5-flash";
  // OpenAI direto (Vercel/produção): usa GPT
  if (process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  // Gemini direto (fallback)
  return "gemini-2.5-flash";
}

/** Converte mensagens OpenAI → payload nativo Gemini e devolve resposta no formato OpenAI. */
async function geminiCreate(params: Record<string, unknown>): Promise<unknown> {
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const apiKey =
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Nenhuma chave Gemini encontrada.");
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

  // Prioridade 1: proxy Gemini do Replit (ambiente local / Replit)
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    _useGemini = true;
    _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
    return _client;
  }

  // Prioridade 2: OpenAI direto (Vercel / qualquer ambiente com OPENAI_API_KEY)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    _useGemini = false;
    _client = new OpenAI({ apiKey: openaiKey });
    return _client;
  }

  // Prioridade 3: Gemini direto (fallback — pode falhar se a chave for formato AQ.)
  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    _useGemini = true;
    _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
    return _client;
  }

  throw new Error("Nenhuma chave de IA configurada. Configure OPENAI_API_KEY ou GEMINI_API_KEY.");
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});
