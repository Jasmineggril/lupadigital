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
});

describe("prepareConnectionStringForRuntime", () => {
  it("adds sslmode=require for Supabase pooler hosts", () => {
    const prepared = prepareConnectionStringForRuntime(
      "postgresql://postgres:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );

    expect(prepared).toContain("sslmode=require");
  });
});
