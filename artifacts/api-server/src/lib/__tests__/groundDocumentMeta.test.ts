import { describe, expect, it } from "vitest";
import { groundDocumentMeta } from "../../routes/edital";

const TEXTO = "EDITAL Nº 99/2099 (FICTÍCIO). Inscrições de 01/02/2099 a 30/06/2099. Valor: até R$ 10.000,00.";

describe("metadados do documento só com o que o texto sustenta", () => {
  it("remove ano de publicação e número de páginas inventados (caso visto em produção)", () => {
    const out = groundDocumentMeta({ documento: { numero: "99/2099", anoPublicacao: 2024, fonte: "Não informado", totalPaginas: 45 } }, TEXTO);
    expect(out.documento).toEqual({ numero: "99/2099", fonte: "Não informado" });
  });
  it("mantém o ano quando ele aparece no texto", () => {
    const out = groundDocumentMeta({ documento: { anoPublicacao: 2099 } }, TEXTO);
    expect((out.documento as { anoPublicacao?: number }).anoPublicacao).toBe(2099);
  });
  it("aplica também ao resultado do agente e aos campos de topo", () => {
    const out = groundDocumentMeta({ anoPublicacao: 2023, totalPaginas: 12, agentResult: { documento: { anoPublicacao: 2023, totalPaginas: 12 } } }, TEXTO);
    expect(out).toEqual({ agentResult: { documento: {} } });
  });
});
