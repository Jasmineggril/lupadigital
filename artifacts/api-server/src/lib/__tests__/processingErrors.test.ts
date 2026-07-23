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
    expect(result.userMessage).toContain("não pôde ser processado");
  });

  it("maps Gemini empty response to content blocked", () => {
    const result = classifyAiError("GEMINI_EMPTY: resposta vazia");

    expect(result.status).toBe(422);
    expect(result.retryable).toBe(false);
  });

  it("maps timeout to retryable", () => {
    const result = classifyAiError("ETIMEDOUT: request timed out after 120s");

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

  it("maps HTTP 413 status code to content too large", () => {
    const result = classifyAiError("Gemini 413: Request Entity Too Large");

    expect(result.status).toBe(413);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("extenso");
  });

  it("maps context_length_exceeded to content too large", () => {
    const result = classifyAiError("context_length_exceeded: maximum context length is 128000 tokens");

    expect(result.status).toBe(413);
    expect(result.retryable).toBe(false);
  });

  it("maps payload too large to content too large", () => {
    const result = classifyAiError("payload too large: 413");

    expect(result.status).toBe(413);
    expect(result.retryable).toBe(false);
  });

  it("maps TPM limit to content too large", () => {
    const result = classifyAiError("TPM limit exceeded: 30000 tokens per minute");

    expect(result.status).toBe(413);
    expect(result.retryable).toBe(false);
  });

  it("maps TypeError to internal error (not exposed)", () => {
    const result = classifyAiError("TypeError: Cannot read properties of undefined (reading 'type')");

    expect(result.status).toBe(500);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("erro interno");
    expect(result.userMessage).not.toContain("TypeError");
  });

  it("maps ReferenceError to internal error", () => {
    const result = classifyAiError("ReferenceError: myVar is not defined");

    expect(result.status).toBe(500);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("erro interno");
  });

  it("maps buildCanonicalAnalysis error to internal error", () => {
    const result = classifyAiError("buildCanonicalAnalysis: Cannot read propert of undefined");

    expect(result.status).toBe(500);
    expect(result.retryable).toBe(false);
    expect(result.userMessage).toContain("erro interno");
  });

  it("maps GEMINI_RATE_LIMIT to rate limit", () => {
    const result = classifyAiError("GEMINI_RATE_LIMIT: A IA está sobrecarregada no momento.");

    expect(result.status).toBe(429);
    expect(result.retryable).toBe(true);
    expect(result.userMessage).toContain("limite temporário");
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
