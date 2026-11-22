/**
 * Edital FICTÍCIO longo e "IA" simulada para testar a leitura completa (sem provedor externo).
 *
 * O edital tem exigências no início, no meio e no fim; uma exceção que modifica regra anterior;
 * retificação com prorrogação no último anexo; tabelas; linhas e parágrafos repetidos; marcadores
 * de página. Cada marcador (TAI-INICIO, PGD-MEIO, DCE-FIM…) só aparece uma vez.
 *
 * A IA simulada só enxerga o texto da PARTE que recebeu (ignora o bloco de contexto), então um
 * fato no resultado prova que aquela parte foi realmente enviada e lida.
 */
import type { ChunkAnalysisFacts } from "../../aiService";

const FILLER = [
  "O proponente deverá observar as normas gerais de execução financeira e a legislação aplicável à concessão de apoio, mantendo a documentação comprobatória à disposição dos órgãos de controle pelo prazo legal.",
  "A Fundação poderá solicitar, a qualquer tempo, informações complementares sobre a execução do projeto, que deverão ser prestadas no prazo indicado na solicitação.",
  "As despesas realizadas deverão guardar relação direta com o objeto aprovado, sendo vedada a utilização dos recursos para finalidades diversas das previstas no plano de trabalho.",
  "Os bens adquiridos com recursos do apoio serão incorporados ao patrimônio da instituição executora, conforme termo próprio e normas internas aplicáveis.",
];

export const MARKERS = {
  inicio: ["TAI-INICIO", "REQ-INICIO"],
  meio: ["PGD-MEIO", "VALOR-MEIO"],
  excecao: "EXC-TAI",
  fim: ["DCE-FIM", "REQ-FIM"],
  final: "MARCADOR-FINAL-7Q2",
};

export function buildLongEdital(targetChars: number): string {
  const out: string[] = [];
  let len = 0;
  let page = 1;
  let sinceMarker = 0;
  const push = (s: string) => {
    out.push(s);
    len += s.length + 1;
    sinceMarker += s.length + 1;
    if (sinceMarker >= 3_500) {
      page += 1;
      out.push(`[Página ${page}]`);
      len += `[Página ${page}]`.length + 1;
      sinceMarker = 0;
    }
  };
  push("[Página 1]");
  push("EDITAL Nº 99/2027 — PROGRAMA DE APOIO À PESQUISA (DOCUMENTO FICTÍCIO DE TESTE)");
  push("1. DO OBJETO");
  push("1.1 O presente edital tem por objeto selecionar propostas de pesquisa científica e tecnológica.");
  push("2. DAS INSCRIÇÕES");
  push("2.1 As inscrições serão realizadas de 01/02/2027 até 31/03/2027, pelo sistema eletrônico SIGFAP.");
  push("3. DOS DOCUMENTOS");
  push("3.1 Documento obrigatório: Termo de Anuência Institucional assinado pelo dirigente (TAI-INICIO).");
  push("3.2 Requisito: possuir título de doutor (REQ-INICIO).");
  push("");

  let section = 4;
  let midDone = false;
  let excDone = false;
  const END = [
    "ANEXO IX — RETIFICAÇÃO Nº 1",
    "Onde se lê \"até 31/03/2027\", leia-se: as inscrições ficam prorrogadas até 30/04/2027.",
    "Documento obrigatório: Declaração de Conformidade Ética (DCE-FIM).",
    "Requisito: apresentar carta de anuência do coordenador de curso (REQ-FIM).",
    `FIM DO DOCUMENTO — ${MARKERS.final}`,
  ];
  const endReserve = END.join("\n").length + 40;
  while (len < targetChars - endReserve) {
    if (!midDone && len >= targetChars * 0.5) {
      push(`${section}. DA GESTÃO DE DADOS`);
      push(`${section}.4 Documento obrigatório: Plano de Gestão de Dados (PGD-MEIO).`);
      push(`${section}.5 Valor máximo por proposta: R$ 1.234.567,89 (VALOR-MEIO).`);
      push("");
      section += 1;
      midDone = true;
      continue;
    }
    if (!excDone && len >= targetChars * 0.7) {
      push(`${section}. DAS EXCEÇÕES`);
      push(`${section}.2 Exceção ao item 3.1: proponentes vinculados a instituições estaduais estão dispensados do Termo de Anuência Institucional (EXC-TAI).`);
      push("");
      section += 1;
      excDone = true;
      continue;
    }
    push(`${section}. DISPOSIÇÕES DE EXECUÇÃO — PARTE ${section}`);
    for (let k = 1; k <= 6; k += 1) push(`${section}.${k} ${FILLER[(section + k) % FILLER.length]}`);
    if (section % 5 === 0) {
      // Tabela com linha repetida de propósito (o limpador antigo apagava linhas repetidas e curtas)
      push(`Tabela ${section} — Valores de referência`);
      push("| Item | Descrição | Valor unitário | Quantidade |");
      push("| 1 | Bolsa de iniciação | R$ 700,00 | 10 |");
      push("| 1 | Bolsa de iniciação | R$ 700,00 | 10 |");
      push("| 2 | Diária | R$ 335,00 | 5 |");
    }
    // Parágrafo idêntico repetido em todas as seções (conteúdo repetido)
    push("Os casos omissos serão resolvidos pela Diretoria Científica, ouvida a assessoria jurídica.");
    push("");
    section += 1;
  }
  // Completa até o tamanho pedido com um parágrafo (sem marcadores) antes do anexo final
  let body = out.join("\n");
  const missing = targetChars - endReserve - body.length;
  if (missing > 0) body += "\n" + "Disposição complementar de execução sem efeito sobre prazos. ".repeat(Math.ceil(missing / 62)).slice(0, missing);
  return `${body}\n${END.join("\n")}`;
}

/** Só a parte, sem o bloco de contexto da parte anterior. */
export function mainPart(promptText: string): string {
  const i = promptText.indexOf("[FIM DO CONTEXTO]");
  return i === -1 ? promptText : promptText.slice(i + "[FIM DO CONTEXTO]".length);
}

const empty = (): ChunkAnalysisFacts => ({ documentInfo: [], dates: [], requirements: [], eligibility: [], documents: [], values: [], contacts: [], obligations: [], restrictions: [], alerts: [] });

/** "IA" determinística: extrai fatos SÓ da parte recebida. */
export function fakeFacts(promptText: string): ChunkAnalysisFacts {
  const f = empty();
  for (const raw of mainPart(promptText).split("\n")) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/Documento obrigatório:\s*(.+?)\.?$/))) f.documents.push({ document: m[1], text: line });
    if ((m = line.match(/Requisito:\s*(.+?)\.?$/))) f.requirements.push({ requirement: m[1], text: line });
    if ((m = line.match(/inscri[çc][õo]es.*?até\s+(\d{2}\/\d{2}\/\d{4})/i))) f.dates.push({ event: "Inscrições", value: m[1], text: line });
    if (/Exceção|dispensad/i.test(line)) f.restrictions.push({ restriction: line, text: line });
    if (/RETIFICA/i.test(line)) f.alerts.push({ message: line, text: line });
    if ((m = line.match(/(R\$\s?[\d.]+,\d{2})/))) f.values.push({ value: m[1], text: line });
    if (/^EDITAL Nº/.test(line)) f.documentInfo.push({ title: line, text: line });
  }
  return f;
}
