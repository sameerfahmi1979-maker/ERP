/**
 * DMS — PDF to Images converter
 *
 * Converts PDF pages to base64-encoded PNG images for vision AI analysis.
 * Uses pdfjs-dist (ESM, legacy Node.js build) + @napi-rs/canvas (pre-built binaries, no node-gyp).
 * Falls back gracefully if rendering fails — callers must handle empty result.
 *
 * Used when a PDF has no text layer (scanned / image-based PDF) and needs
 * to be sent to a vision model (e.g. GPT-4o) for OCR + extraction.
 */

import { logger } from "@/lib/logger";
import path from "path";
import { pathToFileURL } from "node:url";

export interface PdfPageImage {
  fileName: string;
  base64: string;
  mimeType: "image/png";
  pageNumber: number;
  totalPages?: number;
}

/** Scale factor for rendering — 3.0 gives ~216 DPI for sharper small-print (IDs, stamps). */
const RENDER_SCALE = 3.0;

/** Max pages to convert per call (keep AI payload small). */
const DEFAULT_MAX_PAGES = 4;
const VERIFICATION_TEXT_LIMIT = 100_000;
const VERIFICATION_ITEM_LIMIT = 20_000;
const VERIFICATION_PIXEL_LIMIT = 25_000_000;

async function loadLocalPdf(buffer: Buffer, stopAtErrors = false) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfRoot = path.resolve(process.cwd(), "node_modules/pdfjs-dist");
  const assetDirectory = (name: string) => path.resolve(pdfRoot, name).replace(/\\/g, "/") + "/";

  // Use an absolute worker URL because a Next.js server chunk has a different base path.
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.resolve(pdfRoot, "legacy/build/pdf.worker.mjs")).href;
  return pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    standardFontDataUrl: assetDirectory("standard_fonts"),
    cMapUrl: assetDirectory("cmaps"),
    cMapPacked: true,
    wasmUrl: assetDirectory("wasm"),
    verbosity: 0,
    stopAtErrors,
  });
}

type SinglePdfPage = { status: "read"; text: string } | { status: "not_single_page" } | { status: "unreadable" };

/** Reads the complete embedded text of page 1 only after verifying the actual page count. */
export async function readSinglePdfPageForVerification(buffer: Buffer): Promise<SinglePdfPage> {
  let loadingTask: Awaited<ReturnType<typeof loadLocalPdf>> | undefined;
  try {
    loadingTask = await loadLocalPdf(buffer, true);
    const pdf = await loadingTask.promise;
    if (pdf.numPages !== 1) return { status: "not_single_page" };
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const pixelCount = Math.ceil(viewport.width) * Math.ceil(viewport.height);
    if (page.pageNumber !== 1 || !Number.isFinite(pixelCount) || pixelCount < 1 || pixelCount > VERIFICATION_PIXEL_LIMIT) {
      return { status: "unreadable" };
    }

    const reader = page.streamTextContent().getReader();
    const fragments: string[] = [];
    let characterCount = 0;
    let itemCount = 0;
    let previousY: number | undefined;
    let limitExceeded = false;
    try {
      for (let part = await reader.read(); !part.done; part = await reader.read()) {
        // Drain without buffering on overflow. PDF.js can race a local cancel with its worker close.
        if (limitExceeded) continue;
        for (const item of part.value.items) {
          if (!("str" in item)) continue;
          itemCount += 1;
          const y: number = item.transform[5];
          const prefix = previousY !== undefined && previousY !== y ? "\n" : "";
          const suffix = item.hasEOL ? "\n" : "";
          characterCount += prefix.length + item.str.length + suffix.length;
          if (itemCount > VERIFICATION_ITEM_LIMIT || characterCount > VERIFICATION_TEXT_LIMIT) {
            limitExceeded = true;
            break;
          }
          fragments.push(prefix + item.str + suffix);
          previousY = item.hasEOL ? undefined : y;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const text = limitExceeded ? "" : fragments.join("").trim();
    return text ? { status: "read", text } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

/**
 * Converts the first N pages of a PDF buffer to PNG images.
 * Returns an empty array on failure (callers must handle gracefully).
 */
export async function convertPdfPagesToImages(
  buffer: Buffer,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<PdfPageImage[]> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const loadingTask = await loadLocalPdf(buffer);

    const pdf = await loadingTask.promise;
    const numPages = Math.min(pdf.numPages, maxPages);
    const images: PdfPageImage[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);

        const canvas = createCanvas(width, height);
        // pdfjs-dist v6 RenderParameters requires `canvas` (the element itself)
        const renderTask = page.render({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          canvas: canvas as any,
          viewport,
        });

        await renderTask.promise;
        page.cleanup();

        const pngBuffer = canvas.toBuffer("image/png");
        images.push({
          fileName: `page-${pageNum}.png`,
          base64: pngBuffer.toString("base64"),
          mimeType: "image/png",
          pageNumber: pageNum,
          totalPages: pdf.numPages,
        });
      } catch (pageErr) {
        // Skip individual bad pages rather than failing the whole document
        logger.warn(`[pdf-to-images] Failed to render page ${pageNum}:`, pageErr);
      }
    }

    // pdf cleanup (loadingTask has a destroy method in some versions)
    try { loadingTask.destroy?.(); } catch { /* ignore */ }
    return images;
  } catch (err) {
    logger.error("[pdf-to-images] PDF rendering failed:", err);
    return [];
  }
}

/**
 * Returns true if the extracted OCR text is effectively empty
 * (blank, whitespace-only, or too short to be meaningful).
 */
export function isPdfTextEmpty(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length < 30; // fewer than 30 meaningful chars = treat as empty
}
