import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIModel(): string {
  // Groq (llama) quando disponível
  if (process.env.GROQ_API_KEY) return "llama-3.3-70b-versatile";
  // Gemini proxy do Replit
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) return "gemini-2.5-flash";
  // Gemini direto
  if (process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY) return "gemini-2.5-flash";
  // OpenAI direto (fallback)
  return "gpt-4o-mini";
}

/** Converte mensagens OpenAI → payload nativo Gemini e devolve resposta no formato OpenAI. */
async function geminiCreate(params: Record<string, unknown>): Promise<unknown> {
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const apiKey =
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY;

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
  const isProxy = baseUrl.includes("localhost") || baseUrl.includes("modelfarm");
  const url = isProxy
    ? `${baseUrl}/models/${model}:generateContent`
    : `${baseUrl}/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("GEMINI_RATE_LIMIT: A IA está sobrecarregada no momento.");
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

  // Prioridade 1: Groq (grátis, sem cartão, llama-3.3-70b)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    _client = new OpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    return _client;
  }

  // Prioridade 2: Proxy Gemini do Replit (localhost:1106 — só funciona no Replit)
  if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
    return _client;
  }

  // Prioridade 3: Gemini direto (requer chave AIzaSy do Google AI Studio)
  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    _client = { chat: { completions: { create: geminiCreate } } } as unknown as OpenAI;
    return _client;
  }

  // Prioridade 4: OpenAI direto (requer créditos)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    _client = new OpenAI({ apiKey: openaiKey });
    return _client;
  }

  throw new Error("Nenhuma chave de IA configurada. Adicione GROQ_API_KEY no Vercel (grátis em console.groq.com).");
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});
