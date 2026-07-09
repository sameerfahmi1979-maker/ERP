/**
 * HR.14A — Document-to-Record Types
 *
 * Shared types and Zod schemas for the HR Document-to-Employee wizard.
 * All server action inputs/outputs use these types.
 * Human review is mandatory — AI is suggestion-only.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Document classification
// ─────────────────────────────────────────────────────────────────────────────

export type DmsDocumentClassification =
  | "PASSPORT"
  | "EMIRATES_ID"
  | "RESIDENCE_VISA"
  | "LABOUR_CARD"
  | "DRIVING_LICENSE"
  | "MEDICAL_INSURANCE"
  | "TRAINING_CERTIFICATE"
  | "ACCESS_CARD"
  | "UNKNOWN";

// ─────────────────────────────────────────────────────────────────────────────
// DMS Document for selection (picker)
// ─────────────────────────────────────────────────────────────────────────────

export type HrDmsDocumentSelection = {
  id: number;
  document_no: string;
  title: string;
  document_type_name: string | null;
  document_type_code: string | null;
  status: string;
  expiry_date: string | null;
  issue_date: string | null;
  created_at: string;
  /** Classification derived from document_type_code or heuristics */
  classification: DmsDocumentClassification;
  /** Whether OCR/AI extraction results exist */
  has_extraction: boolean;
  /** Whether OCR text exists on any file */
  has_ocr: boolean;
  /** Person name found in extraction if any */
  extracted_person_name: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Field suggestion with confidence/source
// ─────────────────────────────────────────────────────────────────────────────

export type HrDocumentFieldSuggestion = {
  /** The field name on the employee / child record */
  fieldName: string;
  /** Human-readable label */
  fieldLabel: string;
  /** Suggested value (always string for display; cast on save) */
  suggestedValue: string | null;
  /** Confidence 0–1 */
  confidence: number;
  /** Source document id */
  sourceDocumentId: number;
  /** Source document title */
  sourceDocumentTitle: string;
  /** Whether this field was from deterministic extraction vs AI */
  source: "extraction" | "ai" | "metadata" | "manual";
  /** User-edited value (starts as suggestedValue, user can override) */
  userValue: string | null;
  /** Whether user has explicitly accepted this suggestion */
  accepted: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Conflict: same field proposed by multiple documents with different values
// ─────────────────────────────────────────────────────────────────────────────

export type HrDocumentConflict = {
  fieldName: string;
  fieldLabel: string;
  values: Array<{
    value: string;
    sourceDocumentId: number;
    sourceDocumentTitle: string;
    confidence: number;
  }>;
  /** Field name of the user-chosen resolution */
  resolvedValue: string | null;
  resolvedSourceDocumentId: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Employee draft assembled from documents
// ─────────────────────────────────────────────────────────────────────────────

export type HrEmployeeDraftFromDocuments = {
  /** Suggested employee core fields — each field is a suggestion the user reviews */
  full_name_en: HrDocumentFieldSuggestion | null;
  full_name_ar: HrDocumentFieldSuggestion | null;
  gender: HrDocumentFieldSuggestion | null;
  date_of_birth: HrDocumentFieldSuggestion | null;
  nationality_id: HrDocumentFieldSuggestion | null;
  mobile_number: HrDocumentFieldSuggestion | null;
  personal_email: HrDocumentFieldSuggestion | null;

  /** Must be entered manually — cannot come from documents */
  owner_company_id: number | null;
  branch_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  employee_category_id: number | null;
  employment_type_id: number | null;
  joining_date: string;
  emergency_contact_name: string;
  emergency_contact_mobile: string;

  /** Conflicts requiring user resolution */
  conflicts: HrDocumentConflict[];

  /** Fields the system could not extract and are required */
  missingRequiredFields: string[];

  /** Overall confidence score (average of accepted suggestion confidences) */
  overallConfidence: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Compliance child record suggestion
// ─────────────────────────────────────────────────────────────────────────────

export type ComplianceChildKind =
  | "identity_document"
  | "medical_insurance"
  | "training_certificate";

export type HrComplianceRecordSuggestion = {
  /** Internal temp id for UI keying */
  tempId: string;
  kind: ComplianceChildKind;
  /** Classification e.g. PASSPORT, EMIRATES_ID */
  classification: DmsDocumentClassification;
  label: string;
  sourceDocumentId: number;
  sourceDocumentTitle: string;
  confidence: number;
  warnings: string[];
  /** Whether user has included this record for creation */
  included: boolean;
  /** Suggested field values (editable) */
  fields: Record<string, string | number | boolean | null>;
  /** Field-level confidence */
  fieldConfidence: Record<string, number>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Full review payload passed between wizard steps
// ─────────────────────────────────────────────────────────────────────────────

export type HrDocumentToEmployeeReviewPayload = {
  selectedDocumentIds: number[];
  selectedDocuments: HrDmsDocumentSelection[];
  employeeDraft: HrEmployeeDraftFromDocuments;
  complianceSuggestions: HrComplianceRecordSuggestion[];
  /** Blocking duplicates found by checking passport/EID numbers against existing records */
  identityDocDuplicates: import("./duplicate-checks").DuplicateCheckResult[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Save input Zod schema
// ─────────────────────────────────────────────────────────────────────────────

const complianceIdentityDocumentInputSchema = z.object({
  kind: z.literal("identity_document"),
  tempId: z.string(),
  sourceDocumentId: z.number().int().positive(),
  document_type_id: z.number().int().positive(),
  document_number: z.string().min(1),
  issue_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  issuing_authority: z.string().nullish(),
  issuing_authority_party_id: z.number().int().positive().nullish(),
  issue_country_id: z.number().int().positive().nullish(),
  issuing_emirate_id: z.number().int().positive().nullish(),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  verification_status: z.enum(["unverified", "verified", "failed"]).default("unverified"),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("not_required"),
  emirates_id_application_no: z.string().nullish(),
  visa_file_number: z.string().nullish(),
  uid_number: z.string().nullish(),
  labour_card_number: z.string().nullish(),
  work_permit_number: z.string().nullish(),
  mohre_person_code: z.string().nullish(),
  profession_on_document: z.string().nullish(),
  sponsor_company_id: z.number().int().positive().nullish(),
  place_of_issue: z.string().nullish(),
  notes: z.string().nullish(),
  dms_document_id: z.number().int().positive().nullish(),
});

const complianceMedicalInsuranceInputSchema = z.object({
  kind: z.literal("medical_insurance"),
  tempId: z.string(),
  sourceDocumentId: z.number().int().positive(),
  insurance_provider: z.string().min(1),
  policy_number: z.string().min(1),
  tpa: z.string().nullish(),
  insurance_card_number: z.string().nullish(),
  network_class: z.string().nullish(),
  issue_date: z.string().nullish(),
  expiry_date: z.string().min(1),
  employee_covered: z.boolean().default(true),
  dependent_coverage_included: z.boolean().default(false),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  verification_status: z.enum(["unverified", "verified", "failed"]).default("unverified"),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("pending"),
  notes: z.string().nullish(),
  dms_document_id: z.number().int().positive().nullish(),
});

const complianceTrainingCertificateInputSchema = z.object({
  kind: z.literal("training_certificate"),
  tempId: z.string(),
  sourceDocumentId: z.number().int().positive(),
  training_type_id: z.number().int().positive(),
  training_category_id: z.number().int().positive().nullish(),
  provider: z.string().nullish(),
  certificate_number: z.string().nullish(),
  issue_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  status: z.enum(["valid", "expired", "pending", "in_progress"]).default("valid"),
  verification_status: z.enum(["unverified", "verified", "failed"]).default("unverified"),
  renewal_status: z.enum(["not_required", "pending", "in_progress", "complete"]).default("not_required"),
  notes: z.string().nullish(),
  dms_document_id: z.number().int().positive().nullish(),
});

export type ComplianceIdentityDocumentInput = z.infer<typeof complianceIdentityDocumentInputSchema>;
export type ComplianceMedicalInsuranceInput = z.infer<typeof complianceMedicalInsuranceInputSchema>;
export type ComplianceTrainingCertificateInput = z.infer<typeof complianceTrainingCertificateInputSchema>;

export type ComplianceChildInput =
  | ComplianceIdentityDocumentInput
  | ComplianceMedicalInsuranceInput
  | ComplianceTrainingCertificateInput;

export const createEmployeeFromDmsDocumentsInputSchema = z.object({
  selectedDocumentIds: z.array(z.number().int().positive()).min(1),
  // Employee core fields
  full_name_en: z.string().min(1, "Full name is required"),
  full_name_ar: z.string().nullish(),
  gender: z.enum(["male", "female"]),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  nationality_id: z.number().int().positive().nullish(),
  mobile_number: z.string().min(1, "Mobile number is required"),
  personal_email: z.string().email("Invalid email").nullish().or(z.literal("").transform(() => null)),
  // Employment
  owner_company_id: z.number().int().positive({ message: "Employer company is required" }),
  branch_id: z.number().int().positive().nullish(),
  department_id: z.number().int().positive().nullish(),
  designation_id: z.number().int().positive().nullish(),
  employee_category_id: z.number().int().positive().nullish(),
  employment_type_id: z.number().int().positive().nullish(),
  joining_date: z.string().min(1, "Joining date is required"),
  employee_status: z.enum(["active", "inactive", "on_leave", "probation", "suspended", "terminated", "archived"]).default("active"),
  reporting_manager_id: z.number().int().positive().nullish(),
  // Emergency
  emergency_contact_name: z.string().min(1, "Emergency contact name is required"),
  emergency_contact_mobile: z.string().min(1, "Emergency contact mobile is required"),
  emergency_contact_relationship_type_id: z.number().int().positive().nullish(),
  // Compliance records to create (user-confirmed, included only)
  complianceRecords: z.array(
    z.union([
      complianceIdentityDocumentInputSchema,
      complianceMedicalInsuranceInputSchema,
      complianceTrainingCertificateInputSchema,
    ])
  ).default([]),
  // Audit trail
  conflictsReviewed: z.number().int().min(0).default(0),
  totalDocumentsSelected: z.number().int().min(1),
});

export type CreateEmployeeFromDmsDocumentsInput = z.infer<typeof createEmployeeFromDmsDocumentsInputSchema>;

export type CreateEmployeeFromDmsDocumentsResult = {
  employeeId: number;
  employeeCode: string;
  complianceRecordsCreated: number;
  documentsLinked: number;
  warnings: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// HR.14B — Document-to-Record (existing employee compliance child records)
// ─────────────────────────────────────────────────────────────────────────────

export type Hr14bTargetType = "identity_document" | "medical_insurance" | "dependent";

/** Slim DMS document shape used in the HR.14B picker step */
export type HrDmsDocForRecord = {
  id: number;
  title: string;
  document_no: string | null;
  document_type_code: string | null;
  document_type_name: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;
  has_extraction: boolean;
  has_ocr: boolean;
  is_linked_to_employee: boolean;
};

/** Review payload for an identity document draft from a DMS doc */
export type HrIdentityDocDraft = {
  documentId: number;
  documentTitle: string;
  dms_document_type_code: string | null;
  document_type_id: number | null;
  document_type_code: string | null;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority: string;
  issue_country_id: number | null;
  issuing_emirate_id: number | null;
  uid_number: string;
  visa_file_number: string;
  labour_card_number: string;
  work_permit_number: string;
  mohre_person_code: string;
  profession_on_document: string;
  emirates_id_application_no: string;
  status: string;
  notes: string;
  fieldConfidence: Record<string, number>;
};

/** Review payload for a medical insurance draft from a DMS doc */
export type HrInsuranceDraft = {
  documentId: number;
  documentTitle: string;
  insurance_provider: string;
  tpa: string;
  policy_number: string;
  insurance_card_number: string;
  network_class: string;
  issue_date: string;
  expiry_date: string;
  employee_covered: boolean;
  dependent_coverage_included: boolean;
  dependent_count_covered: number | null;
  notes: string;
};

/** Review payload for a dependent draft from DMS docs */
export type HrDependentDraft = {
  documentIds: number[];
  documentTitles: string[];
  dependent_name_en: string;
  dependent_name_ar: string;
  relationship_type_id: number | null;
  date_of_birth: string;
  nationality_id: number | null;
  nationality_name: string;
  passport_number: string;
  passport_expiry: string;
  emirates_id_number: string;
  emirates_id_expiry: string;
  residence_visa_number: string;
  residence_visa_expiry: string;
  medical_insurance_provider: string;
  medical_insurance_policy: string;
  medical_insurance_card: string;
  medical_insurance_expiry: string;
  sponsored_by: string;
  notes: string;
};

// ── Zod schemas for HR.14B save inputs ────────────────────────────────────────

export const createIdentityDocFromDmsInputSchema = z.object({
  employee_id: z.number().int().positive(),
  dms_document_id: z.number().int().positive(),
  document_type_id: z.number().int().positive("Document type is required"),
  document_number: z.string().min(1, "Document number is required"),
  issue_date: z.string().nullish(),
  expiry_date: z.string().nullish(),
  issuing_authority: z.string().nullish(),
  issue_country_id: z.number().int().positive().nullish(),
  issuing_emirate_id: z.number().int().positive().nullish(),
  uid_number: z.string().nullish(),
  visa_file_number: z.string().nullish(),
  labour_card_number: z.string().nullish(),
  work_permit_number: z.string().nullish(),
  mohre_person_code: z.string().nullish(),
  profession_on_document: z.string().nullish(),
  emirates_id_application_no: z.string().nullish(),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  notes: z.string().nullish(),
  totalDocumentsSelected: z.number().int().min(1).default(1),
});

export type CreateIdentityDocFromDmsInput = z.infer<typeof createIdentityDocFromDmsInputSchema>;

export const createInsuranceFromDmsInputSchema = z.object({
  employee_id: z.number().int().positive(),
  dms_document_id: z.number().int().positive(),
  insurance_provider: z.string().min(1, "Provider is required"),
  tpa: z.string().nullish(),
  policy_number: z.string().min(1, "Policy number is required"),
  insurance_card_number: z.string().nullish(),
  network_class: z.string().nullish(),
  issue_date: z.string().nullish(),
  expiry_date: z.string().min(1, "Expiry date is required"),
  employee_covered: z.boolean().default(true),
  dependent_coverage_included: z.boolean().default(false),
  dependent_count_covered: z.number().int().min(0).nullish(),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  notes: z.string().nullish(),
  totalDocumentsSelected: z.number().int().min(1).default(1),
});

export type CreateInsuranceFromDmsInput = z.infer<typeof createInsuranceFromDmsInputSchema>;

export const createDependentFromDmsInputSchema = z.object({
  employee_id: z.number().int().positive(),
  dms_document_ids: z.array(z.number().int().positive()).min(1),
  dependent_name_en: z.string().min(1, "Name is required"),
  dependent_name_ar: z.string().nullish(),
  relationship_type_id: z.number().int().positive("Relationship is required"),
  date_of_birth: z.string().nullish(),
  nationality_id: z.number().int().positive().nullish(),
  passport_number: z.string().nullish(),
  passport_expiry: z.string().nullish(),
  emirates_id_number: z.string().nullish(),
  emirates_id_expiry: z.string().nullish(),
  residence_visa_number: z.string().nullish(),
  residence_visa_expiry: z.string().nullish(),
  medical_insurance_provider: z.string().nullish(),
  medical_insurance_policy: z.string().nullish(),
  medical_insurance_card: z.string().nullish(),
  medical_insurance_expiry: z.string().nullish(),
  sponsored_by: z.string().nullish(),
  is_active: z.boolean().default(true),
  notes: z.string().nullish(),
  totalDocumentsSelected: z.number().int().min(1).default(1),
});

export type CreateDependentFromDmsInput = z.infer<typeof createDependentFromDmsInputSchema>;

