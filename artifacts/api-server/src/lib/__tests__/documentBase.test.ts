/**
 * Base documental comum: igual para todos os agentes, extraída do texto, com trecho.
 * Edital de teste FICTÍCIO (fixture-edital-ficticio.txt).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDocumentBase, documentHash, extractDates, normalizeEligibilityCriteria, splitConditions, verifyAgainstText } from "../documentBase";
import { emptyProfile } from "../lupa/types";

const TEXT = readFileSync(new URL("./fixture-edital-ficticio.txt", import.meta.url), "utf8");
const prof = (patch: Record<string, unknown>) => ({ ...emptyProfile("u1"), ...patch }) as ReturnType<typeof emptyProfile>;

describe("buildDocumentBase", () => {
  it("extrai datas com rótulo, valores, documentos e critérios — cada item com trecho literal", () => {
    const b = buildDocumentBase(TEXT);
    expect(b.datas.map((d) => [d.rotulo, d.iso])).toEqual([
      ["publicação", "2027-01-05"],
      ["inscrições", "2027-02-28"],
      ["resultado preliminar", "2027-04-15"],
      ["resultado final", "2027-04-30"],
    ]);
    for (const item of [...b.datas, ...b.valores, ...b.documentos, ...b.requisitos, ...b.criterios]) {
      expect(TEXT).toContain(item.evidencia);
    }
    expect(b.valores[0].evidencia).toMatch(/R\$ 120\.000,00/);
    expect(b.documentos.map((d) => d.texto).join(" ")).toMatch(/Anexo I.*Anexo II.*anuência.*Comprovante de vínculo/s);
    expect(b.criterios[0].evidencia).toMatch(/mérito científico/);
    expect(b.canal_inscricao[0].evidencia).toMatch(/sistema eletrônico/);
    expect(b.documento_hash).toBe(documentHash(TEXT));
    expect(b.elegibilidade_perfil).toBeNull(); // sem perfil docente → sem comparação
  });

  it("é a mesma para qualquer agente (depende só do texto e do perfil)", () => {
    expect(buildDocumentBase(TEXT)).toEqual(buildDocumentBase(TEXT));
  });

  it("documento sem datas nem valores: lista os ausentes, não inventa", () => {
    const b = buildDocumentBase("Chamada para apoio a eventos científicos no Distrito Federal. Mais informações em breve.");
    expect(b.datas).toEqual([]);
    expect(b.valores).toEqual([]);
    expect(b.ausentes).toEqual(expect.arrayContaining(["datas e prazos", "valores", "requisitos"]));
  });

  it("elegibilidade em 3 estados, avaliando cada condição da frase", () => {
    const b = buildDocumentBase(TEXT, prof({ declared_degree: "mestrado", declared_bond: "efetivo", institution: "UnDF", lattes_id: "1234567890123456" }));
    const states = b.elegibilidade_perfil!.map((e) => e.estado);
    expect(states).toContain("nao_atendido"); // doutorado × mestrado
    expect(states).toContain("atendido"); // vínculo efetivo, Lattes
    expect(states).toContain("pendente"); // vedação a servidores
    const doctor = b.elegibilidade_perfil!.find((e) => /doutor/.test(e.requisito))!;
    expect(doctor.estado).toBe("nao_atendido");
    expect(TEXT).toContain(doctor.evidencia);
    const bond = b.elegibilidade_perfil!.find((e) => /v[ií]nculo/.test(e.requisito))!;
    expect(bond.estado).toBe("atendido");
    expect(bond.motivo).toMatch(/comprovado/); // autodeclarado nunca vira comprovação
  });

  it("perfil sem titulação: requisito fica pendente, não 'não atendido'", () => {
    const b = buildDocumentBase(TEXT, prof({}));
    expect(b.elegibilidade_perfil!.find((e) => /doutor/.test(e.requisito))!.estado).toBe("pendente");
  });
});

describe("verifyAgainstText", () => {
  it("sinaliza datas e valores citados pela IA que não estão no documento", () => {
    const result = { resumo: "Inscrições até 28/02/2027, valor de R$ 120.000,00.", prazo: "31/03/2027", valor: "R$ 999.000,00", originalText: "31/12/1999" };
    const issues = verifyAgainstText(result, TEXT);
    expect(issues.map((i) => i.valor).sort()).toEqual(["31/03/2027", "R$ 999.000,00"].sort());
  });
  it("tudo consta no texto → nenhuma pendência", () => {
    expect(verifyAgainstText({ cronograma: ["05/01/2027", "R$ 1.200.000,00"] }, TEXT)).toEqual([]);
  });
});

describe("normalizeEligibilityCriteria", () => {
  it("separa 'não atende' de 'faltou dado'", () => {
    const out = normalizeEligibilityCriteria([
      { criterio: "Título de doutor", atende: false, observacao: "O usuário possui mestrado." },
      { criterio: "Vínculo", atende: false, observacao: "O documento enviado não apresenta esse dado." },
      { criterio: "Lattes", atende: true, observacao: "" },
    ]) as Array<{ estado: string }>;
    expect(out.map((c) => c.estado)).toEqual(["nao_atendido", "pendente", "atendido"]);
  });
});

describe("auxiliares", () => {
  it("divide condições ligadas por 'e'", () => {
    expect(splitConditions("pesquisadores com título de doutor e vínculo efetivo com instituição sediada no DF")).toHaveLength(2);
  });
  it("datas por extenso e intervalos", () => {
    const d = extractDates("As propostas serão recebidas até 30 de junho de 2026. Inscrições de 01/02/2026 a 15/03/2026.");
    expect(d.map((x) => x.iso)).toEqual(["2026-03-15", "2026-06-30"]);
  });
});
