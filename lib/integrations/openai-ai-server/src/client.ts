import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIModel(): string {
  if (process.env.GEMINI_API_KEY) return "gemini-2.5-flash";
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
}

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  // 1ª opção: chave gratuita do Google AI Studio (sem custo)
  if (process.env.GEMINI_API_KEY) {
    _client = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    return _client;
  }

  // 2ª opção: OPENAI_API_KEY direta
  if (process.env.OPENAI_API_KEY) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _client;
  }

  throw new Error(
    "IA não configurada. Defina GEMINI_API_KEY (Google AI Studio, grátis) ou OPENAI_API_KEY nos Secrets.",
  );
}

// Lazy proxy — só inicializa na primeira chamada real
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") return value.bind(client);
    return value;
  },
});
