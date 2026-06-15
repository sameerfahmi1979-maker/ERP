"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  createNumberingRuleSchema,
  updateNumberingRuleSchema,
  type CreateNumberingRuleInput,
  type UpdateNumberingRuleInput,
  type NumberingRule,
  type PreviewReferenceInput,
  type PreviewReferenceResult,
  type GenerateReferenceInput,
  type GenerateReferenceResult,
} from "@/features/numbering/numbering-types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Fetch all numbering rules
 */
export async function getNumberingRules(): Promise<ActionResult<NumberingRule[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_numbering_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("getNumberingRules error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as NumberingRule[] };
  } catch (error) {
    console.error("getNumberingRules exception", error);
    return { success: false, error: "Failed to fetch numbering rules" };
  }
}

/**
 * Fetch a single numbering rule by ID
 */
export async function getNumberingRuleById(id: number): Promise<ActionResult<NumberingRule>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_numbering_rules")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getNumberingRuleById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as NumberingRule };
  } catch (error) {
    console.error("getNumberingRuleById exception", error);
    return { success: false, error: "Failed to fetch numbering rule" };
  }
}

/**
 * Create a new numbering rule
 */
export async function createNumberingRule(
  input: CreateNumberingRuleInput
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createNumberingRuleSchema.safeParse(input);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return { success: false, error: errors };
    }

    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.manage")) {
      return { success: false, error: "Permission denied" };
    }

    // 3. Create numbering rule
    const supabase = await createClient();

    const dataToInsert = {
      ...validated,
      current_sequence_number: 0,
      next_sequence_number: validated.starting_sequence_number,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("global_numbering_rules")
      .insert(dataToInsert)
      .select("id, rule_code")
      .single();

    if (error) {
      console.error("createNumberingRule error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "numbering",
      entity_name: "global_numbering_rules",
      entity_id: data.id,
      entity_reference: data.rule_code,
      action: "create",
      new_values: dataToInsert,
    });

    revalidatePath("/admin/settings/numbering");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createNumberingRule exception", error);
    return { success: false, error: "Failed to create numbering rule" };
  }
}

/**
 * Update an existing numbering rule
 */
export async function updateNumberingRule(
  input: UpdateNumberingRuleInput
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateNumberingRuleSchema.safeParse(input);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return { success: false, error: errors };
    }

    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.manage")) {
      return { success: false, error: "Permission denied" };
    }

    // 3. Fetch existing rule to check if locked
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_numbering_rules")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Numbering rule not found" };
    }

    // 4. Check if locked (only admins with lock permission can edit locked rules)
    if (existing.is_locked && !hasPermission(ctx, "numbering.rules.lock")) {
      return { success: false, error: "Cannot edit locked numbering rule without lock permission" };
    }

    // 5. Update numbering rule
    const dataToUpdate = {
      ...updates,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("global_numbering_rules")
      .update(dataToUpdate)
      .eq("id", id)
      .select("id, rule_code")
      .single();

    if (error) {
      console.error("updateNumberingRule error", error);
      return { success: false, error: error.message };
    }

    // 6. Log audit
    const changes = createAuditDiff(existing, { ...existing, ...dataToUpdate });
    await logAudit({
      module_code: "numbering",
      entity_name: "global_numbering_rules",
      entity_id: id,
      entity_reference: data.rule_code,
      action: "update",
      old_values: existing,
      new_values: { ...existing, ...dataToUpdate },
    });

    revalidatePath("/admin/settings/numbering");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("updateNumberingRule exception", error);
    return { success: false, error: "Failed to update numbering rule" };
  }
}

/**
 * Toggle active status of a numbering rule
 */
export async function toggleNumberingRuleActive(
  id: number,
  isActive: boolean
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.manage")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_numbering_rules")
      .update({ is_active: isActive, updated_by: ctx.profile?.id ?? null })
      .eq("id", id)
      .select("id, rule_code")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "numbering",
      entity_name: "global_numbering_rules",
      entity_id: id,
      entity_reference: data.rule_code,
      action: isActive ? "activate" : "deactivate",
      old_values: { is_active: !isActive },
      new_values: { is_active: isActive },
    });

    revalidatePath("/admin/settings/numbering");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("toggleNumberingRuleActive exception", error);
    return { success: false, error: "Failed to toggle rule status" };
  }
}

/**
 * Toggle lock status of a numbering rule (requires lock permission)
 */
export async function toggleNumberingRuleLock(
  id: number,
  isLocked: boolean
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.lock")) {
      return { success: false, error: "Permission denied - lock permission required" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_numbering_rules")
      .update({ is_locked: isLocked, updated_by: ctx.profile?.id ?? null })
      .eq("id", id)
      .select("id, rule_code")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "numbering",
      entity_name: "global_numbering_rules",
      entity_id: id,
      entity_reference: data.rule_code,
      action: isLocked ? "lock" : "unlock",
      old_values: { is_locked: !isLocked },
      new_values: { is_locked: isLocked },
    });

    revalidatePath("/admin/settings/numbering");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("toggleNumberingRuleLock exception", error);
    return { success: false, error: "Failed to toggle rule lock" };
  }
}

// ============================================================================
// PREVIEW & GENERATION
// ============================================================================

/**
 * Preview the next reference number without consuming sequence
 */
export async function previewNextReference(
  input: PreviewReferenceInput
): Promise<ActionResult<PreviewReferenceResult>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.preview")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("preview_next_reference_number", {
      p_rule_code: input.ruleCode ?? null,
      p_document_type_code: input.documentTypeCode ?? null,
      p_next_sequence_number: input.nextSequenceNumber ?? null,
    });

    if (error) {
      console.error("previewNextReference error", error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: "No active rule found" };
    }

    const preview = data[0];
    return {
      success: true,
      data: {
        previewReferenceNumber: preview.preview_reference_number,
        documentPrefix: preview.document_prefix,
        sequenceNumber: preview.sequence_number,
        formatTemplate: preview.format_template,
        ruleId: preview.rule_id,
      },
    };
  } catch (error) {
    console.error("previewNextReference exception", error);
    return { success: false, error: "Failed to preview reference number" };
  }
}

/**
 * Generate and consume the next reference number
 */
export async function generateNextReference(
  input: GenerateReferenceInput
): Promise<ActionResult<GenerateReferenceResult>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "numbering.rules.generate")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("generate_next_reference_number", {
      p_rule_code: input.ruleCode ?? null,
      p_document_type_code: input.documentTypeCode ?? null,
      p_target_table_name: input.targetTableName ?? null,
      p_target_record_id: input.targetRecordId ?? null,
      p_generation_reason: input.generationReason ?? null,
      p_generated_by: ctx.profile?.id ?? null,
    });

    if (error) {
      console.error("generateNextReference error", error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: "Failed to generate reference number" };
    }

    const generated = data[0];

    await logAudit({
      module_code: "numbering",
      entity_name: "global_numbering_generated_references",
      entity_id: generated.numbering_rule_id,
      entity_reference: generated.generated_reference_number,
      action: "generate",
      new_values: generated,
    });

    revalidatePath("/admin/settings/numbering");

    return {
      success: true,
      data: {
        generatedReferenceNumber: generated.generated_reference_number,
        generatedSequenceNumber: generated.generated_sequence_number,
        numberingRuleId: generated.numbering_rule_id,
        sequenceStateId: generated.sequence_state_id,
        generationStatus: generated.generation_status,
      },
    };
  } catch (error) {
    console.error("generateNextReference exception", error);
    return { success: false, error: "Failed to generate reference number" };
  }
}
