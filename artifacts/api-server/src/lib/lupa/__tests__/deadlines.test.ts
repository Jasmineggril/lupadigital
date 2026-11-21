/** Prazos oficiais × tarefas pessoais — regra única (deadlines.ts) usada no coletor, catálogo e participação. */
import { describe, expect, it } from "vitest";
import { officialSubmissionDeadline, parseDateMentions, validDate, formatDeadline } from "../deadlines";
import { blankParticipation, deterministicCheck } from "../participations";
import { extractFields, inferStatus } from "../collector/parse";

const today = "2026-11-21";
const item = (rotulo: string, data: string | null, origem: "edital" | "usuario" = "edital", evidencia: string | null = null) => ({ id: rotulo, rotulo, data, origem, evidencia });

describe("caso reproduzido", () => {
  it("prazo oficial vencido (10/11) com tarefa pessoal futura (20/12): o oficial manda", () => {
    const p = blankParticipation("u", "Edital X", "edital_pesquisa");
    p.prazos = [item("inscrições", "2026-11-10", "edital", "Inscrições até 10/11/2026."), item("envio pessoal", "2026-12-20", "usuario")];
    const c = deterministicCheck(p, null, today);
    const prazo = c.find((x) => x.id === "prazo")!;
    expect(prazo.nivel).toBe("impeditivo");
    expect(prazo.mensagem).toContain("10/11/2026");
    expect(prazo.mensagem).not.toContain("20/12");
    expect(c.find((x) => x.id === "tarefas")?.mensagem).toContain("envio pessoal");
  });
});

describe("cenários", () => {
  it("prorrogação oficial substitui a data original", () => {
    const d = officialSubmissionDeadline([item("inscrições", "2026-11-10", "edital", "Inscrições até 10/11/2026."), item("inscrições (prorrogação)", "2026-12-05", "edital", "Prazo de inscrições prorrogado até 05/12/2026.")], today)!;
    expect(d.iso).toBe("2026-12-05");
    expect(d.prorrogado).toBe(true);
    expect(d.situacao).toBe("aberta");
  });
  it("múltiplas fases: vale a próxima em aberto, não a maior", () => {
    const d = officialSubmissionDeadline([item("inscrições", "2026-11-10"), item("inscrições", "2026-12-15"), item("inscrições", "2027-03-01")], today)!;
    expect(d.iso).toBe("2026-12-15");
    expect(d.fases).toHaveLength(3);
  });
  it("recurso depois da inscrição não é prazo de inscrição", () => {
    const m = parseDateMentions("Inscrições até 10/11/2026 e prazo para recurso até 30/11/2026.");
    expect(m.map((x) => [x.kind, x.iso])).toEqual([["inscricao", "2026-11-10"], ["recurso", "2026-11-30"]]);
    const d = officialSubmissionDeadline(m.map((x) => ({ rotulo: x.rotulo, data: x.iso, origem: "edital" as const, evidencia: null })), today)!;
    expect(d.iso).toBe("2026-11-10");
    expect(d.situacao).toBe("encerrada");
  });
  it("data inválida e bissexto", () => {
    expect(validDate(2027, 2, 31)).toBe(false);
    expect(validDate(2027, 2, 29)).toBe(false);
    expect(validDate(2028, 2, 29)).toBe(true);
    expect(validDate(2026, 13, 1)).toBe(false);
    expect(parseDateMentions("Inscrições até 31/02/2027.")).toEqual([]);
  });
  it("prazo sem horário não ganha horário; com horário e fuso, preserva", () => {
    const [sem] = parseDateMentions("Inscrições até 10/11/2026.");
    expect(sem.hora).toBeNull();
    expect(formatDeadline(sem)).toBe("10/11/2026");
    const [com] = parseDateMentions("As propostas serão recebidas até 10/11/2026, às 18h (horário de Brasília).");
    expect(com.hora).toBe("18:00");
    expect(com.fuso).toBe("horário de Brasília");
    expect(formatDeadline(com)).toBe("10/11/2026, até 18:00 (horário de Brasília)");
  });
  it("informação desconhecida: sem data de inscrição → desconhecido (não 'ok')", () => {
    const p = blankParticipation("u", "Edital Y");
    p.prazos = [item("resultado", "2027-01-10"), item("minha revisão", "2026-12-01", "usuario")];
    expect(deterministicCheck(p, null, today).find((x) => x.id === "prazo")?.nivel).toBe("desconhecido");
  });
  it("intervalo: a primeira data é a abertura", () => {
    const m = parseDateMentions("Inscrições de 01/02/2027 a 30/06/2027.");
    expect(m.map((x) => x.kind)).toEqual(["inicio", "inscricao"]);
  });
  it("catálogo/situação usam a mesma regra (tarefa pessoal não existe lá; recurso não reabre)", () => {
    const { fields } = extractFields({ url: "https://x", title: "Edital", text: "Inscrições até 10/11/2026. Prazo para recurso até 30/11/2026." } as never);
    expect(inferStatus(fields, "", new Date("2026-11-21T12:00:00Z"))).toBe("encerrada");
  });
});
