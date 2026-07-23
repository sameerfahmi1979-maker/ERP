/**
 * ERP PDF Generation — Public API
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 */

export type {
  PdfRenderRequest,
  PdfRenderResult,
  PdfRenderer,
  PdfOutputProfile,
  PdfPageSize,
  PdfOrientation,
  PdfDirection,
  PdfLocale,
  PrintTokenPayload,
  PdfTemplateRegistration,
  GeneratedPdfRecord,
} from "./types";

export { PdfRenderRequestSchema } from "./types";

export { renderPdf } from "./renderer";

export {
  isGotenbergHealthy,
  getGotenbergVersion,
  gotenbergConvertUrl,
  gotenbergConvertHtml,
} from "./gotenberg";

export { signPrintToken, verifyPrintToken } from "./print-token";

export {
  buildPdfStoragePath,
  uploadGeneratedPdf,
  createPdfSignedUrl,
  deletePdfFromStorage,
} from "./storage";

export {
  createPdfHistoryRow,
  markPdfGenerationFailed,
  listPdfHistoryForRecord,
} from "./history";
