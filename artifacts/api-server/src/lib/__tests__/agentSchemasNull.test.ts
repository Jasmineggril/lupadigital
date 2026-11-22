/**
 * Regressão (produção, 22/11/2026): a IA devolveu `numero: null` e `fonte: null` quando o edital não
 * informava esses dados, e a análise inteira era recusada ("A IA retornou uma resposta incompleta").
 * Campos opcionais ausentes não podem derrubar o resultado.
 */
import { describe, expect, it } from "vitest";
import { AcompanhamentoResponseSchema, ElegibilidadeResponseSchema, DocumentacaoResponseSchema, SimplesResponseSchema } from "../aiService";

describe("respostas da IA com campos ausentes (null)", () => {
  it("acompanhamento com numero: null é aceito", () => {
    const r = AcompanhamentoResponseSchema.safeParse({
      type: "acompanhamento",
      timeline: [{ fase: "Publicação do edital", periodo: "Verificar no edital", descricao: "Divulgação oficial", status: "passado" }],
      observacao: "Sem datas exatas no texto.",
      numero: null,
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.numero).toBeUndefined();
  });

  it("elegibilidade com numero e fonte null é aceita; observação null vira vazio", () => {
    const r = ElegibilidadeResponseSchema.safeParse({
      type: "elegibilidade",
      score: 0,
      criterios: [{ criterio: "Atender aos requisitos de escolaridade", atende: null, observacao: null }],
      recomendacao: "Confira os requisitos no edital.",
      proximosPassos: [],
      numero: null,
      fonte: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fonte).toBeUndefined();
      expect(r.data.criterios[0].observacao).toBe("");
    }
  });

  it("número do edital vindo como número vira texto", () => {
    const r = SimplesResponseSchema.safeParse({
      type: "simples", scoreOportunidade: 50, categoria: "Pesquisa", resumo: "r", objetivo: "o", publicoAlvo: "p", prazo: "x",
      requisitos: [], ondeInscrever: "site", observacao: "", numero: 12, fonte: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.numero).toBe("12");
      expect(r.data.fonte).toBeUndefined();
    }
  });

  it("documentação com dica e observação null é aceita", () => {
    const r = DocumentacaoResponseSchema.safeParse({
      type: "documentacao",
      checklist: [{ doc: "RG", obrigatorio: true, observacao: null }],
      dica: null,
    });
    expect(r.success).toBe(true);
  });

  it("campo essencial ausente continua sendo recusado (não esconde resposta realmente quebrada)", () => {
    const r = ElegibilidadeResponseSchema.safeParse({ type: "elegibilidade", score: 10, criterios: [], proximosPassos: [] });
    expect(r.success).toBe(false);
  });
});
