import OpenAI from "openai";

let _client: OpenAI | null = null;

const validateKey = () => {
  const hasDirectKey = !!process.env.OPENAI_API_KEY;
  const hasIntegration = process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!hasDirectKey && !hasIntegration) {
    throw new Error(
      "OpenAI not configured. Set OPENAI_API_KEY in Replit Secrets or enable the Replit AI Integration.",
    );
  }
};

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
}

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  validateKey();

  // Prefer OPENAI_API_KEY direto (key real do usuário).
  // Só usa o proxy da integração se a key direta não estiver configurada.
  const directKey = process.env.OPENAI_API_KEY;
  const hasIntegration = process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  const options: { apiKey: string; baseURL?: string } = {
    apiKey: directKey || process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
  };

  // Só aplica baseURL se estiver usando o proxy (sem key direta)
  if (!directKey && hasIntegration) {
    options.baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL!;
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
