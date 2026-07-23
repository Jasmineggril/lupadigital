import { describe, expect, it } from "vitest";
import { classifyAiError, prepareConnectionStringForRuntime } from "../processingErrors";

describe("classifyAiError", () => {
  it("maps rate limits to a specific 429 message", () => {
    const result = classifyAiError("429: rate limit reached");

    expect(result.status).toBe(429);
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("limite temporário de análises");
  });

  it("maps network failures to a temporary provider outage", () => {
    const result = classifyAiError("fetch failed: ETIMEDOUT");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("temporariamente indisponível");
  });

  it("maps 401 unauthorized to authentication error", () => {
    const result = classifyAiError("401 Unauthorized: invalid api key");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("chave de API");
  });

  it("maps 403 forbidden to access denied", () => {
    const result = classifyAiError("403 Forbidden: permission denied");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("não tem permissão");
  });

  it("maps 404 model not found to unavailable", () => {
    const result = classifyAiError("404: model not found");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("modelo");
  });

  it("maps 500 internal server error to retryable provider unavailable", () => {
    const result = classifyAiError("500 Internal Server Error");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("instabilidade");
  });

  it("maps Groq 500 server error to retryable", () => {
    const result = classifyAiError("500 The server had an error processing your request");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(true);
  });

  it("maps bad request to invalid request", () => {
    const result = classifyAiError("400 Bad Request: invalid parameter");

    expect(result.status).toBe(422);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("inválida");
  });

  it("maps safety block to content blocked", () => {
    const result = classifyAiError("SAFETY_BLOCK: conteúdo bloqueado");

    expect(result.status).toBe(422);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("filtros de segurança");
  });

  it("maps Gemini empty response to content blocked", () => {
    const result = classifyAiError("GEMINI_EMPTY: resposta vazia");

    expect(result.status).toBe(422);
    expect(result.retryable).toBe(false);
  });

  it("maps timeout to retryable", () => {
    const result = classifyAiError("Request timed out after 120s");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("demorou mais");
  });

  it("maps bad gateway to retryable", () => {
    const result = classifyAiError("502 Bad Gateway");

    expect(result.status).toBe(503);
    expect(result.retryable).toBe(true);
  });

  it("maps content too large to 413", () => {
    const result = classifyAiError("Content too large: exceeds maximum token limit");

    expect(result.status).toBe(413);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("extenso");
  });
});

describe("prepareConnectionStringForRuntime", () => {
  it("adds sslmode=require for Supabase pooler hosts", () => {
    const prepared = prepareConnectionStringForRuntime(
      "postgresql://postgres:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );

    expect(prepared).toContain("sslmode=require");
  });
});
