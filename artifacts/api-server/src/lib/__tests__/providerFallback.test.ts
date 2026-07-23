import { describe, expect, it, vi, beforeEach } from "vitest";
import { getOpenAIModel } from "@workspace/integrations-openai-ai-server";

describe("getOpenAIModel", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns groq model when GROQ_API_KEY is set", () => {
    process.env.GROQ_API_KEY = "test";
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL = "";
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY = "";
    process.env.GEMINI_API_KEY = "";

    expect(getOpenAIModel()).toBe("llama-3.3-70b-versatile");
  });

  it("returns gemini model when GEMINI_API_KEY is set", () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    process.env.GEMINI_API_KEY = "test";

    expect(getOpenAIModel()).toBe("gemini-2.5-flash");
  });

  it("returns openai model as fallback", () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "test";

    expect(getOpenAIModel()).toBe("gpt-5.4-mini");
  });
});
