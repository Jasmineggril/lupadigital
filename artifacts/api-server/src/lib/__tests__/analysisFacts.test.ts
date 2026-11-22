/**
 * Regressões das três falhas reproduzidas em produção em 22/11/2026 (edital fictício de teste):
 * exigência inventada, prazo contraditório e campos ausentes incoerentes.
 * As respostas da IA aqui são simuladas: nenhum provedor externo é chamado.
 */
import { describe, expect, it } from "vitest";
import { applyAnalysisFacts, factIssues, groundItem, isPlaceholder, resolveDeadline } from "../analysisFacts";
import { buildDocumentBase } from "../documentBase";

const TODAY = "2026-11-22";
const EDITAL = [
  "EDITAL Nº 07/2026 — PROGRAMA DE BOLSAS DE INICIAÇÃO CIENTÍFICA (TEXTO FICTÍCIO DE TESTE)",
  "1. Objeto: seleção de estudantes de graduação para bolsas de iniciação científica.",
  "2. Inscrições: de 01/12/2026 até 20/12/2026, pelo sistema eletrônico da instituição.",
  "3. Requisitos: estar regularmente matriculado em curso de graduação.",
  "4. Documentos: comprovante de matrícula e proposta de até 3 páginas.",
  "5. Valor da bolsa: R$ 700,00 mensais.",
  "6. Resultado: divulgado em 15/01/2027.",
].join("\n");

function run(ai: Record<string, unknown>, text = EDITAL) {
  return applyAnalysisFacts(ai, text, buildDocumentBase(text), TODAY);
}

describe("exigências: só o que o edital diz", () => {
  // Saída da IA observada/possível: qualificadores que o texto não traz
  const ai = {
    interpretation: { deadlines: "20/12/2026" },
    checklist: {
      items: [
        { doc: "Comprovante de matrícula com foto e assinatura", obrigatorio: true, observacao: "Como obter ou preparar — sem adicionar exigências ausentes no edital" },
        { doc: "Proposta (até 3 páginas)", obrigatorio: true, observacao: "Entregar cópia autenticada em cartório" },
        { doc: "RG e CPF", obrigatorio: true, observacao: "" },
      ],
    },
    documentosExigidos: { items: ["Comprovante de matrícula com foto e assinatura", "Proposta (até 3 páginas)"] },
  };

  it("não produz foto, assinatura nem autenticação como exigência", () => {
    const r = run(ai);
    const items = (r.checklist as { items: Array<Record<string, unknown>> }).items;
    const labels = items.map((i) => String(i.doc).toLowerCase()).join(" | ");
    expect(labels).not.toMatch(/foto|assinatura|autentica/);
    expect(items[0]).toMatchObject({ doc: "Comprovante de matrícula", origem: "edital", conferir: true, nao_confirmado: ["foto", "assinatura"] });
    expect(items[0].evidencia).toBe("4. Documentos: comprovante de matrícula e proposta de até 3 páginas.");
    expect(items[0].doc_ia).toBe("Comprovante de matrícula com foto e assinatura");
    // A lista simples também troca pelo nome do edital
    expect((r.documentosExigidos as { items: string[] }).items[0]).toBe("Comprovante de matrícula");
  });

  it("descarta a observação copiada do modelo e trata dica como orientação, não exigência", () => {
    const items = (run(ai).checklist as { items: Array<Record<string, unknown>> }).items;
    expect(items[0].observacao).toBe("");
    expect(items[1]).toMatchObject({ observacao_tipo: "orientacao", conferir: true });
    expect(items[1].nao_confirmado).toEqual(expect.arrayContaining(["autenticação", "cartório"]));
  });

  it("item sem trecho no edital fica como desconhecido, sem obrigatoriedade afirmada", () => {
    const items = (run(ai).checklist as { items: Array<Record<string, unknown>> }).items;
    expect(items[2]).toMatchObject({ origem: "desconhecido", evidencia: null, obrigatorio: false, conferir: true });
  });

  it("a evidência é sempre texto literal do documento", () => {
    const r = run(ai);
    for (const e of r.fatos.exigencias) if (e.evidencia) expect(EDITAL).toContain(e.evidencia);
  });

  it("avisa de qualificadores em qualquer parte da análise", () => {
    const r = run({ ...ai, interpretation: { summary: "Leve documento com foto e assinatura reconhecida." } });
    expect(r.fatos.qualificadores_sem_respaldo).toEqual(expect.arrayContaining(["foto", "assinatura"]));
    expect(factIssues(r.fatos).some((i) => i.tipo === "exigencia" && /foto/.test(i.mensagem))).toBe(true);
  });

  it("qualificador que o edital traz continua valendo", () => {
    const text = "Documentos: cópia do RG com foto e declaração assinada pelo orientador.";
    const g = groundItem("Cópia do RG com foto", text);
    expect(g).toMatchObject({ origem: "edital", nao_confirmado: [], conferir: false });
  });

  it("documento opcional não vira obrigatório", () => {
    const text = "Documentos obrigatórios: RG e CPF.\nCarta de recomendação (opcional).";
    const r = run({ checklist: { items: [{ doc: "Carta de recomendação", obrigatorio: true }] } }, text);
    const item = (r.checklist as { items: Array<Record<string, unknown>> }).items[0];
    expect(item).toMatchObject({ condicao: "opcional", obrigatorio: false, origem: "edital" });
  });

  it("alternativas ficam juntas", () => {
    const g = groundItem("Contracheque", "Comprovante de vínculo: contracheque ou declaração da instituição.");
    expect(g.condicao).toBe("alternativa");
    expect(g.texto.toLowerCase()).toContain("ou declaração");
  });

  it("dispensa é sinalizada", () => {
    const g = groundItem("Carta de anuência", "Docentes do quadro efetivo estão dispensados da apresentação da carta de anuência.");
    expect(g).toMatchObject({ origem: "edital", condicao: "com_dispensa" });
  });
});

describe("prazo único", () => {
  it("substitui 'Prazo não informado' pela data do documento, com trecho", () => {
    const r = run({ interpretation: { deadlines: "Prazo não informado." } });
    const i = r.interpretation as Record<string, unknown>;
    expect(i.deadlines).toBe("Inscrições até 20/12/2026");
    expect(i.deadlines_ia).toBe("Prazo não informado.");
    expect(r.fatos.prazo_inscricao).toMatchObject({ iso: "2026-12-20", origem: "edital" });
    expect(EDITAL).toContain(r.fatos.prazo_inscricao!.evidencia);
    expect(r.fatos.conflitos).toEqual([]);
  });

  it("divergência entre IA e documento é registrada, não escolhida em silêncio", () => {
    const r = run({ interpretation: { deadlines: "15/12/2026" } });
    expect((r.interpretation as Record<string, unknown>).deadlines).toBe("15/12/2026");
    expect(r.fatos.conflitos[0]).toMatchObject({ campo: "prazo de inscrição", documento: "20/12/2026", ia: "15/12/2026" });
    expect(factIssues(r.fatos).some((i) => i.tipo === "prazo")).toBe(true);
  });

  it("sem prazo no documento, nada é inventado", () => {
    const text = "Objeto: apoio a eventos científicos. Valor: R$ 5.000,00 por proposta.";
    const r = run({ interpretation: { deadlines: "Prazo não informado." } }, text);
    expect(r.fatos.prazo_inscricao).toBeNull();
    expect((r.interpretation as Record<string, unknown>).deadlines).toBe("Prazo não informado.");
  });

  it("prorrogação de nova versão do edital prevalece", () => {
    const v2 = `${EDITAL}\n7. Retificação: as inscrições ficam prorrogadas até 10/01/2027.`;
    expect(resolveDeadline(EDITAL, TODAY)?.iso).toBe("2026-12-20");
    const d = resolveDeadline(v2, TODAY);
    expect(d).toMatchObject({ iso: "2027-01-10", prorrogado: true });
    expect(buildDocumentBase(v2).documento_hash).not.toBe(buildDocumentBase(EDITAL).documento_hash);
  });

  it("reconhece marcadores de ausência", () => {
    for (const s of ["Prazo não informado.", "Não foi informado", "A confirmar", "", "—"]) expect(isPlaceholder(s)).toBe(true);
    expect(isPlaceholder("20/12/2026")).toBe(false);
  });
});

describe("campos ausentes conciliados", () => {
  it("lista explícita de documentos não aparece como ausente", () => {
    const r = run({ interpretation: {} });
    expect(r.base.ausentes).not.toContain("documentos exigidos");
    expect(r.base.ausentes).not.toContain("público elegível");
    expect(r.fatos.campos.find((c) => c.campo === "documentos")).toMatchObject({ estado: "encontrado", fonte: "documento" });
    expect(r.fatos.campos.find((c) => c.campo === "elegibilidade")?.estado).toBe("parcial");
    expect(r.base.ausentes).toEqual(["áreas", "critérios de avaliação"]);
  });

  it("extração parcial: lista da IA sem respaldo marca o campo como parcial", () => {
    const r = run({ checklist: { items: [{ doc: "Comprovante de matrícula" }, { doc: "Histórico escolar" }] } });
    expect(r.fatos.campos.find((c) => c.campo === "documentos")?.estado).toBe("parcial");
  });

  it("o que só a IA afirma fica incerto (e continua na lista de pendências)", () => {
    const text = "Objeto: apoio a eventos científicos. Valor: R$ 5.000,00 por proposta.";
    const r = run({ interpretation: { targetAudience: "Docentes doutores" }, checklist: { items: [{ doc: "Currículo Lattes" }] } }, text);
    expect(r.fatos.campos.find((c) => c.campo === "elegibilidade")).toMatchObject({ estado: "incerto", fonte: "ia" });
    expect(r.fatos.campos.find((c) => c.campo === "documentos")).toMatchObject({ estado: "incerto", fonte: "ia" });
    expect(r.base.ausentes).toEqual(expect.arrayContaining(["público elegível", "documentos exigidos"]));
  });

  it("troca de agente: mesmos fatos do documento", () => {
    const a = run({ interpretation: { deadlines: "Prazo não informado." } });
    const b = run({ interpretation: { deadlines: "01/12/2026 | 20/12/2026 | 15/01/2027" } });
    expect(a.fatos.prazo_inscricao).toEqual(b.fatos.prazo_inscricao);
    expect(a.base.ausentes).toEqual(b.base.ausentes);
    expect(b.fatos.conflitos).toEqual([]);
  });

  it("reabrir (reaplicar sobre o resultado salvo) não muda o resultado", () => {
    const once = run({ interpretation: { deadlines: "Prazo não informado." }, checklist: { items: [{ doc: "Comprovante de matrícula com foto", obrigatorio: true }] } });
    const twice = run(once as Record<string, unknown>);
    expect(twice.checklist).toEqual(once.checklist);
    expect(twice.interpretation).toEqual(once.interpretation);
    expect(twice.fatos.prazo_inscricao).toEqual(once.fatos.prazo_inscricao);
    expect(twice.base.ausentes).toEqual(once.base.ausentes);
  });
});

describe("desempenho", () => {
  it("edital no limite (~440 mil caracteres) com 60 itens: bem abaixo de 1,5 s (medido: ~0,15 s; antes do índice: ~2,9 s)", () => {
    let text = "";
    while (text.length < 440_000) text += `${EDITAL}\n`;
    const items = Array.from({ length: 60 }, (_, i) => ({ doc: `Documento ${i} com foto e assinatura`, obrigatorio: true }));
    const t = Date.now();
    run({ interpretation: { deadlines: "Prazo não informado" }, checklist: { items } }, text);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});
