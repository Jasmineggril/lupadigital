/** §4: obrigações e causas de desclassificação vêm do texto (trecho literal); ausência fica vazia, sem invenção. */
import { describe, expect, it } from "vitest";
import { buildDocumentBase } from "../documentBase";

const TEXT = `EDITAL FICTÍCIO 01/2027
3.1 O proponente deverá apresentar relatório final em até 60 dias após o término do projeto.
3.2 A prestação de contas seguirá as normas da Fundação.
4.1 Será desclassificada a proposta enviada fora do prazo ou sem os documentos obrigatórios.
4.2 Não serão aceitas propostas por e-mail.
5.1 Critérios de avaliação: mérito científico (peso 4) e viabilidade (peso 3).`;

describe("base documental — regras do edital", () => {
  it("extrai obrigações, desclassificação e critérios com o trecho do documento", () => {
    const b = buildDocumentBase(TEXT);
    expect(b.obrigacoes?.map((x) => x.evidencia).join(" ")).toMatch(/relatório final/);
    expect(b.obrigacoes?.map((x) => x.evidencia).join(" ")).toMatch(/prestação de contas/);
    expect(b.desclassificacao?.map((x) => x.evidencia).join(" ")).toMatch(/desclassificada/);
    expect(b.desclassificacao?.map((x) => x.evidencia).join(" ")).toMatch(/Não serão aceitas/);
    expect(b.criterios.length).toBeGreaterThan(0);
    for (const x of [...(b.obrigacoes ?? []), ...(b.desclassificacao ?? [])]) expect(TEXT).toContain(x.evidencia.slice(0, 30));
  });
  it("sem cláusulas no texto: listas vazias (nada inventado)", () => {
    const b = buildDocumentBase("Chamada fictícia. Inscrições até 10/10/2027 pelo site.");
    expect(b.obrigacoes).toEqual([]);
    expect(b.desclassificacao).toEqual([]);
  });
});
