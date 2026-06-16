/**
 * ERP DMS.15 — DMS Integration Readiness
 * Public exports for the reusable DMS entity document integration components.
 *
 * Usage in a future ERP module (e.g., HR Employee record):
 *
 *   import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents";
 *
 *   <DmsEntityDocumentsTab
 *     entityType="employee"
 *     entityId={employeeId}
 *     entityLabel="Employee"
 *     canUpload
 *     canLinkExisting
 *     canUnlink
 *   />
 */

export { DmsEntityDocumentsTab } from "./dms-entity-documents-tab";
export type { DmsEntityDocumentsTabProps } from "./dms-entity-documents-tab";
export { DmsEntityDocumentComplianceCards } from "./dms-entity-document-compliance-cards";
