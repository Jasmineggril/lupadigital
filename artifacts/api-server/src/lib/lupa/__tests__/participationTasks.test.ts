/** Acompanhamento: tarefas com responsável e envio/resultado só com informação da pessoa. */
import { describe, expect, it } from "vitest";
import { applyUpdate, blankParticipation, ParticipationRuleError, UpdateParticipationSchema } from "../participations";

const base = () => blankParticipation("u1", "Hackathon fictício", "hackathon", "2026-11-22T10:00:00.000Z");
const upd = (p: ReturnType<typeof base>, input: Record<string, unknown>) =>
  applyUpdate(p, UpdateParticipationSchema.parse({ expected_version: p.version, ...input }), "2026-11-23T10:00:00.000Z");

describe("tarefas e responsáveis", () => {
  it("guarda tarefa com responsável e meta pessoal; ids estáveis", () => {
    const p1 = upd(base(), { tarefas: [{ titulo: "Gravar vídeo pitch", responsavel: "Ana", prazo: "2026-12-01", feito: false }] });
    expect(p1.tarefas).toHaveLength(1);
    const id = p1.tarefas![0].id;
    const p2 = upd(p1, { tarefas: [{ id, titulo: "Gravar vídeo pitch", responsavel: "Ana", prazo: "2026-12-01", feito: true }] });
    expect(p2.tarefas![0]).toMatchObject({ id, feito: true, responsavel: "Ana" });
  });
  it("prazo de tarefa não vira prazo oficial", () => {
    const p1 = upd(base(), { tarefas: [{ titulo: "Revisar texto", prazo: "2026-12-01", feito: false }] });
    expect(p1.prazos).toHaveLength(0);
  });
});

describe("envio e resultado (informados pela pessoa)", () => {
  it("marcar 'enviada' sem data de envio é recusado", () => {
    expect(() => upd(base(), { situacao: "enviada" })).toThrow(ParticipationRuleError);
  });
  it("informar a data de envio marca como enviada e registra quando foi informado", () => {
    const p1 = upd(base(), { submissao: { enviada_em: "2026-11-30", protocolo: "ABC-123" } });
    expect(p1.situacao).toBe("enviada");
    expect(p1.submissao).toMatchObject({ enviada_em: "2026-11-30", protocolo: "ABC-123", resultado: null, informado_em: "2026-11-23T10:00:00.000Z" });
  });
  it("resultado aprovado sem data de envio é recusado; com envio, aceito", () => {
    expect(() => upd(base(), { submissao: { resultado: "aprovada" } })).toThrow(ParticipationRuleError);
    const p1 = upd(base(), { submissao: { enviada_em: "2026-11-30" } });
    const p2 = upd(p1, { submissao: { resultado: "aprovada", resultado_em: "2027-01-10" } });
    expect(p2.submissao).toMatchObject({ enviada_em: "2026-11-30", resultado: "aprovada" });
  });
  it("apagar o registro de envio (null)", () => {
    const p1 = upd(base(), { submissao: { enviada_em: "2026-11-30" } });
    expect(upd(p1, { submissao: null }).submissao).toBeNull();
  });
});
