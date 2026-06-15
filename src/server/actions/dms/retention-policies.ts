"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { ALLOWED_ACTIONS_ON_EXPIRY } from "@/features/dms/admin/dms-constants";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsRetentionPolicyRow = {
  id: number;
  policy_code: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  retain_for_days: number | null;
  action_on_expiry: string;
  applies_to_types: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const retentionPolicySchema = z.object({
  policy_code: z
    .string()
    .min(1, "Policy code is required")
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores only"),
  name_en: z.string().min(1, "English name is required").max(255),
  name_ar: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  retain_for_days: z.number().int().positive("Retention days must be positive").nullable().optional(),
  action_on_expiry: z.enum(ALLOWED_ACTIONS_ON_EXPIRY).default("notify"),
  applies_to_types: z.array(z.number().int().positive()).default([]),
  is_active: z.boolean().default(true),
});

export type CreateDmsRetentionPolicyInput = z.infer<typeof retentionPolicySchema>;

function revalidateDmsRetentionPaths() {
  revalidatePath("/admin/dms");
  revalidatePath("/admin/dms/retention-policies");
}

export async function getDmsRetentionPolicies(): Promise<ActionResult<DmsRetentionPolicyRow[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_retention_policies")
      .select("*")
      .is("deleted_at", null)
      .order("name_en", { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as DmsRetentionPolicyRow[] };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getDmsRetentionPolicy(id: number): Promise<ActionResult<DmsRetentionPolicyRow>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_retention_policies")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as DmsRetentionPolicyRow };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createDmsRetentionPolicy(
  input: CreateDmsRetentionPolicyInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = retentionPolicySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_retention_policies")
      .insert({
        ...parsed.data,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_retention_policies",
      entity_id: data.id,
      entity_reference: parsed.data.policy_code,
      action: "DMS_RETENTION_POLICY_CREATED",
      new_values: parsed.data,
    });
    revalidateDmsRetentionPaths();
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateDmsRetentionPolicy(
  id: number,
  input: Partial<CreateDmsRetentionPolicyInput>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_retention_policies").select("policy_code").eq("id", id).single();
    const { error } = await supabase
      .from("dms_retention_policies")
      .update({ ...input, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_retention_policies", entity_id: id, entity_reference: existing?.policy_code ?? String(id), action: "DMS_RETENTION_POLICY_UPDATED", new_values: input });
    revalidateDmsRetentionPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function activateDmsRetentionPolicy(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_retention_policies").select("policy_code").eq("id", id).single();
    const { error } = await supabase.from("dms_retention_policies").update({ is_active: true, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_retention_policies", entity_id: id, entity_reference: existing?.policy_code ?? String(id), action: "DMS_RETENTION_POLICY_ACTIVATED" });
    revalidateDmsRetentionPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deactivateDmsRetentionPolicy(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.manage_types")) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_retention_policies").select("policy_code").eq("id", id).single();
    const { error } = await supabase.from("dms_retention_policies").update({ is_active: false, updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_retention_policies", entity_id: id, entity_reference: existing?.policy_code ?? String(id), action: "DMS_RETENTION_POLICY_DEACTIVATED" });
    revalidateDmsRetentionPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteDmsRetentionPolicy(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied — requires dms.admin" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("dms_retention_policies").select("policy_code").eq("id", id).single();
    const { count } = await supabase.from("dms_documents").select("id", { count: "exact", head: true }).eq("reminder_policy_id", id).is("deleted_at", null);
    if ((count ?? 0) > 0) return { success: false, error: "Retention policy is assigned to documents — deactivate instead" };
    const { error } = await supabase.from("dms_retention_policies").update({ deleted_at: new Date().toISOString(), updated_by: ctx.profile?.id ?? null }).eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "DMS", entity_name: "dms_retention_policies", entity_id: id, entity_reference: existing?.policy_code ?? String(id), action: "DMS_RETENTION_POLICY_DELETED" });
    revalidateDmsRetentionPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
