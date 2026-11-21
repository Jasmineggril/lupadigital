/**
 * Elegibilidade sem falsos impedimentos. Perfil base: MESTRADO, vínculo efetivo, UnDF.
 * Casos reproduzidos do relato + os pedidos (alternativa, composto, dispensa, desejável,
 * coordenador, perfil incompleto, ambíguo). Nenhum impedimento só pela palavra.
 */
import { describe, expect, it } from "vitest";
import { evaluateRequirement, computeRecommendation } from "../matching";
import { emptyProfile, type Opportunity, type TeacherProfile } from "../types";

const URL = "https://www.fap.df.gov.br/edital-ficticio";
const mestre = (over: Partial<TeacherProfile> = {}): TeacherProfile => ({ ...emptyProfile("u"), declared_degree: "mestrado", declared_bond: "efetivo", institution: "UnDF", ...over });
const ev = (t: string, p = mestre()) => evaluateRequirement(t, URL, p)!;

describe("casos reproduzidos (antes: nao_atendida)", () => {
  it("“mestrado ou doutorado” → atendida para mestre", () => {
    const c = ev("Podem participar candidatos com mestrado ou doutorado.");
    expect(c.state).toBe("atendida");
    expect(c.eliminatory).toBe(false);
    expect(c.evidence).toContain("mestrado ou doutorado");
  });
  it("“não é necessário possuir doutorado” → não é impedimento", () => {
    const c = ev("Não é necessário possuir doutorado para participar.");
    expect(c.state).not.toBe("nao_atendida");
    expect(c.nature).toBe("descritivo");
  });
});

describe("cenários pedidos", () => {
  it("doutorado E vínculo: avalia cada condição; mestre não atende a titulação", () => {
    const c = ev("O proponente deverá possuir título de doutor e vínculo efetivo com instituição sediada no Distrito Federal.");
    expect(c.parts?.map((x) => x.condicao)).toEqual(expect.arrayContaining(["titulação mínima: doutorado", "vínculo institucional", "instituição no DF"]));
    expect(c.parts?.find((x) => x.condicao === "vínculo institucional")?.state).toBe("atendida");
    expect(c.state).toBe("nao_atendida");
    expect(c.eliminatory).toBe(true);
  });
  it("doutor com vínculo atende o composto", () => {
    expect(ev("O proponente deverá possuir título de doutor e vínculo efetivo com instituição sediada no Distrito Federal.", mestre({ declared_degree: "doutorado" })).state).toBe("atendida");
  });
  it("doutorado dispensado", () => {
    expect(ev("Fica dispensada a exigência de doutorado para jovens pesquisadores.").eliminatory).toBe(false);
  });
  it("titulação desejável não é eliminatória", () => {
    const c = ev("Será valorizado o título de doutor.");
    expect(c.nature).toBe("desejavel");
    expect(c.eliminatory).toBe(false);
    expect(c.state).not.toBe("nao_atendida");
  });
  it("exigência só do coordenador: não impede quem colabora", () => {
    const c = ev("O coordenador do projeto deverá possuir título de doutor.", mestre({ collaboration_role: "colaborar" }));
    expect(c.state).toBe("pendente_comprovacao");
    expect(c.eliminatory).toBe(false);
    expect(c.reason).toContain("Vale para quem coordena");
    // quem quer coordenar e não tem doutorado: aí sim é impedimento
    expect(ev("O coordenador do projeto deverá possuir título de doutor.", mestre({ collaboration_role: "coordenar" })).eliminatory).toBe(true);
  });
  it("perfil incompleto → pendente, nunca impedimento", () => {
    const c = ev("O proponente deverá possuir título de doutor.", { ...emptyProfile("u") });
    expect(c.state).toBe("pendente_comprovacao");
    expect(c.eliminatory).toBe(false);
  });
  it("condição ambígua → pendente de conferência", () => {
    expect(ev("Serão aceitos mestres e doutores conforme o anexo II.").state).toBe("pendente_comprovacao");
    expect(ev("Requisito: doutorado ou vínculo efetivo com a instituição.").state).toBe("pendente_comprovacao");
  });
  it("palavra solta não vira exigência", () => {
    for (const t of ["Edital de bolsas de mestrado em ciência de dados.", "O programa apoia a formação de doutores no DF.", "Haverá vínculo com a rede de pesquisa."]) {
      const c = evaluateRequirement(t, URL, mestre());
      expect(c?.state ?? "sem avaliação", t).not.toBe("nao_atendida");
    }
  });
  it("mínimo com “no mínimo mestrado” atende mestre; exigência clara de doutorado não", () => {
    expect(ev("Exige-se titulação mínima de mestrado.").state).toBe("atendida");
    expect(ev("Somente doutores poderão submeter propostas.").state).toBe("nao_atendida");
  });
});

describe("recomendação", () => {
  it("impedimento só com requisito obrigatório e aplicável", () => {
    const o = {
      id: "o", source_id: "fapdf", canonical_url: URL, edital_number: null, title: "Edital fictício", status: "aberta",
      fields: { elegibilidade: [{ value: "x", evidence: "Podem participar candidatos com mestrado ou doutorado.", source_url: URL }], requisitos: [{ value: "y", evidence: "Será valorizado o título de doutor.", source_url: URL }] },
      missing_fields: [], content_hash: "h", version: 1, review_status: "revisado", reviewed_by: null, reviewed_at: null,
      first_seen_at: "", last_seen_at: "", captured_at: "", documents: [], events: [],
    } as unknown as Opportunity;
    expect(computeRecommendation(mestre({ areas: ["dados"] }), o).eligibility.overall).not.toBe("impedimento");
  });
});
