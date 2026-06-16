/**
 * DMS.9 — OCR Provider Factory
 *
 * All OCR now goes through GPT-4.1 vision (via triggerDmsOcrForFile).
 * This factory only provides isOcrSupported() for MIME-type checks used in the UI.
 *
 * Supported types mirror what extractFileContent handles:
 *   - PDF (text layer + scanned page rendering)
 *   - JPEG / PNG / WebP / GIF / TIFF (native vision)
 *   - DOCX / DOC / XLSX / XLS (text extraction → AI)
 */

/** MIME types that AI vision OCR can process. */
const VISION_OCR_SUPPORTED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/tif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/msword",                                                       // DOC
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        // XLSX
  "application/vnd.ms-excel",                                                 // XLS
]);

/**
 * Returns true if the AI vision OCR pipeline supports this MIME type.
 * Always returns true for all types above — regardless of provider config.
 * The actual provider check happens at runtime inside triggerDmsOcrForFile.
 */
export function isOcrSupported(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return VISION_OCR_SUPPORTED_MIMES.has(normalized);
}
