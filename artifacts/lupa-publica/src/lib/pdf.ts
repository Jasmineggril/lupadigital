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

// ── Base URL for API calls ──────────────────────────────────────────
const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

// ── Garbage stripping ───────────────────────────────────────────────
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

// ── Readability score ───────────────────────────────────────────────
/**
 * Returns the fraction of non-whitespace characters that are actual Unicode
 * letters (\p{L}).  Legitimate Portuguese text sits at 0.65–0.85.
 * Garbled PDFs (raw glyph codes) typically fall below 0.45.
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

// ── Text helpers ────────────────────────────────────────────────────
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

const buildStructured = (text: string, numPages: number): PdfStructuredData => ({
  title: extractTitle(text),
  resumo: buildSummary(text),
  categoria: detectCategory(text),
  prazo: extractDeadline(text),
  requisitos: extractRequirements(text),
  indicadores: {
    palavras: text.split(/\s+/).filter(Boolean).length,
    paginas: numPages,
    data: extractDeadline(text),
    instituicao: /ministério|secretaria|fundação|universidade|empresa|autarquia/i.test(text)
      ? "Órgão identificado no texto"
      : "Não identificada",
  },
});

// ── OCR via server (GPT-4o Vision) ──────────────────────────────────
/**
 * Render each PDF page to a JPEG canvas image and return base64 strings.
 * Scale 1.5 gives ~900×1270 px for A4 — enough for OCR without excess bytes.
 */
async function renderPdfPagesToBase64(
  pdf: pdfjsLib.PDFDocumentProxy,
  maxPages = 25,
): Promise<string[]> {
  const total = Math.min(pdf.numPages, maxPages);
  const images: string[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // Strip the data URL prefix — server only needs the raw base64
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    images.push(dataUrl.replace(/^data:image\/jpeg;base64,/, ""));

    // Release canvas memory
    canvas.width = 0;
    canvas.height = 0;
  }

  return images;
}

async function ocrPdfViaServer(pages: string[]): Promise<string> {
  const BATCH = 8; // pages per API call — keeps payload < ~6 MB per request
  const parts: string[] = [];

  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH);
    const res = await fetch(`${API_BASE}/edital/ocr-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages: batch }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OCR falhou (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { text: string };
    parts.push(data.text ?? "");
  }

  return parts.join("\n\n");
}

// ── Main export ─────────────────────────────────────────────────────
export async function extractTextFromPdf(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    disableFontFace: true,
  }).promise;

  // ── Fast path: text layer extraction ──────────────────────────────
  onStatus?.("Extraindo texto do PDF…");
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
  const score = readabilityScore(text);

  if (text && score >= 0.45) {
    // Text layer is readable — return immediately
    return { text, structured: buildStructured(text, pdf.numPages) };
  }

  // ── Slow path: OCR via GPT-4o Vision ─────────────────────────────
  // The PDF uses a custom/embedded font without a ToUnicode CMap,
  // so the text layer is garbled. Render pages to images and OCR them.
  onStatus?.("PDF com fonte codificada — extraindo via OCR (pode demorar alguns segundos)…");

  const pageImages = await renderPdfPagesToBase64(pdf);

  if (pageImages.length === 0) {
    throw new Error("Não foi possível renderizar as páginas deste PDF.");
  }

  onStatus?.(`Enviando ${pageImages.length} página(s) para OCR…`);
  const ocrRaw = await ocrPdfViaServer(pageImages);
  const ocrText = normalizeText(ocrRaw);

  if (!ocrText.trim()) {
    throw new Error(
      "Não foi possível extrair texto deste PDF mesmo com OCR. " +
        "Tente copiar o texto manualmente e cole na aba 'Colar Texto'.",
    );
  }

  return { text: ocrText, structured: buildStructured(ocrText, pdf.numPages) };
}
