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

import path from "path";

export interface PdfPageImage {
  fileName: string;
  base64: string;
  mimeType: "image/png";
  pageNumber: number;
}

/** Scale factor for rendering — 3.0 gives ~216 DPI for sharper small-print (IDs, stamps). */
const RENDER_SCALE = 3.0;

/** Max pages to convert per call (keep AI payload small). */
const DEFAULT_MAX_PAGES = 4;

/**
 * Converts the first N pages of a PDF buffer to PNG images.
 * Returns an empty array on failure (callers must handle gracefully).
 */
export async function convertPdfPagesToImages(
  buffer: Buffer,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<PdfPageImage[]> {
  try {
    // Dynamic imports — both packages are ESM-friendly in Node.js
    const [pdfjsLib, { createCanvas }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("@napi-rs/canvas"),
    ]);

    // Point the worker to the real file on disk via an absolute file:// URL.
    // In Next.js server-side rendering, pdfjs resolves workerSrc relative to its
    // compiled chunk path (inside .next/), causing a "Cannot find module" error.
    // Using process.cwd() always resolves from the project root.
    const workerAbsPath = path
      .resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
      .replace(/\\/g, "/");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file:///${workerAbsPath}`;

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      // Verbosity 0 = suppress pdfjs console noise
      verbosity: 0,
    });

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
        // @napi-rs/canvas context is structurally compatible with pdfjs CanvasRenderingContext2D
        const context = canvas.getContext("2d");

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
        });
      } catch (pageErr) {
        // Skip individual bad pages rather than failing the whole document
        console.warn(`[pdf-to-images] Failed to render page ${pageNum}:`, pageErr);
      }
    }

    // pdf cleanup (loadingTask has a destroy method in some versions)
    try { loadingTask.destroy?.(); } catch { /* ignore */ }
    return images;
  } catch (err) {
    console.error("[pdf-to-images] PDF rendering failed:", err);
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
