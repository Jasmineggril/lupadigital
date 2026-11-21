import { afterEach, describe, expect, it } from "vitest";
import { platformBudgetMs } from "../aiService";

afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.AI_REQUEST_BUDGET_MS;
});

describe("teto de tempo da análise (falha de produção: orçamento de 900 s numa função de 300 s)", () => {
  it("na Vercel não passa de 250 s (a função é cortada em 300 s)", () => {
    process.env.VERCEL = "1";
    expect(platformBudgetMs()).toBe(250_000);
    expect(platformBudgetMs()).toBeLessThan(300_000);
  });
  it("servidor próprio usa o teto maior; variável explícita vence", () => {
    expect(platformBudgetMs()).toBe(900_000);
    process.env.AI_REQUEST_BUDGET_MS = "120000";
    expect(platformBudgetMs()).toBe(120_000);
  });
});
