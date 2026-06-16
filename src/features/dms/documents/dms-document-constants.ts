/**
 * Shared DMS Document constants — used by server actions and client components.
 * Must NOT have "use server" directive.
 */

export const DMS_DOCUMENT_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "active",
  "expired",
  "archived",
  "superseded",
  "deleted",
] as const;

export type DmsDocumentStatus = (typeof DMS_DOCUMENT_STATUSES)[number];

export const DMS_DOCUMENT_STATUS_LABELS: Record<DmsDocumentStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  active: "Active",
  expired: "Expired",
  archived: "Archived",
  superseded: "Superseded",
  deleted: "Deleted",
};

export const DMS_CONFIDENTIALITY_LEVELS = [
  "internal",
  "company",
  "hr",
  "finance",
  "legal",
  "executive",
] as const;

export type DmsConfidentialityLevel = (typeof DMS_CONFIDENTIALITY_LEVELS)[number];

export const DMS_CONFIDENTIALITY_LABELS: Record<DmsConfidentialityLevel, string> = {
  internal: "Internal",
  company: "Company",
  hr: "HR",
  finance: "Finance",
  legal: "Legal",
  executive: "Executive",
};

// DMS.15 — Re-export from canonical lib so existing imports continue to work.
export {
  DMS_ENTITY_TYPE_CODES as DMS_ENTITY_TYPES,
  DMS_ENTITY_TYPE_LABELS,
  getDmsEntityTypeLabel,
  isValidDmsEntityType,
} from "@/lib/dms/dms-entity-types";
export type { DmsEntityTypeValue as DmsEntityType } from "@/lib/dms/dms-entity-types";
