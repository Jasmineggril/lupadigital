/**
 * @file lib/aiKeyCheck.ts
 * @description Valida de verdade a chave do provedor de IA, para o /readyz/deep.
 *
 * Antes o health check dizia "ai: ok" só porque existia uma chave com mais de 10
 * caracteres — e escondeu uma GROQ_API_KEY revogada (todas as análises caíam no
 * modo heurístico com "401 Invalid API Key"). Agora consulta GET /models do
 * provedor, que não consome tokens, com cache de 5 minutos.
 */

export interface AiKeyStatus {
  ok: boolean;
  provider: "groq" | "openai" | "none";
  detail?: string;
}

const PROVIDERS = [
  { provider: "groq" as const, env: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/models" },
  { provider: "openai" as const, env: "OPENAI_API_KEY", url: "https://api.openai.com/v1/models" },
];

const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; value: AiKeyStatus } | null = null;

export function resetAiKeyCheckCache() {
  cached = null;
}

export async function checkAiKey(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<AiKeyStatus> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const p = PROVIDERS.find((x) => (process.env[x.env] ?? "").trim().length > 10);
  let value: AiKeyStatus;
  if (!p) {
    value = { ok: false, provider: "none", detail: "Nenhuma chave de provedor de IA configurada." };
  } else {
    try {
      const res = await fetchImpl(p.url, {
        headers: { authorization: `Bearer ${(process.env[p.env] ?? "").trim()}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) value = { ok: true, provider: p.provider };
      else if (res.status === 401 || res.status === 403)
        value = { ok: false, provider: p.provider, detail: `Chave recusada pelo provedor (${res.status}). Atualize ${p.env} nas variáveis de ambiente.` };
      else value = { ok: false, provider: p.provider, detail: `Provedor respondeu ${res.status}.` };
    } catch {
      value = { ok: false, provider: p.provider, detail: "Não foi possível contatar o provedor de IA." };
    }
  }
  cached = { at: now, value };
  return value;
}
