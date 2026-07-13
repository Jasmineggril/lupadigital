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

/**
 * Strip characters that are clearly garbage from PDF font-encoding issues:
 * - Unicode Private Use Area (PUA): U+E000–U+F8FF, U+F0000–U+FFFFF, U+100000–U+10FFFF
 * - Unicode replacement character U+FFFD
 * - Control characters except newline/tab
 */
const stripGarbageChars = (value: string) =>
  value
    .replace(/[\uE000-\uF8FF\uFFF0-\uFFFF]/g, "") // BMP PUA + specials
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // control chars
    .replace(/\uFFFD/g, ""); // replacement char

/** Returns fraction of chars that are in the printable Latin range (rough readability score) */
const readabilityScore = (value: string) => {
  if (!value.length) return 0;
  const readable = [...value].filter((c) => {
    const cp = c.codePointAt(0)!;
    return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0x024f) || cp === 0x0a || cp === 0x09;
  });
  return readable.length / value.length;
};

const normalizeText = (value: string) => {
  const stripped = stripGarbageChars(value);
  return stripped
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
};

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

  // Detect PDFs with heavily garbled/encoded fonts
  const score = readabilityScore(text);
  if (score < 0.35) {
    throw new Error(
      "Este PDF usa uma codificação de fonte não suportada e o texto extraído ficou ilegível. " +
      "Tente copiar o texto manualmente do PDF e cole na aba 'Colar Texto'.",
    );
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
