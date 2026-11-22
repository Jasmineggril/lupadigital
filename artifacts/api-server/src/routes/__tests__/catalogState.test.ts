/** Catálogo vazio explica o motivo: nunca coletado, coletando, coleta falhou, coleta sem itens. */
import { describe, expect, it } from "vitest";
import { catalogCollectionState } from "../lupa";
import type { CollectionRun, Opportunity } from "../../lib/lupa/types";

const run = (status: CollectionRun["status"], started_at: string, errors: CollectionRun["errors"] = []): CollectionRun => ({
  id: started_at, source_id: "fapdf", trigger: "agendada", triggered_by: null, status, started_at, finished_at: status === "running" ? null : started_at, stats: {}, errors,
});
const opp = (review_status: Opportunity["review_status"]) => ({ review_status }) as Opportunity;

describe("catalogCollectionState", () => {
  it("sem execução → nunca coletado (não 'vazio' genérico)", () => {
    expect(catalogCollectionState([], [])).toMatchObject({ situacao: "nunca_coletado", ultima: null });
  });
  it("última execução falhou → motivo sem URL", () => {
    const s = catalogCollectionState([], [run("succeeded", "2026-11-20T09:17:00Z"), run("failed", "2026-11-21T09:17:00Z", [{ url: "https://www.fap.df.gov.br/editais/", message: "HTTP 404 em https://www.fap.df.gov.br/editais/" }])]);
    expect(s.situacao).toBe("coleta_falhou");
    expect(s.ultima?.motivo).toBe("HTTP 404 em [endereço]");
  });
  it("execução em andamento e execução concluída sem itens", () => {
    expect(catalogCollectionState([], [run("running", "2026-11-21T09:17:00Z")]).situacao).toBe("coletando");
    expect(catalogCollectionState([], [run("partial", "2026-11-21T09:17:00Z", [{ url: "x", message: "erro" }])])).toMatchObject({ situacao: "coleta_sem_itens", ultima: { erros: 1 } });
  });
  it("com itens: conta os que aguardam revisão", () => {
    expect(catalogCollectionState([opp("pendente"), opp("revisado")], [])).toMatchObject({ situacao: "com_itens", pendentes_revisao: 1 });
  });
});
