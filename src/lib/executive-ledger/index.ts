/**
 * Executive Ledger Template Engine
 * Phase: BRANDING.5
 *
 * Public API barrel for the executive-ledger library.
 */

export type {
  ExecutiveLedgerDocument,
  ExecutiveLedgerParty,
  ExecutiveLedgerSection,
  ExecutiveLedgerBodySection,
  ExecutiveLedgerKeyValueSection,
  ExecutiveLedgerKeyValueRow,
  ExecutiveLedgerTableSection,
  ExecutiveLedgerDividerSection,
} from "./types";

export {
  elEscapeHtml,
  elEscapeAttr,
  elTextToParagraphs,
  elFormatDate,
  elFormatValue,
  elColumnLabel,
  elBuildRef,
} from "./formatters";

export { renderExecutiveLedgerHtml } from "./html-renderer";

export {
  EL_PAGE_WIDTH_MM,
  EL_PAGE_HEIGHT_MM,
  EL_MARGIN_MM,
  EL_NEUTRAL_COMPANY_NAME,
  EL_NEUTRAL_FOOTER,
} from "./constants";
