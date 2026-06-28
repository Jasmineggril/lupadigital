import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfStructuredData {
  title: string;
  resumo: string;
  categoria: string;
  prazo: string;
  requisitos: string[];
  indicadores: Record<string, string | number | boolean | string[]>;
}

export interface ExtractedPdfResult {
  text: string;
  structured: PdfStructuredData;
}

const normalizeText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

const detectCategory = (text: string) => {
  const lower = text.toLowerCase();
  if (/concurso|cargo|nomeação/.test(lower)) return "Concurso Público";
  if (/bolsa|auxílio|benefício/.test(lower)) return "Bolsa ou Auxílio";
  if (/licitação|pregão|fornecimento/.test(lower)) return "Licitação";
  if (/fomento|financiamento|subvenção/.test(lower)) return "Fomento / Financiamento";
  if (/seleção|processo seletivo/.test(lower)) return "Processo Seletivo";
  return "Edital Público";
};

const extractDeadline = (text: string) => {
  const matches = text.match(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{1,2}\s+de\s+[a-záéíóúâêîôûãõ]+\s+de\s+\d{4}\b/gi) ?? [];
  return matches[0] ? matches[0] : "Não informado";
};

const extractRequirements = (text: string) => {
  const lines = text
    .split(/\n|\.|;|\)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => /requisito|documento|comprovante|declaração|cadastro|formulário|certidão|inscrição/i.test(entry));

  return [...new Set(lines)].slice(0, 5);
};

const extractTitle = (text: string) => {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const first = lines.find((line) => line.length > 10 && !/^https?:/i.test(line));
  return first ? first.slice(0, 120) : "Edital público";
};

const buildSummary = (text: string) => {
  const sanitized = normalizeText(text);
  const firstSentence = sanitized.split(/(?<=[.!?])\s+/)[0] ?? sanitized;
  return firstSentence.length > 220 ? `${firstSentence.slice(0, 217)}...` : firstSentence;
};

export async function extractTextFromPdf(file: File): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, disableFontFace: true }).promise;

  const chunks: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    chunks.push(pageText);
  }

  const rawText = chunks.join("\n");
  const text = normalizeText(rawText);

  if (!text) {
    throw new Error("Nenhum texto legível foi encontrado neste PDF.");
  }

  const structured: PdfStructuredData = {
    title: extractTitle(text),
    resumo: buildSummary(text),
    categoria: detectCategory(text),
    prazo: extractDeadline(text),
    requisitos: extractRequirements(text),
    indicadores: {
      palavras: text.split(/\s+/).filter(Boolean).length,
      paginas: pdf.numPages,
      data: extractDeadline(text),
      instituicao: /ministério|secretaria|fundação|universidade|empresa|autarquia/i.test(text) ? "Órgão identificado no texto" : "Não identificada",
    },
  };

  return { text, structured };
}
