/**
 * Export System - Central Index
 * Phase 002E.2 - Export Engine Foundation
 * Phase 002E.3B - Attachment Generation
 */

// Export types and utilities
export * from "./export-types";
export * from "./format-export-data";

// Download exports (Phase 002E.2)
export { exportToCSV } from "./csv";
export { exportToExcel } from "./excel";
export { exportToPDF } from "./pdf";
export { exportToPrint } from "./print";

// Email attachment generation (Phase 002E.3B)
export {
  generateCSVAttachment,
  generateExcelAttachment,
  generatePDFAttachment,
  generateAttachmentByType,
} from "./generate-attachment";
