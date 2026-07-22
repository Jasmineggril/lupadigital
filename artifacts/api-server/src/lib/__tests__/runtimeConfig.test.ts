import { afterEach, describe, expect, it } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("runtimeConfig", () => {
  it("uses env overrides for rate limits", async () => {
    process.env.RATE_LIMIT_DEFAULT_MAX = "400";
    process.env.RATE_LIMIT_AI_MAX = "90";
    process.env.RATE_LIMIT_OCR_MAX = "20";

    const { getRateLimitConfig } = await import("../runtimeConfig");

    expect(getRateLimitConfig()).toEqual({
      defaultMax: 400,
      aiMax: 90,
      ocrMax: 20,
    });
  });

  it("uses sensible defaults when env vars are absent", async () => {
    delete process.env.RATE_LIMIT_DEFAULT_MAX;
    delete process.env.RATE_LIMIT_AI_MAX;
    delete process.env.RATE_LIMIT_OCR_MAX;

    const { getRateLimitConfig } = await import("../runtimeConfig");

    expect(getRateLimitConfig()).toEqual({
      defaultMax: 300,
      aiMax: 120,
      ocrMax: 30,
    });
  });

  it("parses database pool settings from env", async () => {
    process.env.PG_POOL_MAX = "12";
    process.env.PG_POOL_IDLE_TIMEOUT_MS = "45000";
    process.env.PG_CONNECTION_TIMEOUT = "15000";

    const { getDatabasePoolConfig } = await import("../runtimeConfig");

    expect(getDatabasePoolConfig()).toEqual({
      max: 12,
      idleTimeoutMillis: 45000,
      connectionTimeoutMillis: 15000,
    });
  });
});
