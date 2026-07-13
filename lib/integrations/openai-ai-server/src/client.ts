import OpenAI from "openai";

let _client: OpenAI | null = null;

const validateKey = () => {
  const hasIntegration = process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!hasIntegration && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "OpenAI not configured. Set OPENAI_API_KEY in Replit Secrets or enable the Replit AI Integration.",
    );
  }
};

export function getOpenAIModel(): string {
  const configured = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";
  if (/^gpt-5(\.|$)/i.test(configured)) {
    return "gpt-4.1";
  }
  return configured;
}

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  validateKey();

  const hasIntegration = process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = hasIntegration
    ? process.env.AI_INTEGRATIONS_OPENAI_API_KEY!
    : process.env.OPENAI_API_KEY!;
  const options: { apiKey: string; baseURL?: string } = { apiKey };

  if (hasIntegration) {
    options.baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL!;
  } else if (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    options.baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  }

  _client = new OpenAI(options);

  return _client;
}

// Lazy proxy — only throws when a method is actually called
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAIClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
