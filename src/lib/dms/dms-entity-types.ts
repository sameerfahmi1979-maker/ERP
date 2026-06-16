/**
 * ERP DMS.15 — DMS Integration Readiness
 *
 * Canonical entity type registry for DMS document links.
 * All future ERP modules that attach DMS documents must use these types.
 *
 * Rule: DMS is the single source of truth for all ERP documents.
 * Future modules must NOT create separate document tables (employee_documents,
 * vehicle_documents, etc.). Use dms_document_links with entity_type + entity_id.
 *
 * To add a new entity type for a future module:
 *  1. Add the type code here (lowercase snake_case)
 *  2. Add the label in DMS_ENTITY_TYPE_LABELS
 *  3. Optionally add document hints in DMS_ENTITY_REQUIRED_DOCUMENT_HINTS
 */

// ── Entity Type Constants ─────────────────────────────────────────────────────

export const DMS_ENTITY_TYPES = {
  // Party Master (002F.5A) — already in use
  PARTY: "party",
  PARTY_LICENSE: "party_license",
  PARTY_TAX_REGISTRATION: "party_tax_registration",

  // Organization structure
  COMPANY: "company",
  BRANCH: "branch",
  BANK: "bank",

  // HR (Roadmap 004 — future)
  EMPLOYEE: "employee",
  EMPLOYEE_COMPLIANCE: "employee_compliance",

  // Fleet / Equipment (Roadmap 005 — future)
  VEHICLE: "vehicle",
  EQUIPMENT: "equipment",
  FLEET_ASSET: "fleet_asset",

  // Workshop (Roadmap 006 — future)
  WORKSHOP_JOB: "workshop_job",
  WORKSHOP_SERVICE: "workshop_service",

  // Projects / Contracts (Roadmap 012 — future)
  PROJECT: "project",
  CONTRACT: "contract",
  SITE: "site",

  // Finance (Roadmap 010 — future)
  INVOICE: "invoice",
  PAYMENT: "payment",
  PURCHASE_ORDER: "purchase_order",

  // HSE (Roadmap 011 — future)
  HSE_INCIDENT: "hse_incident",
  HSE_PERMIT: "hse_permit",
  HSE_TRAINING: "hse_training",
  HSE_INSPECTION: "hse_inspection",

  // Workshop Jobs (alias — used by Fleet/Workshop/Maintenance)
  JOB_CARD: "job_card",
} as const;

/** Union of all valid entity type string values */
export type DmsEntityTypeValue = (typeof DMS_ENTITY_TYPES)[keyof typeof DMS_ENTITY_TYPES];

/**
 * Flat array of all valid entity type codes.
 * Used for Zod enum validation in server actions.
 */
export const DMS_ENTITY_TYPE_CODES = Object.values(DMS_ENTITY_TYPES) as [
  DmsEntityTypeValue,
  ...DmsEntityTypeValue[],
];

/** Display labels for entity types */
export const DMS_ENTITY_TYPE_LABELS: Record<DmsEntityTypeValue, string> = {
  party: "Party",
  party_license: "Party License",
  party_tax_registration: "Tax Registration",
  company: "Company",
  branch: "Branch",
  bank: "Bank",
  employee: "Employee",
  employee_compliance: "Employee Compliance",
  vehicle: "Vehicle",
  equipment: "Equipment",
  fleet_asset: "Fleet Asset",
  workshop_job: "Workshop Job",
  workshop_service: "Workshop Service",
  project: "Project",
  contract: "Contract",
  site: "Site",
  invoice: "Invoice",
  payment: "Payment",
  purchase_order: "Purchase Order",
  hse_incident: "HSE Incident",
  hse_permit: "HSE Permit",
  hse_training: "HSE Training",
  hse_inspection: "HSE Inspection",
  job_card: "Job Card",
};

/**
 * Document type hints by entity — used for compliance gap analysis.
 * These are HINTS only, not strict enforcement. Future modules will define
 * exact requirements via DB tables when their schemas are built.
 *
 * Values reference dms_document_types.type_code (partial list — the DB is authoritative).
 */
export const DMS_ENTITY_REQUIRED_DOCUMENT_HINTS: Partial<
  Record<DmsEntityTypeValue, string[]>
> = {
  employee: [
    "EMIRATES_ID",
    "PASSPORT",
    "UAE_VISA",
    "MEDICAL_CERTIFICATE",
    "LABOUR_CONTRACT",
  ],
  employee_compliance: [
    "EMIRATES_ID",
    "PASSPORT",
    "UAE_VISA",
    "MEDICAL_CERTIFICATE",
  ],
  vehicle: [
    "VEHICLE_REGISTRATION",
    "VEHICLE_INSURANCE",
    "INSPECTION_CERTIFICATE",
    "MULKIYA",
  ],
  equipment: [
    "EQUIPMENT_REGISTRATION",
    "INSPECTION_CERTIFICATE",
    "INSURANCE_POLICY",
    "CALIBRATION_CERTIFICATE",
  ],
  fleet_asset: [
    "VEHICLE_REGISTRATION",
    "VEHICLE_INSURANCE",
    "INSPECTION_CERTIFICATE",
  ],
  project: ["CONTRACT", "APPROVAL", "METHOD_STATEMENT", "RISK_ASSESSMENT"],
  contract: ["CONTRACT", "APPROVAL"],
  hse_permit: ["PERMIT", "CERTIFICATE"],
  hse_incident: ["INCIDENT_REPORT", "INVESTIGATION_REPORT"],
  hse_training: ["TRAINING_CERTIFICATE", "ATTENDANCE_RECORD"],
  hse_inspection: ["INSPECTION_REPORT", "CERTIFICATE"],
  party: ["TRADE_LICENSE", "VAT_CERTIFICATE", "BANK_ACCOUNT_LETTER"],
};

/**
 * Returns the display label for an entity type, falling back to the code itself.
 */
export function getDmsEntityTypeLabel(entityType: string): string {
  return DMS_ENTITY_TYPE_LABELS[entityType as DmsEntityTypeValue] ?? entityType;
}

/**
 * Returns true if the entity type code is registered.
 */
export function isValidDmsEntityType(entityType: string): boolean {
  return DMS_ENTITY_TYPE_CODES.includes(entityType as DmsEntityTypeValue);
}
