/**
 * DMS — Universal File Content Extractor
 *
 * Extracts AI-readable content from any supported uploaded file:
 *   - PDF                → text layer, or rendered page images (scanned PDFs)
 *   - JPEG/PNG/WebP/GIF  → passed directly to the vision model
 *   - TIFF               → converted to PNG (vision models don't accept TIFF)
 *   - DOCX               → text via mammoth
 *   - DOC (legacy)       → best-effort text fallback
 *   - XLSX/XLS           → text via SheetJS (sheet-by-sheet CSV)
 *
 * Returns either extracted text, image attachments, or both.
 * Never throws — callers must handle the empty case gracefully.
 */

import { convertPdfPagesToImages, isPdfTextEmpty } from "./pdf-to-images";

export interface ExtractedImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

export interface ExtractedContent {
  /** Plain text extracted from the document (may be empty). */
  text: string;
  /** Image attachments to send to a vision model (may be empty). */
  images: ExtractedImage[];
  /** True if any usable content (text or images) was produced. */
  hasContent: boolean;
  /** Human-readable note about how the content was extracted (for logging). */
  method: string;
}

const EMPTY: ExtractedContent = { text: "", images: [], hasContent: false, method: "none" };

function normalizeMime(mime: string): string {
  return mime.toLowerCase().split(";")[0].trim();
}

const PDF_MIMES = new Set(["application/pdf"]);
const VISION_IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const TIFF_MIMES = new Set(["image/tiff", "image/tif"]);
const DOCX_MIMES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const DOC_MIMES = new Set(["application/msword"]);
const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

/** Extract text from a DOCX buffer using mammoth. */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim();
  } catch (err) {
    console.warn("[file-extractor] DOCX extraction failed:", err);
    return "";
  }
}

/** Best-effort text extraction from a legacy .doc binary (no full parser). */
function extractLegacyDocText(buffer: Buffer): string {
  try {
    // Legacy .doc stores readable runs of text; strip binary noise heuristically.
    const raw = buffer.toString("latin1");
    const printable = raw
      .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    // Only return if we got a meaningful amount of readable text
    return printable.length > 50 ? printable.slice(0, 20_000) : "";
  } catch {
    return "";
  }
}

/** Extract text from an XLSX/XLS buffer using SheetJS. */
async function extractExcelText(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) {
        parts.push(`--- Sheet: ${sheetName} ---\n${csv.trim()}`);
      }
    }
    return parts.join("\n\n").slice(0, 30_000);
  } catch (err) {
    console.warn("[file-extractor] Excel extraction failed:", err);
    return "";
  }
}

/** Convert a TIFF buffer to a PNG base64 image using sharp. */
async function convertTiffToPng(buffer: Buffer, fileName: string): Promise<ExtractedImage | null> {
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(buffer, { limitInputPixels: false })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return {
      fileName: fileName.replace(/\.tiff?$/i, ".png"),
      base64: png.toString("base64"),
      mimeType: "image/png",
    };
  } catch (err) {
    console.warn("[file-extractor] TIFF→PNG conversion failed:", err);
    return null;
  }
}

/**
 * Main entry point — extract AI-readable content from any supported file.
 */
export async function extractFileContent(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractedContent> {
  const mime = normalizeMime(mimeType);

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (PDF_MIMES.has(mime)) {
    // Try text layer first
    let text = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        b: Buffer
      ) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      text = (parsed.text ?? "").trim();
    } catch { /* fall through to image conversion */ }

    if (!isPdfTextEmpty(text)) {
      return { text, images: [], hasContent: true, method: "pdf-text-layer" };
    }

    // No text layer — render pages to images for vision
    const pages = await convertPdfPagesToImages(buffer, 4);
    if (pages.length > 0) {
      return {
        text: "",
        images: pages.map((p) => ({ fileName: p.fileName, base64: p.base64, mimeType: p.mimeType })),
        hasContent: true,
        method: "pdf-rendered-images",
      };
    }
    return { ...EMPTY, method: "pdf-no-content" };
  }

  // ── Vision-native images (JPEG/PNG/WebP/GIF) ───────────────────────────────
  if (VISION_IMAGE_MIMES.has(mime)) {
    return {
      text: "",
      images: [{ fileName, base64: buffer.toString("base64"), mimeType: mime }],
      hasContent: true,
      method: "image-direct",
    };
  }

  // ── TIFF → PNG (vision models don't accept TIFF) ───────────────────────────
  if (TIFF_MIMES.has(mime)) {
    const png = await convertTiffToPng(buffer, fileName);
    if (png) {
      return { text: "", images: [png], hasContent: true, method: "tiff-converted-png" };
    }
    return { ...EMPTY, method: "tiff-conversion-failed" };
  }

  // ── DOCX ───────────────────────────────────────────────────────────────────
  if (DOCX_MIMES.has(mime)) {
    const text = await extractDocxText(buffer);
    return text
      ? { text, images: [], hasContent: true, method: "docx-text" }
      : { ...EMPTY, method: "docx-empty" };
  }

  // ── Legacy DOC ──────────────────────────────────────────────────────────────
  if (DOC_MIMES.has(mime)) {
    const text = extractLegacyDocText(buffer);
    return text
      ? { text, images: [], hasContent: true, method: "doc-legacy-text" }
      : { ...EMPTY, method: "doc-legacy-empty" };
  }

  // ── XLSX / XLS ────────────────────────────────────────────────────────────
  if (XLSX_MIMES.has(mime)) {
    const text = await extractExcelText(buffer);
    return text
      ? { text, images: [], hasContent: true, method: "excel-text" }
      : { ...EMPTY, method: "excel-empty" };
  }

  // ── Unknown type ──────────────────────────────────────────────────────────
  return { ...EMPTY, method: `unsupported:${mime}` };
}
