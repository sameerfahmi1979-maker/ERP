/**
 * Derives document OCR summary from file rows + document flags.
 * Mirrors persist-file-ocr-result recompute logic for read paths (Understanding tab).
 */

export type OcrFileSummaryRow = {
  ocr_status: string | null;
  ocr_text: string | null;
  ocr_completed_at?: string | null;
};

export type DeriveDocumentOcrSummaryInput = {
  files: OcrFileSummaryRow[];
  documentOcrTextAvailable?: boolean | null;
  documentOcrLastRunAt?: string | null;
  contentTextAvailable?: boolean;
  /** True when latest AI extraction has non-empty raw_ocr_text (server-side only). */
  hasRawOcrInExtract?: boolean;
};

export type DocumentOcrSummary = {
  fileCount: number;
  /** Files with ocr_status complete or skipped */
  filesWithOcr: number;
  /** True when extractable text exists anywhere (file, content, or AI result). */
  ocrTextAvailable: boolean;
  /** True when at least one file finished OCR processing. */
  ocrRunComplete: boolean;
  ocrLastRunAt: string | null;
};

function isOcrProcessedStatus(status: string | null | undefined): boolean {
  return status === "complete" || status === "skipped";
}

export function deriveDocumentOcrSummary(
  input: DeriveDocumentOcrSummaryInput
): DocumentOcrSummary {
  const { files } = input;
  const fileCount = files.length;
  const filesWithOcr = files.filter((f) => isOcrProcessedStatus(f.ocr_status)).length;
  const hasFileText = files.some(
    (f) => typeof f.ocr_text === "string" && f.ocr_text.trim().length > 0
  );
  const ocrRunComplete =
    (fileCount > 0 && files.every((f) => isOcrProcessedStatus(f.ocr_status))) ||
    filesWithOcr > 0;

  const fileLastRun = files.reduce<string | null>((max, f) => {
    const ts = f.ocr_completed_at ?? null;
    if (!ts) return max;
    return !max || ts > max ? ts : max;
  }, null);

  const ocrTextAvailable =
    input.documentOcrTextAvailable === true ||
    hasFileText ||
    input.contentTextAvailable === true ||
    input.hasRawOcrInExtract === true;

  return {
    fileCount,
    filesWithOcr,
    ocrTextAvailable,
    ocrRunComplete,
    ocrLastRunAt: fileLastRun ?? input.documentOcrLastRunAt ?? null,
  };
}
