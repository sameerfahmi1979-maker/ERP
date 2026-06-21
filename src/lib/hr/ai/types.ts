/**
 * HR.12 — HR AI Integration
 * HR AI Output Types and Zod Schemas
 *
 * All HR AI actions return structured output matching these types.
 * Schemas are used to validate AI responses before displaying to user.
 * Human review is required before any data is copied/applied.
 */

import { z } from "zod";

// ── Feature flag codes ────────────────────────────────────────────────────────

export const HR_AI_FEATURE_FLAGS = {
  EMPLOYEE_ASSIST: "ERP_AI_HR_EMPLOYEE_ASSIST",
  FILL:            "ERP_AI_HR_FILL",
  CORRECTIONS:     "ERP_AI_HR_CORRECTIONS",
  DUPLICATES:      "ERP_AI_HR_DUPLICATES",
  SEARCH_ASSIST:   "ERP_AI_HR_SEARCH_ASSIST",
  COMPLIANCE_EXPLAIN: "ERP_AI_HR_COMPLIANCE_EXPLAIN",
  READINESS_EXPLAIN:  "ERP_AI_HR_READINESS_EXPLAIN",
  LETTER_DRAFT:    "ERP_AI_HR_LETTER_DRAFT",
  EMAIL_DRAFT:     "ERP_AI_HR_EMAIL_DRAFT",
} as const;

export type HrAiFeatureFlagCode = (typeof HR_AI_FEATURE_FLAGS)[keyof typeof HR_AI_FEATURE_FLAGS];

// ── Common result wrapper ──────────────────────────────────────────────────────

export type HrAiActionResult<T> =
  | { success: true; data: T; featureDisabled?: false }
  | { success: false; error: string; featureDisabled?: boolean };

// ── 1. HR AI Field Suggestion (Fill from Documents) ────────────────────────────

export const HrAiFieldSuggestionSchema = z.object({
  fieldName:       z.string().min(1).max(100),
  fieldLabel:      z.string().min(1).max(200),
  currentValue:    z.string().nullable(),
  suggestedValue:  z.string().max(1000),
  confidence:      z.number().min(0).max(1),
  sourceDocumentId: z.number().nullable().optional(),
  sourceDocumentName: z.string().nullable().optional(),
  reason:          z.string().max(500),
  isConflict:      z.boolean(),
  requiresReview:  z.boolean(),
});

export const HrAiDocumentFillOutputSchema = z.object({
  suggestions: z.array(HrAiFieldSuggestionSchema).max(30),
  documentsReviewed: z.number().int().min(0),
  warning: z.string().nullable().optional(),
});

export type HrAiFieldSuggestion = z.infer<typeof HrAiFieldSuggestionSchema>;
export type HrAiDocumentFillOutput = z.infer<typeof HrAiDocumentFillOutputSchema>;

// ── 1b. HR Identity Document Prefill (from DMS) ───────────────────────────────

export const HrIdentityDocumentPrefillFieldsSchema = z.object({
  document_type_code: z.string().max(50).nullable().optional(),
  document_number: z.string().max(200).nullable().optional(),
  issue_date: z.string().max(20).nullable().optional(),
  expiry_date: z.string().max(20).nullable().optional(),
  issuing_authority: z.string().max(300).nullable().optional(),
  place_of_issue: z.string().max(300).nullable().optional(),
  country_name: z.string().max(200).nullable().optional(),
  emirate_name: z.string().max(200).nullable().optional(),
  city_name: z.string().max(200).nullable().optional(),
  emirates_id_application_no: z.string().max(100).nullable().optional(),
  visa_file_number: z.string().max(100).nullable().optional(),
  uid_number: z.string().max(100).nullable().optional(),
  labour_card_number: z.string().max(100).nullable().optional(),
  work_permit_number: z.string().max(100).nullable().optional(),
  mohre_person_code: z.string().max(100).nullable().optional(),
  profession_on_document: z.string().max(300).nullable().optional(),
});

export const HrIdentityDocumentPrefillOutputSchema = z.object({
  fields: HrIdentityDocumentPrefillFieldsSchema,
  field_confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
  warning: z.string().max(500).nullable().optional(),
});

export type HrIdentityDocumentPrefillFields = z.infer<typeof HrIdentityDocumentPrefillFieldsSchema>;
export type HrIdentityDocumentPrefillOutput = z.infer<typeof HrIdentityDocumentPrefillOutputSchema>;

// ── 1c. HR Medical Insurance Prefill (from DMS) ───────────────────────────────

export const HrMedicalInsurancePrefillFieldsSchema = z.object({
  insurance_provider: z.string().max(300).nullable().optional(),
  tpa: z.string().max(200).nullable().optional(),
  policy_number: z.string().max(200).nullable().optional(),
  insurance_card_number: z.string().max(200).nullable().optional(),
  network_class: z.string().max(200).nullable().optional(),
  issue_date: z.string().max(20).nullable().optional(),
  expiry_date: z.string().max(20).nullable().optional(),
  employee_covered: z.boolean().nullable().optional(),
  dependent_coverage_included: z.boolean().nullable().optional(),
  dependent_count_covered: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const HrMedicalInsurancePrefillOutputSchema = z.object({
  fields: HrMedicalInsurancePrefillFieldsSchema,
  field_confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
  warning: z.string().max(500).nullable().optional(),
});

export type HrMedicalInsurancePrefillOutput = z.infer<typeof HrMedicalInsurancePrefillOutputSchema>;

// ── 1d. HR Dependent Prefill (from DMS) ───────────────────────────────────────

export const HrDependentPrefillFieldsSchema = z.object({
  dependent_name_en: z.string().max(300).nullable().optional(),
  dependent_name_ar: z.string().max(300).nullable().optional(),
  date_of_birth: z.string().max(20).nullable().optional(),
  nationality_name: z.string().max(200).nullable().optional(),
  passport_number: z.string().max(100).nullable().optional(),
  passport_expiry: z.string().max(20).nullable().optional(),
  emirates_id_number: z.string().max(50).nullable().optional(),
  emirates_id_expiry: z.string().max(20).nullable().optional(),
  residence_visa_number: z.string().max(100).nullable().optional(),
  residence_visa_expiry: z.string().max(20).nullable().optional(),
  medical_insurance_provider: z.string().max(300).nullable().optional(),
  medical_insurance_policy: z.string().max(200).nullable().optional(),
  medical_insurance_card: z.string().max(200).nullable().optional(),
  medical_insurance_expiry: z.string().max(20).nullable().optional(),
  sponsored_by: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const HrDependentPrefillOutputSchema = z.object({
  fields: HrDependentPrefillFieldsSchema,
  field_confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
  warning: z.string().max(500).nullable().optional(),
});

export type HrDependentPrefillOutput = z.infer<typeof HrDependentPrefillOutputSchema>;

export type IdentityDocumentPrefillResult = {
  form: {
    dms_document_id: number;
    document_type_id: number | null;
    document_number: string;
    issue_date: string;
    expiry_date: string;
    issuing_authority_party_id: number | null;
    issue_country_id: number | null;
    issuing_emirate_id: number | null;
    issue_city_id: number | null;
    status: string;
    verification_status: string;
    renewal_status: string;
    sponsor_company_id: number | null;
    notes: string;
    emirates_id_application_no: string;
    visa_file_number: string;
    uid_number: string;
    labour_card_number: string;
    work_permit_number: string;
    mohre_person_code: string;
    profession_on_document: string;
  };
  fieldConfidence: Record<string, number>;
  sourceDocument: {
    id: number;
    title: string;
    document_no: string;
    document_type_code: string | null;
    document_type_name: string | null;
  };
  prefillSource: "extraction" | "extraction_and_ai" | "document_metadata" | "ai_only";
  warning: string | null;
  alreadyLinked: boolean;
  linkedToEmployee: boolean;
};

// ── 2. HR AI Correction Suggestion ────────────────────────────────────────────

export const HrAiCorrectionSuggestionSchema = z.object({
  severity:   z.enum(["critical", "high", "medium", "low", "info"]),
  category:   z.string().max(100),
  fieldOrTable: z.string().max(200),
  currentValue: z.string().nullable().optional(),
  recommendedAction: z.string().max(500),
  reason:     z.string().max(500),
  source:     z.string().max(200).optional(),
  isApplyable: z.boolean(),
});

export const HrAiCorrectionOutputSchema = z.object({
  suggestions: z.array(HrAiCorrectionSuggestionSchema).max(25),
  overallHealthScore: z.number().min(0).max(100).nullable().optional(),
  summary: z.string().max(600),
});

export type HrAiCorrectionSuggestion = z.infer<typeof HrAiCorrectionSuggestionSchema>;
export type HrAiCorrectionOutput = z.infer<typeof HrAiCorrectionOutputSchema>;

// ── 3. HR AI Duplicate Suggestion ─────────────────────────────────────────────

export const HrAiDuplicateSuggestionSchema = z.object({
  possibleDuplicateType: z.enum(["exact_match", "fuzzy_name", "same_id_doc", "candidate_link"]),
  recordAType: z.string(),
  recordAId:   z.number().int(),
  recordALabel: z.string().max(200),
  recordBType: z.string(),
  recordBId:   z.number().int(),
  recordBLabel: z.string().max(200),
  matchedFields: z.array(z.string()),
  confidence:  z.number().min(0).max(1),
  reason:      z.string().max(500),
  recommendedAction: z.string().max(300),
});

export const HrAiDuplicateOutputSchema = z.object({
  duplicates: z.array(HrAiDuplicateSuggestionSchema).max(10),
  checksPerformed: z.array(z.string()),
  summary: z.string().max(500),
});

export type HrAiDuplicateSuggestion = z.infer<typeof HrAiDuplicateSuggestionSchema>;
export type HrAiDuplicateOutput = z.infer<typeof HrAiDuplicateOutputSchema>;

// ── 4. HR AI Search Suggestion ────────────────────────────────────────────────

export const HrAiSearchSuggestionSchema = z.object({
  interpretedIntent: z.string().max(400),
  proposedFilters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  targetArea: z.enum(["employees", "candidates", "compliance", "time", "payroll", "operations", "actions", "onboarding"]),
  targetReportCode: z.string().nullable().optional(),
  warning: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export type HrAiSearchSuggestion = z.infer<typeof HrAiSearchSuggestionSchema>;

// ── 5. HR AI Compliance Explanation ───────────────────────────────────────────

export const HrAiComplianceExplanationSchema = z.object({
  summary: z.string().max(800),
  blockingItems: z.array(z.object({
    item: z.string().max(300),
    reason: z.string().max(300),
    priority: z.enum(["critical", "high", "medium"]),
  })).max(15),
  warningItems: z.array(z.object({
    item: z.string().max(300),
    reason: z.string().max(300),
  })).max(15),
  recommendedNextSteps: z.array(z.string().max(300)).max(8),
  overallComplianceLevel: z.enum(["compliant", "partial", "non_compliant", "unknown"]),
});

export type HrAiComplianceExplanation = z.infer<typeof HrAiComplianceExplanationSchema>;

// ── 6. HR AI Readiness Explanation ────────────────────────────────────────────

export const HrAiReadinessExplanationSchema = z.object({
  overallStatus: z.enum(["ready", "not_ready", "blocked", "expired", "needs_review", "unknown"]),
  summary: z.string().max(800),
  blockingItems: z.array(z.object({
    item: z.string().max(300),
    reason: z.string().max(300),
    priority: z.enum(["critical", "high", "medium"]),
  })).max(15),
  recommendedNextSteps: z.array(z.string().max(300)).max(8),
  estimatedClearanceSteps: z.number().int().min(0).max(20).nullable().optional(),
});

export type HrAiReadinessExplanation = z.infer<typeof HrAiReadinessExplanationSchema>;

// ── 7. HR AI Draft Output (Letters / Emails) ──────────────────────────────────

export const HrAiDraftOutputSchema = z.object({
  draftType: z.enum([
    "noc", "salary_certificate", "experience_letter",
    "warning_letter", "hr_email", "offer_followup",
    "missing_document_reminder", "general",
  ]),
  subject:        z.string().max(300).nullable().optional(),
  draftText:      z.string().max(4000),
  sourceContextUsed: z.array(z.string().max(200)).max(10),
  warning:        z.string().max(400).nullable().optional(),
  requiresPayrollView: z.boolean(),
  requiresActionsView: z.boolean(),
  isOfficialReady: z.boolean(),
});

export type HrAiDraftOutput = z.infer<typeof HrAiDraftOutputSchema>;

// ── 8. HR AI Activity Record ──────────────────────────────────────────────────

export interface HrAiActivityRecord {
  id: number;
  featureCode: string;
  entityType: string;
  entityId: number | null;
  inputContextType: string;
  redactionProfile: string;
  sensitiveDataIncluded: boolean;
  outputType: string;
  status: string;
  durationMs: number | null;
  createdAt: string;
  createdBy: number | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

// ── Draft type labels ─────────────────────────────────────────────────────────

export const HR_LETTER_TYPES = [
  { value: "noc", label: "NOC (No Objection Certificate)" },
  { value: "salary_certificate", label: "Salary Certificate" },
  { value: "experience_letter", label: "Experience Letter" },
  { value: "warning_letter", label: "Warning Letter" },
  { value: "hr_email", label: "HR Email" },
  { value: "offer_followup", label: "Offer Follow-up" },
  { value: "missing_document_reminder", label: "Missing Document Reminder" },
  { value: "general", label: "General HR Draft" },
] as const;
