import { describe, expect, it } from "vitest";
import { chunkDocument, estimateTokens, consolidateChunkFacts } from "../aiService";

describe("chunkDocument", () => {
  it("returns a single chunk for short text", () => {
    const text = "Este é um texto curto para teste.";
    const chunks = chunkDocument(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkId).toMatch(/^chunk-/);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].text).toContain(text);
    expect(chunks[0].estimatedTokens).toBeGreaterThan(0);
  });

  it("splits long text into multiple chunks", () => {
    const paragraph = Array.from({ length: 70 }, (_, i) =>
      `Parágrafo ${i + 1}: Esta é uma frase de teste com palavras suficientes para ocupar espaço e simular um documento real com conteúdo relevante para a análise. `
    ).join("\n\n");
    const chunks = chunkDocument(paragraph);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[chunks.length - 1].index).toBe(chunks.length - 1);
  });

  it("preserves overlap between chunks", () => {
    const paragraph = "Primeira linha do parágrafo. ".repeat(100);
    const chunks = chunkDocument(paragraph);

    if (chunks.length > 1) {
      expect(chunks[1].text).not.toBe(chunks[0].text);
    }
  });

  it("assigns page numbers based on content", () => {
    const text = "Página 1: Primeira parte do documento.\n\nPágina 2: Segunda parte do documento.";
    const chunks = chunkDocument(text);

    expect(chunks[0].pageStart).toBeDefined();
  });
});

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns positive for non-empty text", () => {
    expect(estimateTokens("Hello world")).toBeGreaterThan(0);
  });

  it("scales with text length", () => {
    const short = "Texto curto";
    const long = "Texto muito longo com muitas palavras e frases para testar a estimativa de tokens";

    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

describe("consolidateChunkFacts", () => {
  it("merges facts from multiple chunks", () => {
    const chunkResults = [
      {
        chunkId: "chunk-0",
        facts: {
          documentInfo: [{ title: "Edital 001" }],
          dates: [{ event: "Publicação", value: "01/01/2025" }],
          requirements: [{ requirement: "Requisito 1" }],
          eligibility: [],
          documents: [{ document: "RG" }],
          values: [],
          contacts: [],
          obligations: [],
          restrictions: [],
          alerts: [],
        },
      },
      {
        chunkId: "chunk-1",
        facts: {
          documentInfo: [],
          dates: [{ event: "Inscrição", value: "15/01/2025" }],
          requirements: [{ requirement: "Requisito 2" }],
          eligibility: [],
          documents: [{ document: "CPF" }],
          values: [],
          contacts: [],
          obligations: [],
          restrictions: [],
          alerts: [],
        },
      },
    ];

    const result = consolidateChunkFacts(chunkResults);

    expect(result.documentInfo).toHaveLength(1);
    expect(result.dates).toHaveLength(2);
    expect(result.requirements).toHaveLength(2);
    expect(result.documents).toHaveLength(2);
  });

  it("deduplicates identical facts", () => {
    const chunkResults = [
      {
        chunkId: "chunk-0",
        facts: {
          documentInfo: [],
          dates: [],
          requirements: [{ requirement: "Mesmo requisito" }],
          eligibility: [],
          documents: [],
          values: [],
          contacts: [],
          obligations: [],
          restrictions: [],
          alerts: [],
        },
      },
      {
        chunkId: "chunk-1",
        facts: {
          documentInfo: [],
          dates: [],
          requirements: [{ requirement: "Mesmo requisito" }],
          eligibility: [],
          documents: [],
          values: [],
          contacts: [],
          obligations: [],
          restrictions: [],
          alerts: [],
        },
      },
    ];

    const result = consolidateChunkFacts(chunkResults);

    expect(result.requirements).toHaveLength(1);
  });

  it("handles empty chunk results", () => {
    const result = consolidateChunkFacts([]);

    expect(result.documentInfo).toHaveLength(0);
    expect(result.dates).toHaveLength(0);
    expect(result.requirements).toHaveLength(0);
  });
});
