/**
 * @file lib/analysisEnrich.ts
 * @description Enriquecimento COMUM de toda análise de edital (curta ou longa): base documental,
 * fatos conferidos no texto, verificação de datas/valores e elegibilidade em 3 estados.
 * Antes ficava dentro da rota /edital/analyze; agora a análise longa em segundo plano usa
 * exatamente o mesmo código.
 */
import { buildDocumentBase, normalizeEligibilityCriteria, verifyAgainstText } from "./documentBase";
import { applyAnalysisFacts, factIssues } from "./analysisFacts";
import { getStore } from "./lupa/store";

/**
 * Acrescenta à resposta da IA a base documental comum (igual para todos os agentes),
 * a verificação de datas/valores contra o texto e a elegibilidade em 3 estados.
 * Nunca altera o objeto em cache (trabalha numa cópia).
 */
/**
 * Metadados do documento só com o que o TEXTO sustenta (achado em produção, 21/11/2026: a IA
 * devolveu "anoPublicacao: 2024" e "totalPaginas: 45" para um texto colado de 3 linhas, sem ano
 * de publicação nem paginação). Ano só fica se aparecer no texto; número de páginas nunca vem da
 * IA (com texto colado ela não tem como saber).
 */
export function groundDocumentMeta<T extends Record<string, unknown>>(out: T, text: string): T {
  const fix = (doc: unknown) => {
    if (!doc || typeof doc !== "object") return doc;
    const d = { ...(doc as Record<string, unknown>) };
    if (typeof d.anoPublicacao === "number" && !new RegExp(`\\b${d.anoPublicacao}\\b`).test(text)) delete d.anoPublicacao;
    delete d.totalPaginas;
    return d;
  };
  const o = out as Record<string, unknown>;
  if (o.documento) o.documento = fix(o.documento);
  const agent = o.agentResult as Record<string, unknown> | undefined;
  if (agent?.documento) o.agentResult = { ...agent, documento: fix(agent.documento) };
  if (typeof o.anoPublicacao === "number" && !new RegExp(`\\b${o.anoPublicacao}\\b`).test(text)) delete o.anoPublicacao;
  delete o.totalPaginas;
  return out;
}

export async function withDocumentBase(result: unknown, text: string, userId: string | null) {
  const out = groundDocumentMeta({ ...(result as Record<string, unknown>) }, text);
  let teacher = null;
  if (userId) {
    try {
      teacher = await getStore().getProfile(userId);
    } catch {
      teacher = null; // sem perfil docente (ou banco indisponível): elegibilidade fica sem comparação
    }
  }
  const base = buildDocumentBase(text, teacher);
  // Fatos conferidos contra o texto: exigências com evidência, prazo único e campos conciliados
  const grounded = applyAnalysisFacts(out, text, base);
  Object.assign(out, grounded);
  out.verificacao = [...verifyAgainstText(result, text), ...factIssues(grounded.fatos)];
  if (Array.isArray(out.criterios)) out.criterios = normalizeEligibilityCriteria(out.criterios);
  const agent = out.agentResult as Record<string, unknown> | undefined;
  if (agent && Array.isArray(agent.criterios)) out.agentResult = { ...agent, criterios: normalizeEligibilityCriteria(agent.criterios) };
  return out;
}

