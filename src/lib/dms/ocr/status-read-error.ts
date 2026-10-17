const messages = {
  authentication: "Your session could not be verified. Sign in again, then reopen the document.",
  permission: "You do not have permission to view this document's OCR status.",
  document: "The document's OCR status could not be loaded. Retry loading.",
  files: "The attached files' OCR status could not be loaded. Retry loading.",
  text_availability: "OCR text availability could not be loaded. Retry loading.",
} as const;

export type OcrStatusReadStage = keyof typeof messages;

/** Only known categories and an opaque UUID cross the diagnostic UI boundary. */
export class OcrStatusReadError extends Error {
  constructor(stage?: string, reference?: string) {
    const message = stage && Object.hasOwn(messages, stage)
      ? messages[stage as OcrStatusReadStage]
      : "OCR status could not be loaded. Retry loading; if it persists, reopen the document after signing in again.";
    const safeReference = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference ?? "")
      ? ` Reference: ${reference}.` : "";
    super(message + safeReference);
    this.name = "OcrStatusReadError";
  }
}

export function describeOcrStatusReadError(error: unknown): string {
  return error instanceof OcrStatusReadError
    ? error.message : "The OCR status request failed. Retry loading; if it persists, reopen the document after signing in again.";
}
