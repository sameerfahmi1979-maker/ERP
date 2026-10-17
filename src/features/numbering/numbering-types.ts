import { z } from "zod";
import {numberingTemplateError, numberingResetError} from '@/lib/numbering/format';

// ============================================================================
// DATABASE TYPES
// ============================================================================

export type NumberingRule = {
  id: number;
  workspace_revision?: number;
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

const templateSchema = z.string().superRefine((value,ctx)=>{
  const error=numberingTemplateError(value);
  if(error) ctx.addIssue({code:'custom',message:error});
});
const effectiveDate = z.union([z.iso.date(),z.iso.datetime({offset:true})]).optional().nullable();
function validateRuleRelations(value:{effective_from?:string|null;effective_to?:string|null;format_template?:string;reset_policy?:string},ctx:z.RefinementCtx){
  if(value.effective_from && value.effective_to && Date.parse(value.effective_to)<Date.parse(value.effective_from))
    ctx.addIssue({code:'custom',path:['effective_to'],message:'Effective to must not precede effective from.'});
  if(value.format_template && value.reset_policy){
    const error=numberingResetError(value.format_template,value.reset_policy);
    if(error)ctx.addIssue({code:'custom',path:['format_template'],message:error});
  }
}

export const createNumberingRuleSchema = z.object({
  rule_code: z
    .string()
    .min(1, "Rule code is required")
    .max(100, "Rule code must be 100 characters or less")
    .regex(/^[A-Z0-9_]+$/, "Rule code must be uppercase alphanumeric with underscores"),
  rule_name: z.string().trim().min(1, "Rule name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  module_code: z.string().min(1, "Module code is required").max(50),
  module_name: z.string().trim().min(1, "Module name is required").max(200),
  document_type_code: z.string().min(1, "Document type code is required").max(100),
  document_type_name: z.string().trim().min(1, "Document type name is required").max(200),
  document_prefix: z
    .string()
    .min(1, "Document prefix is required")
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Document prefix must be uppercase alphanumeric")
    .transform((val) => val.toUpperCase()),
  separator: z.string().max(5).default("-"),
  format_template: templateSchema,
  sequence_length: z.number().int().min(1).max(12).default(4),
  padding_character: z.string().regex(/^[A-Za-z0-9]$/, 'Use one letter or digit for padding.').default("0"),
  starting_sequence_number: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1).default(1),
  reset_policy: z.enum(["never", "yearly", "monthly"]).default("never"),
  reserve_on_draft: z.boolean().default(false),
  reserve_on_submit: z.boolean().default(true),
  allow_manual_override: z.boolean().default(false),
  manual_override_requires_permission: z.boolean().default(true),
  allow_gaps: z.boolean().default(true),
  cancelled_number_policy: z.enum(["never_reuse", "allow_reuse"]).refine(v=>v==='never_reuse','Issued numbers must never be reused.').default("never_reuse"),
  duplicate_prevention_scope: z.string().max(100).default("document_type"),
  is_active: z.boolean().default(true),
  is_locked: z.boolean().default(false),
  effective_from: effectiveDate,
  effective_to: effectiveDate,
  notes: z.string().max(1000).optional().nullable(),
}).superRefine(validateRuleRelations);

export const updateNumberingRuleSchema = z.object({
  id: z.number().int().positive(),
  rule_code: z
    .string()
    .min(1, "Rule code is required")
    .max(100)
    .regex(/^[A-Z0-9_]+$/, "Rule code must be uppercase alphanumeric")
    .optional(),
  rule_name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  module_code: z.string().min(1).max(50).optional(),
  module_name: z.string().trim().min(1).max(200).optional(),
  document_type_code: z.string().min(1).max(100).optional(),
  document_type_name: z.string().trim().min(1).max(200).optional(),
  document_prefix: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_]+$/)
    .transform((val) => val.toUpperCase())
    .optional(),
  separator: z.string().max(5).optional(),
  format_template: templateSchema.optional(),
  sequence_length: z.number().int().min(1).max(12).optional(),
  padding_character: z.string().regex(/^[A-Za-z0-9]$/).optional(),
  starting_sequence_number: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1).optional(),
  reset_policy: z.enum(["never", "yearly", "monthly"]).optional(),
  reserve_on_draft: z.boolean().optional(),
  reserve_on_submit: z.boolean().optional(),
  allow_manual_override: z.boolean().optional(),
  manual_override_requires_permission: z.boolean().optional(),
  allow_gaps: z.boolean().optional(),
  cancelled_number_policy: z.enum(["never_reuse", "allow_reuse"]).refine(v=>v==='never_reuse','Issued numbers must never be reused.').optional(),
  duplicate_prevention_scope: z.string().max(100).optional(),
  is_active: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  effective_from: effectiveDate,
  effective_to: effectiveDate,
  notes: z.string().max(1000).optional().nullable(),
}).superRefine(validateRuleRelations);

export type CreateNumberingRuleInput = z.infer<typeof createNumberingRuleSchema>;
export type UpdateNumberingRuleInput = z.infer<typeof updateNumberingRuleSchema>;

// ============================================================================
// PREVIEW/GENERATION TYPES
// ============================================================================

export type PreviewReferenceInput = {
  ruleId?: number;
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
  /** Required for replay-safe callers; legacy party consumers await F06-T01 adoption. */
  operationId?: string;
  ruleId?: number;
  ruleCode?: string;
  documentTypeCode?: string;
  targetTableName?: string;
  targetRecordId?: number;
  generationReason?: string;
};

export type GenerateReferenceResult = {
  id?: number;
  replayed?: boolean;
  generatedReferenceNumber: string;
  generatedSequenceNumber: number;
  numberingRuleId: number;
  sequenceStateId: number;
  generationStatus: string;
};
