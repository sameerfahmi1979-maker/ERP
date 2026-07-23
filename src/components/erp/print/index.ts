/**
 * ERP Print Template Components — Public API
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Import individual components as needed:
 *   import { DocumentPage, DocumentHeader, DocumentTable } from "@/components/erp/print";
 */

export { DocumentPage } from "./document-page";
export { DocumentHeader } from "./document-header";
export { DocumentFooter } from "./document-footer";
export { CompanyBranding } from "./company-branding";
export { DocumentTitle } from "./document-title";
export { DocumentMetadata } from "./document-metadata";
export { AddressBlock } from "./address-block";
export { PartyBlock } from "./party-block";
export { DocumentTable } from "./document-table";
export { TotalsBlock } from "./totals-block";
export { NotesBlock } from "./notes-block";
export { TermsBlock } from "./terms-block";
export { SignatureBlock } from "./signature-block";
export { ApprovalBlock } from "./approval-block";
export { ConfidentialityMark } from "./confidentiality-mark";
export { Watermark } from "./watermark";
export { QRVerificationBlock } from "./qr-verification-block";
export { PageBreak, AvoidPageBreak } from "./page-break";
export { BilingualText } from "./bilingual-text";
export { ArabicText } from "./arabic-text";
export { EmptyStatePlaceholder } from "./empty-state-placeholder";

export type { DocumentTableColumn } from "./document-table";
export type { TotalRow } from "./totals-block";
export type { SignatureSlot } from "./signature-block";
export type { ApprovalEntry } from "./approval-block";
