export type ProcessErrorClassification = {
  status: number;
  retryable: boolean;
  userMessage: string;
  reason: string;
  logMessage?: string;
};

function normalize(message: string): string {
  return message.toLowerCase();
}

export function classifyAiError(message: string): ProcessErrorClassification {
  const normalized = normalize(message);

  if (
    normalized.includes("content too large") ||
    normalized.includes("request too large") ||
    normalized.includes("input limit") ||
    normalized.includes("exceeds the input") ||
    normalized.includes("too large") ||
    normalized.includes("context length") ||
    normalized.includes("maximum context") ||
    normalized.includes("context window") ||
    normalized.includes("input is too long") ||
    normalized.includes("token limit")
  ) {
    return {
      status: 413,
      retryable: false,
      reason: "content_too_large",
      userMessage: "O documento é extenso e precisa ser processado em partes.",
      logMessage: "AI request too large",
    };
  }

  if (normalized.includes("429") || normalized.includes("rate limit") || normalized.includes("tpm") || normalized.includes("tpd")) {
    return {
      status: 429,
      retryable: true,
      reason: "rate_limit",
      userMessage: "O limite temporário de análises foi atingido. Aguarde e tente novamente.",
      logMessage: "AI provider rate limit",
    };
  }

  if (normalized.includes("503") || normalized.includes("temporariamente indispon") || normalized.includes("fetch failed") || normalized.includes("network")) {
    return {
      status: 503,
      retryable: true,
      reason: "provider_unavailable",
      userMessage: "O serviço de IA está temporariamente indisponível.",
      logMessage: "AI provider unavailable",
    };
  }

  if (normalized.includes("timeout") || normalized.includes("etimedout") || normalized.includes("deadline exceeded")) {
    return {
      status: 503,
      retryable: true,
      reason: "timeout",
      userMessage: "A análise demorou mais que o esperado. Tente novamente.",
      logMessage: "AI provider timeout",
    };
  }

  if (normalized.includes("schema") || normalized.includes("json") || normalized.includes("invalid") || normalized.includes("validation")) {
    return {
      status: 422,
      retryable: false,
      reason: "invalid_response",
      userMessage: "A IA retornou uma resposta incompleta. A análise não foi salva.",
      logMessage: "AI response validation failed",
    };
  }

  return {
    status: 500,
    retryable: false,
    reason: "internal_error",
    userMessage: "Não foi possível concluir a interpretação neste momento.",
    logMessage: "AI processing failed",
  };
}

export function prepareConnectionStringForRuntime(connectionString: string): string {
  let prepared = connectionString.trim();

  if (!prepared) return prepared;

  try {
    const parsed = new URL(prepared);
    const host = parsed.hostname;
    const isSupabasePooler = host.includes("pooler.supabase.com") || host.includes("supabase.co");
    const hasSsl = parsed.searchParams.get("sslmode") || parsed.searchParams.get("ssl");

    if (isSupabasePooler && !hasSsl) {
      parsed.searchParams.set("sslmode", "require");
      prepared = parsed.toString();
    }

    if (host.includes("pooler.supabase.com") && !parsed.searchParams.get("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
      prepared = parsed.toString();
    }
  } catch {
    if (/\bhost=([^\s]+)/i.test(prepared) && !/\bsslmode=/i.test(prepared)) {
      prepared = `${prepared} sslmode=require`;
    }
  }

  return prepared;
}
