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

export const DMS_ENTITY_TYPES = [
  "party",
  "party_license",
  "party_tax_registration",
  "employee",
  "vehicle",
  "equipment",
  "project",
  "contract",
  "purchase_order",
  "invoice",
  "job_card",
  "hse_incident",
  "company",
  "branch",
  "bank",
] as const;

export type DmsEntityType = (typeof DMS_ENTITY_TYPES)[number];

export const DMS_ENTITY_TYPE_LABELS: Record<DmsEntityType, string> = {
  party: "Party",
  party_license: "Party License",
  party_tax_registration: "Tax Registration",
  employee: "Employee",
  vehicle: "Vehicle",
  equipment: "Equipment",
  project: "Project",
  contract: "Contract",
  purchase_order: "Purchase Order",
  invoice: "Invoice",
  job_card: "Job Card",
  hse_incident: "HSE Incident",
  company: "Company",
  branch: "Branch",
  bank: "Bank",
};
