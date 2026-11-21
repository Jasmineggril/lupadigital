/** Perfil progressivo nas recomendações: efeito verificável e explicado, nunca eliminatório. */
import { describe, expect, it } from "vitest";
import { computeRecommendation, inferOpportunityTypes, RECOMMENDATION_RULE_VERSION } from "../matching";
import { emptyProfile, type Opportunity, type TeacherProfile } from "../types";

const URL = "https://x";
const opp = (title: string, objeto: string, eleg: string[] = []): Opportunity =>
  ({
    id: "o", source_id: "fapdf", canonical_url: URL, edital_number: null, title, status: "aberta",
    fields: { objeto: { value: objeto, evidence: objeto, source_url: URL }, elegibilidade: eleg.map((e) => ({ value: e, evidence: e, source_url: URL })) },
    missing_fields: [], content_hash: "h", version: 1, review_status: "revisado", reviewed_by: null, reviewed_at: null, first_seen_at: "", last_seen_at: "", captured_at: "", documents: [], events: [],
  }) as unknown as Opportunity;
const prof = (o: Partial<TeacherProfile> = {}): TeacherProfile => ({ ...emptyProfile("u"), areas: ["dados abertos"], ...o });
const HACK = opp("Hackathon fictício de dados abertos", "Maratona de programação presencial em Brasília com dados abertos do Distrito Federal.", ["Podem participar estudantes e profissionais."]);

describe("tipos e objetivos", () => {
  it("hackathon e concurso são classificados", () => {
    expect(inferOpportunityTypes(HACK)).toContain("hackathon");
    expect(inferOpportunityTypes(opp("Concurso público fictício", "Concurso público de provas e títulos."))).toContain("concurso");
  });
  it("marcar o objetivo 'hackathons' muda o interesse e explica o motivo", () => {
    const antes = computeRecommendation(prof(), HACK);
    const depois = computeRecommendation(prof({ objetivos: ["hackathons"] }), HACK);
    expect(antes.interest.opportunity_type).toBe("nao_informado");
    expect(depois.interest.opportunity_type).toBe("corresponde");
    expect(depois.interest.preferences?.find((p) => p.campo === "objetivos")?.motivo).toContain("hackathon");
    expect(depois.rule_version).toBe(RECOMMENDATION_RULE_VERSION);
  });
});

describe("preferências nunca eliminam", () => {
  it("modalidade divergente aparece explicada e não vira impedimento", () => {
    const r = computeRecommendation(prof({ modalidade: "remoto", localizacao: "São Paulo/SP" }), HACK);
    const m = r.interest.preferences?.find((p) => p.campo === "modalidade");
    expect(m).toMatchObject({ situacao: "diverge" });
    expect(m?.motivo).toContain("presencial");
    expect(r.interest.preferences?.find((p) => p.campo === "localizacao")?.situacao).toBe("diverge");
    expect(r.eligibility.overall).not.toBe("impedimento");
    expect(r.summary).toContain("não impede");
  });
  it("edital sem a informação → 'edital_nao_informa', não presume", () => {
    const r = computeRecommendation(prof({ modalidade: "presencial" }), opp("Edital fictício", "Apoio a projetos de pesquisa em dados abertos."));
    expect(r.interest.preferences?.find((p) => p.campo === "modalidade")?.situacao).toBe("edital_nao_informa");
  });
});

describe("pontuação", () => {
  it("não satura com poucos termos num perfil grande", () => {
    const big = prof({ areas: ["dados abertos", "saúde", "educação", "clima", "energia"], research_topics: ["agricultura", "mobilidade", "segurança"] });
    const r = computeRecommendation(big, HACK);
    expect(r.thematic.matches.length).toBe(1);
    expect(r.thematic.score).toBeLessThan(40);
  });
});
