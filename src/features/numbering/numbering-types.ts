import { z } from "zod";

// ============================================================================
// DATABASE TYPES
// ============================================================================

export type NumberingRule = {
  id: number;
  rule_code: string;
  rule_name: string;
  description: string | null;
  module_code: string;
  module_name: string;
  document_type_code: string;
  document_type_name: string;
  document_prefix: string;
  separator: string;
  format_template: string;
  sequence_length: number;
  padding_character: string;
  starting_sequence_number: number;
  current_sequence_number: number;
  next_sequence_number: number;
  reset_policy: "never" | "yearly" | "monthly";
  reserve_on_draft: boolean;
  reserve_on_submit: boolean;
  allow_manual_override: boolean;
  manual_override_requires_permission: boolean;
  allow_gaps: boolean;
  cancelled_number_policy: "never_reuse" | "allow_reuse";
  duplicate_prevention_scope: string;
  is_active: boolean;
  is_locked: boolean;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
};

export type SequenceState = {
  id: number;
  numbering_rule_id: number;
  module_code: string;
  document_type_code: string;
  document_prefix: string;
  reset_period_key: string;
  last_sequence_number: number;
  next_sequence_number: number;
  last_generated_reference: string | null;
  last_generated_at: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
};

export type GeneratedReference = {
  id: number;
  numbering_rule_id: number;
  sequence_state_id: number | null;
  generated_reference_number: string;
  generated_sequence_number: number;
  module_code: string;
  document_type_code: string;
  document_prefix: string;
  target_table_name: string | null;
  target_record_id: number | null;
  generation_status: "preview_only" | "reserved" | "consumed" | "cancelled" | "manual_override";
  generation_reason: string | null;
  reserved_at: string | null;
  consumed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  manual_override_used: boolean;
  manual_override_reason: string | null;
  generated_by: number | null;
  generated_at: string;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Supported format tokens (no company/branch/city/year/month)
const SUPPORTED_TOKENS = ["{DOC}", "{SEQ}", "{SEQ3}", "{SEQ4}", "{SEQ5}", "{SEQ6}", "{SEQ12}"];

// Unsupported tokens
const UNSUPPORTED_TOKENS = [
  "{COMPANY}",
  "{BRANCH}",
  "{CITY}",
  "{LOCATION}",
  "{YYYY}",
  "{YY}",
  "{MM}",
  "{DD}",
];

export const createNumberingRuleSchema = z.object({
  rule_code: z
    .string()
    .min(1, "Rule code is required")
    .max(100, "Rule code must be 100 characters or less")
    .regex(/^[A-Z0-9_]+$/, "Rule code must be uppercase alphanumeric with underscores"),
  rule_name: z.string().min(1, "Rule name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  module_code: z.string().min(1, "Module code is required").max(50),
  module_name: z.string().min(1, "Module name is required").max(200),
  document_type_code: z.string().min(1, "Document type code is required").max(100),
  document_type_name: z.string().min(1, "Document type name is required").max(200),
  document_prefix: z
    .string()
    .min(1, "Document prefix is required")
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Document prefix must be uppercase alphanumeric")
    .transform((val) => val.toUpperCase()),
  separator: z.string().max(5).default("-"),
  format_template: z
    .string()
    .min(1, "Format template is required")
    .max(100)
    .refine((val) => val.includes("{DOC}"), "Format template must include {DOC} token")
    .refine(
      (val) => SUPPORTED_TOKENS.some((token) => val.includes(token) && token !== "{DOC}"),
      "Format template must include at least one sequence token (e.g., {SEQ4})"
    )
    .refine(
      (val) => !UNSUPPORTED_TOKENS.some((token) => val.includes(token)),
      `Format template cannot include unsupported tokens: ${UNSUPPORTED_TOKENS.join(", ")}`
    ),
  sequence_length: z.number().int().min(1).max(12).default(4),
  padding_character: z.string().length(1).default("0"),
  starting_sequence_number: z.number().int().min(1).default(1),
  reset_policy: z.enum(["never", "yearly", "monthly"]).default("never"),
  reserve_on_draft: z.boolean().default(false),
  reserve_on_submit: z.boolean().default(true),
  allow_manual_override: z.boolean().default(false),
  manual_override_requires_permission: z.boolean().default(true),
  allow_gaps: z.boolean().default(true),
  cancelled_number_policy: z.enum(["never_reuse", "allow_reuse"]).default("never_reuse"),
  duplicate_prevention_scope: z.string().max(100).default("document_type"),
  is_active: z.boolean().default(true),
  is_locked: z.boolean().default(false),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateNumberingRuleSchema = z.object({
  id: z.number().int().positive(),
  rule_code: z
    .string()
    .min(1, "Rule code is required")
    .max(100)
    .regex(/^[A-Z0-9_]+$/, "Rule code must be uppercase alphanumeric")
    .optional(),
  rule_name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  module_code: z.string().min(1).max(50).optional(),
  module_name: z.string().min(1).max(200).optional(),
  document_type_code: z.string().min(1).max(100).optional(),
  document_type_name: z.string().min(1).max(200).optional(),
  document_prefix: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_]+$/)
    .transform((val) => val.toUpperCase())
    .optional(),
  separator: z.string().max(5).optional(),
  format_template: z
    .string()
    .min(1)
    .max(100)
    .refine((val) => val.includes("{DOC}"))
    .refine((val) => SUPPORTED_TOKENS.some((token) => val.includes(token) && token !== "{DOC}"))
    .refine((val) => !UNSUPPORTED_TOKENS.some((token) => val.includes(token)))
    .optional(),
  sequence_length: z.number().int().min(1).max(12).optional(),
  padding_character: z.string().length(1).optional(),
  starting_sequence_number: z.number().int().min(1).optional(),
  reset_policy: z.enum(["never", "yearly", "monthly"]).optional(),
  reserve_on_draft: z.boolean().optional(),
  reserve_on_submit: z.boolean().optional(),
  allow_manual_override: z.boolean().optional(),
  manual_override_requires_permission: z.boolean().optional(),
  allow_gaps: z.boolean().optional(),
  cancelled_number_policy: z.enum(["never_reuse", "allow_reuse"]).optional(),
  duplicate_prevention_scope: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreateNumberingRuleInput = z.infer<typeof createNumberingRuleSchema>;
export type UpdateNumberingRuleInput = z.infer<typeof updateNumberingRuleSchema>;

// ============================================================================
// PREVIEW/GENERATION TYPES
// ============================================================================

export type PreviewReferenceInput = {
  ruleCode?: string;
  documentTypeCode?: string;
  nextSequenceNumber?: number;
};

export type PreviewReferenceResult = {
  previewReferenceNumber: string;
  documentPrefix: string;
  sequenceNumber: number;
  formatTemplate: string;
  ruleId: number;
};

export type GenerateReferenceInput = {
  ruleCode?: string;
  documentTypeCode?: string;
  targetTableName?: string;
  targetRecordId?: number;
  generationReason?: string;
};

export type GenerateReferenceResult = {
  generatedReferenceNumber: string;
  generatedSequenceNumber: number;
  numberingRuleId: number;
  sequenceStateId: number;
  generationStatus: string;
};
