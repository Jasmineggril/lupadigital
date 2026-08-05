import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {},
  getOpenAIModel: () => "",
  createWithFallback: async () => {
    throw new Error("not used in this test");
  },
  getVisionClients: vi.fn(() => []),
}));

import { getVisionClients as mockedGetVisionClients } from "@workspace/integrations-openai-ai-server";
import { ocrPdf } from "../aiService";

const getVisionClientsMock = vi.mocked(mockedGetVisionClients);

function providerError(message: string, status: number): Error {
  const err = new Error(message);
  (err as any).status = status;
  (err as any).cause = { status, headers: {}, body: {} };
  return err;
}

function completionClient(content: string) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({ choices: [{ message: { content } }] })),
      },
    },
  };
}

describe("ocrPdf — fallback entre provedores de visão", () => {
  beforeEach(() => {
    getVisionClientsMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lança OCR_INDISPONIVEL quando nenhum provedor de visão está configurado", async () => {
    getVisionClientsMock.mockReturnValue([]);
    await expect(ocrPdf(["aW1n"] as string[])).rejects.toThrow(/OCR_INDISPONIVEL/);
  });

  it("faz fallback do OpenAI (429/sem cota) para o Gemini e retorna o texto", async () => {
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw providerError("429 Too Many Requests: quota exceeded", 429);
          }),
        },
      },
    };
    const geminiClient = completionClient("TEXTO_EXTRAIDO_GEMINI");
    getVisionClientsMock.mockReturnValue([
      { client: openaiClient, provider: "openai", model: "gpt-4o" },
      { client: geminiClient, provider: "gemini", model: "gemini-2.5-flash" },
    ] as any);

    const result = await ocrPdf(["aW1nMQ==", "aW1nMg=="] as string[]);

    expect(openaiClient.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(geminiClient.chat.completions.create).toHaveBeenCalled();
    expect(result).toBe("TEXTO_EXTRAIDO_GEMINI");
  });

  it("propaga o erro do provedor quando todos falham com erro de provedor (429)", async () => {
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw providerError("429 Too Many Requests: quota exceeded", 429);
          }),
        },
      },
    };
    getVisionClientsMock.mockReturnValue([
      { client: openaiClient, provider: "openai", model: "gpt-4o" },
    ] as any);

    await expect(ocrPdf(["aW1n"] as string[])).rejects.toThrow(/429/);
  });

  it("não tenta o próximo provedor quando o erro não é do provedor (ex.: conteúdo)", async () => {
    const openaiClient = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw providerError("422 invalid_response: content filtered", 422);
          }),
        },
      },
    };
    const geminiClient = completionClient("NUNCA_DEVE_SER_CHAMADO");
    getVisionClientsMock.mockReturnValue([
      { client: openaiClient, provider: "openai", model: "gpt-4o" },
      { client: geminiClient, provider: "gemini", model: "gemini-2.5-flash" },
    ] as any);

    await expect(ocrPdf(["aW1n"] as string[])).rejects.toThrow(/OCR error/);
    expect(geminiClient.chat.completions.create).not.toHaveBeenCalled();
  });

  it("usa lote de 8 imagens por chamada e concatena as páginas", async () => {
    const geminiClient = {
      chat: {
        completions: {
          create: vi.fn(async () => ({ choices: [{ message: { content: "PAG" } }] })),
        },
      },
    };
    getVisionClientsMock.mockReturnValue([
      { client: geminiClient, provider: "gemini", model: "gemini-2.5-flash" },
    ] as any);

    const pages = Array.from({ length: 18 }, (_, i) => `img-${i}`);
    const result = await ocrPdf(pages);

    expect(geminiClient.chat.completions.create).toHaveBeenCalledTimes(3);
    expect(result).toBe("PAG\n\nPAG\n\nPAG");
  });
});
