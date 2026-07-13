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
 * - Unicode Private Use Area (PUA): U+E000–U+F8FF, U+FFF0–U+FFFF
 * - Unicode replacement character U+FFFD
 * - Control characters except newline/tab
 * - Common PDF substitution glyphs emitted when a font has no ToUnicode CMap:
 *   ♦ (U+25C6), ◊ (U+25CA), ‖ (U+2016), ● (U+25CF), □ (U+25A1), ▪ (U+25AA)
 */
const PDF_GARBAGE_GLYPHS = /[\u25C6\u25CA\u2016\u25CF\u25A1\u25AA\u25AB\u25AC\u25B6\u25C0\u2022\u2023\u2043]/g;

const stripGarbageChars = (value: string) =>
  value
    .replace(/[\uE000-\uF8FF\uFFF0-\uFFFF]/g, "") // BMP PUA + specials
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // control chars
    .replace(/\uFFFD/g, "") // replacement char
    .replace(PDF_GARBAGE_GLYPHS, ""); // known PDF substitution glyphs

/**
 * Returns the fraction of non-whitespace characters that are actual Unicode
 * letters (\\p{L}).  Legitimate Portuguese text sits at 0.65–0.85.
 * Garbled PDFs (raw glyph codes) typically fall below 0.45 even after stripping
 * the known substitution glyphs above, because they contain many symbols,
 * digits, and punctuation relative to letters.
 */
const letterRe = /\p{L}/u;
const nonSpaceRe = /\S/;

const readabilityScore = (value: string) => {
  if (!value.length) return 0;
  let letters = 0;
  let nonSpace = 0;
  for (const c of value) {
    if (nonSpaceRe.test(c)) {
      nonSpace++;
      if (letterRe.test(c)) letters++;
    }
  }
  return nonSpace === 0 ? 0 : letters / nonSpace;
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

  // Detect PDFs with heavily garbled/encoded fonts.
  // The score is: Unicode-letter chars / non-whitespace chars.
  // Legitimate Portuguese prose scores ~0.65–0.85.
  // A garbled PDF (raw glyph codes mixed with symbols) typically scores < 0.45.
  const score = readabilityScore(text);
  if (score < 0.45) {
    throw new Error(
      "Este PDF usa uma codificacao de fonte nao suportada e o texto extraido ficou ilegivel. " +
      "Por favor, abra o PDF, selecione todo o texto (Ctrl+A), copie (Ctrl+C) e cole na aba 'Colar Texto'.",
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
