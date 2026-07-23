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

  // ── Autenticação / chave inválida (401) ──────────────────────────────
  if (
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("authentication") ||
    normalized.includes("api_key_invalid") ||
    normalized.includes("invalid_key")
  ) {
    return {
      status: 503,
      retryable: false,
      reason: "ai_not_configured",
      userMessage: "A chave de API do serviço de IA é inválida. Entre em contato com o administrador.",
      logMessage: "AI provider authentication failed — invalid or revoked API key",
    };
  }

  // ── Acesso negado / sem permissão (403) ──────────────────────────────
  if (
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission denied") ||
    normalized.includes("access denied")
  ) {
    return {
      status: 503,
      retryable: false,
      reason: "ai_not_configured",
      userMessage: "O serviço de IA não tem permissão para processar esta solicitação.",
      logMessage: "AI provider access denied (403)",
    };
  }

  // ── Conteúdo excessivamente longo (413 / token limit) ─────────────────
  if (
    normalized.includes("413") ||
    normalized.includes("content too large") ||
    normalized.includes("request too large") ||
    normalized.includes("payload too large") ||
    normalized.includes("input limit") ||
    normalized.includes("exceeds the input") ||
    normalized.includes("too large") ||
    normalized.includes("context length") ||
    normalized.includes("context_length_exceeded") ||
    normalized.includes("maximum context") ||
    normalized.includes("context window") ||
    normalized.includes("input is too long") ||
    normalized.includes("token limit") ||
    normalized.includes("tpm limit") ||
    normalized.includes("max tokens") ||
    normalized.includes("maximum tokens") ||
    normalized.includes("prompt too long") ||
    normalized.includes("prompt + completion")
  ) {
    return {
      status: 413,
      retryable: false,
      reason: "content_too_large",
      userMessage: "O documento é extenso e precisa ser processado em partes.",
      logMessage: "AI request too large",
    };
  }

  // ── Limite de taxa (429 / rate limit / TPM / TPD) ────────────────────
  if (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("rate_limit") ||
    normalized.includes("tpm") ||
    normalized.includes("tpd") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("requests per") ||
    normalized.includes("requests per day")
  ) {
    return {
      status: 429,
      retryable: true,
      reason: "rate_limit",
      userMessage: "O limite temporário de análises foi atingido. Aguarde e tente novamente.",
      logMessage: "AI provider rate limit",
    };
  }

  // ── Modelo não encontrado (404) ──────────────────────────────────────
  if (
    normalized.includes("404") ||
    normalized.includes("model not found") ||
    normalized.includes("model not available") ||
    normalized.includes("does not exist") ||
    normalized.includes("no such model")
  ) {
    return {
      status: 503,
      retryable: false,
      reason: "ai_not_configured",
      userMessage: "O modelo de IA configurado não está disponível. Entre em contato com o administrador.",
      logMessage: "AI model not found or not available",
    };
  }

  // ── Chave de IA não configurada ──────────────────────────────────────
  if (
    normalized.includes("nenhuma chave") ||
    normalized.includes("groq_api_key") ||
    normalized.includes("not configured") ||
    normalized.includes("no api key") ||
    normalized.includes("api key not set") ||
    normalized.includes("missing api key") ||
    normalized.includes("x-goog-api-key")
  ) {
    return {
      status: 503,
      retryable: false,
      reason: "ai_not_configured",
      userMessage: "O serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes.",
      logMessage: "AI provider key not configured",
    };
  }

  // ── Indisponibilidade do provedor (503 / fetch failed / network) ──────
  if (
    normalized.includes("503") ||
    normalized.includes("temporariamente indispon") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound") ||
    normalized.includes("econnreset")
  ) {
    return {
      status: 503,
      retryable: true,
      reason: "provider_unavailable",
      userMessage: "O serviço de IA está temporariamente indisponível.",
      logMessage: "AI provider unavailable",
    };
  }

  // ── Timeout ──────────────────────────────────────────────────────────
  if (
    normalized.includes("timeout") ||
    normalized.includes("etimedout") ||
    normalized.includes("deadline exceeded") ||
    normalized.includes("aborted") ||
    normalized.includes("signal timed out")
  ) {
    return {
      status: 503,
      retryable: true,
      reason: "timeout",
      userMessage: "A análise demorou mais que o esperado. Tente novamente.",
      logMessage: "AI provider timeout",
    };
  }

  // ── Erro interno do servidor do provedor (500 / 502) ──────────────────
  if (
    normalized.includes("500") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.includes("internal server error") ||
    normalized.includes("server had an error") ||
    normalized.includes("bad gateway") ||
    normalized.includes("upstream") ||
    normalized.includes("overloaded") ||
    normalized.includes("service unavailable") ||
    normalized.includes("temporarily overloaded")
  ) {
    return {
      status: 503,
      retryable: true,
      reason: "provider_unavailable",
      userMessage: "O serviço de IA está passando por instabilidade. Tente novamente em alguns instantes.",
      logMessage: "AI provider internal server error",
    };
  }

  // ── Requisição inválida (400) ────────────────────────────────────────
  if (
    normalized.includes("400") ||
    normalized.includes("bad request") ||
    normalized.includes("invalid request") ||
    normalized.includes("invalid parameter") ||
    normalized.includes("unsupported") ||
    normalized.includes("not supported")
  ) {
    return {
      status: 422,
      retryable: false,
      reason: "invalid_response",
      userMessage: "A solicitação de análise é inválida. Tente novamente com um documento diferente.",
      logMessage: "AI provider rejected the request (400)",
    };
  }

  // ── Resposta inválida / validação ────────────────────────────────────
  if (
    normalized.includes("schema") ||
    normalized.includes("json") ||
    normalized.includes("validation") ||
    normalized.includes("did not match expected schema") ||
    normalized.includes("unexpected token")
  ) {
    return {
      status: 422,
      retryable: false,
      reason: "invalid_response",
      userMessage: "A IA retornou uma resposta incompleta. A análise não foi salva.",
      logMessage: "AI response validation failed",
    };
  }

  // ── Safety / conteúdo bloqueado ──────────────────────────────────────
  if (
    normalized.includes("safety") ||
    normalized.includes("blocked") ||
    normalized.includes("recitation") ||
    normalized.includes("harmful") ||
    normalized.includes("finishreason") ||
    normalized.includes("finish_reason") ||
    normalized.includes("safetyrating") ||
    normalized.includes("safety_block") ||
    normalized.includes("gemini_empty") ||
    normalized.includes("resposta vazia")
  ) {
    return {
      status: 422,
      retryable: false,
      reason: "invalid_response",
      userMessage: "O conteúdo do documento não pôde ser processado pelo modelo de IA. Tente com outro documento.",
      logMessage: "AI content blocked by safety filters",
    };
  }

  // ── Erro JavaScript inesperado (TypeError, ReferenceError, etc.) ────
  if (
    normalized.includes("typeerror") ||
    normalized.includes("referenceerror") ||
    normalized.includes("syntaxerror") ||
    normalized.includes("cannot read propert") ||
    normalized.includes("is not a function") ||
    normalized.includes("is not defined") ||
    normalized.includes("cannot access") ||
    normalized.includes("assignment to constant") ||
    normalized.includes("unexpected token") ||
    normalized.includes("normalizefactstext") ||
    normalized.includes("consolidatechunkfacts") ||
    normalized.includes("buildconsolidatedagentresult") ||
    normalized.includes("buildcanonicalanalysis")
  ) {
    return {
      status: 500,
      retryable: false,
      reason: "internal_error",
      userMessage: "Ocorreu um erro interno ao processar a análise. Tente novamente.",
      logMessage: "Unexpected JavaScript error in AI processing pipeline",
    };
  }

  // ── Fallback: erro genérico ──────────────────────────────────────────
  return {
    status: 500,
    retryable: false,
    reason: "internal_error",
    userMessage: "Não foi possível concluir a interpretação neste momento.",
    logMessage: "AI processing failed — unclassified error",
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
