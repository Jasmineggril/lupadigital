import { describe, expect, it } from "vitest";
import { dueSources } from "../integrations/cron";
import type { CollectionRun, OpportunitySource } from "../types";

const src = (over: Partial<OpportunitySource> = {}) => ({ id: "fapdf", enabled: true, frequency_minutes: 1440, base_url: "https://x" } as OpportunitySource & typeof over);
const run = (startedMinAgo: number, status: CollectionRun["status"], now: Date): CollectionRun => ({
  id: `r${startedMinAgo}`,
  source_id: "fapdf",
  trigger: "manual",
  triggered_by: null,
  status,
  started_at: new Date(now.getTime() - startedMinAgo * 60_000).toISOString(),
  finished_at: null,
  stats: {},
  errors: [],
});
const now = new Date("2026-11-22T09:17:00Z");

describe("dueSources (quando coletar)", () => {
  it("sem coleta anterior → coleta", () => {
    expect(dueSources([src()], [], now)[0].action).toBe("coletar");
  });
  it("fonte desativada → pula", () => {
    expect(dueSources([{ ...src(), enabled: false }], [], now)[0].action).toBe("pular");
  });
  it("coleta de ontem no mesmo horário (agendador atrasou/adiantou 5 min) → coleta", () => {
    expect(dueSources([src()], [run(1440 - 5, "succeeded", now)], now)[0].action).toBe("coletar");
  });
  it("coleta manual há 2 h → pula (respeita a frequência)", () => {
    expect(dueSources([src()], [run(120, "succeeded", now)], now)[0].action).toBe("pular");
  });
  it("falha recente não conta: tenta de novo", () => {
    expect(dueSources([src()], [run(60, "failed", now), run(2000, "succeeded", now)], now)[0].action).toBe("coletar");
  });
  it("execução em andamento há 5 min → pula; presa há 2 h → coleta (e a rota a encerra)", () => {
    expect(dueSources([src()], [run(5, "running", now)], now)[0].action).toBe("pular");
    const d = dueSources([src()], [run(120, "running", now)], now)[0];
    expect(d.action).toBe("coletar");
    expect(d.motivo).toMatch(/presa/);
  });
});
