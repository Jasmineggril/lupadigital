/**
 * Rota completa /api/edital/analyze com o provedor de IA SIMULADO devolvendo a saída do agente
 * Documentação observada em produção (22/11/2026): "Prazo não informado", observação copiada do
 * modelo do prompt e — no pior caso — "com foto e assinatura". Nenhum provedor externo é chamado.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const EDITAL = [
  "EDITAL Nº 07/2026 — PROGRAMA DE BOLSAS DE INICIAÇÃO CIENTÍFICA (TEXTO FICTÍCIO DE TESTE)",
  "1. Objeto: seleção de estudantes de graduação para bolsas de iniciação científica.",
  "2. Inscrições: de 01/12/2026 até 20/12/2026, pelo sistema eletrônico da instituição.",
  "3. Requisitos: estar regularmente matriculado em curso de graduação.",
  "4. Documentos: comprovante de matrícula e proposta de até 3 páginas.",
  "5. Valor da bolsa: R$ 700,00 mensais.",
  "6. Resultado: divulgado em 15/01/2027.",
].join("\n");

const AI_OUTPUT = {
  type: "documentacao",
  checklist: [
    { doc: "Comprovante de matrícula com foto e assinatura", obrigatorio: true, observacao: "Como obter ou preparar — sem adicionar exigências ausentes no edital", checked: false },
    { doc: "Proposta (até 3 páginas)", obrigatorio: true, observacao: "Como obter ou preparar — sem adicionar exigências ausentes no edital", checked: false },
  ],
  dica: "Separe os documentos com antecedência.",
  anoPublicacao: 2024,
  totalPaginas: 45,
  alertas: [],
};

let server: Server;
let base = "";

beforeAll(async () => {
  process.env.LUPA_STORE = "memory";
  process.env.GROQ_API_KEY = "test-key-groq"; // falso ("test-": sem espera de cota por minuto); o provedor é simulado abaixo
  process.env.RATE_LIMIT_DEFAULT_MAX = "10000";
  process.env.RATE_LIMIT_AI_ANON_PER_HOUR = "10000";
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  // Agente Documentação responde com a saída observada; os demais ficam sem IA (contingência)
  vi.spyOn(openai.chat.completions as any, "create").mockImplementation((async (req: any) => {
    // Erro não recuperável: vai direto à contingência, sem esperar novas tentativas
    if (!JSON.stringify(req.messages).includes("Lupa Documentação")) throw Object.assign(new Error("400 invalid_request_error"), { status: 400 });
    return {
      choices: [{ message: { role: "assistant", content: JSON.stringify(AI_OUTPUT) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
    };
  }) as any);
  const { default: app } = await import("../../app");
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function analyze(agentId: string) {
  const res = await fetch(`${base}/edital/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId, text: EDITAL }) });
  expect(res.status).toBe(200);
  return (await res.json()) as any;
}

describe("/edital/analyze — fatos conferidos no texto", () => {
  it("documentação: sem foto/assinatura como exigência, prazo do documento, ausentes coerentes", async () => {
    const r = await analyze("documentacao");
    expect(r.processing?.mode).not.toBe("fallback");

    const docs = r.checklist.items.map((i: any) => i.doc.toLowerCase()).join(" | ");
    expect(docs).not.toMatch(/foto|assinatura|autentica/);
    expect(r.checklist.items[0]).toMatchObject({ doc: "Comprovante de matrícula", origem: "edital", conferir: true, observacao: "" });
    expect(r.checklist.items[0].nao_confirmado).toEqual(["foto", "assinatura"]);
    expect(r.verificacao.some((v: any) => v.tipo === "exigencia" && v.valor === "foto")).toBe(true);

    // O agente não devolve prazo: o servidor resolve pelo documento, não deixa "não informado"
    expect(r.fatos.prazo_inscricao).toMatchObject({ iso: "2026-12-20", texto: "20/12/2026" });
    expect(r.interpretation.deadlines).not.toMatch(/n[ãa]o informad/i);
    expect(r.interpretation.deadlines).toContain("20/12/2026");

    expect(r.base.ausentes).not.toContain("documentos exigidos");
    // O agente não descreve o canal: o trecho do edital entra no lugar de "não informado"
    expect(r.interpretation.registrationLocation).toContain("sistema eletrônico da instituição");
    expect(r.base.ausentes).toEqual(["áreas", "critérios de avaliação"]);

    // Resposta real da rota (IA simulada) usada pela jornada de navegador scripts/e2e-regressao.mjs
    if (process.env.WRITE_E2E_FIXTURE === "1") {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(new URL("../../../../../scripts/fixtures/analise-fatos-documentacao.json", import.meta.url), `${JSON.stringify({ text: EDITAL, response: r }, null, 2)}\n`);
    }

    // Metadados que o texto não sustenta
    expect(r.agentResult?.totalPaginas).toBeUndefined();
    expect(r.agentResult?.anoPublicacao).toBeUndefined();
  }, 60_000);

  it("troca de agente (IA × contingência sem IA): mesmo prazo e mesmos ausentes", async () => {
    const [a, b] = await Promise.all([analyze("documentacao"), analyze("analista")]);
    expect(b.processing.mode).toBe("fallback");
    expect(a.fatos.prazo_inscricao).toEqual(b.fatos.prazo_inscricao);
    expect(a.base.ausentes).toEqual(b.base.ausentes);
  }, 60_000);
});
