"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import type { ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

export type PartyServiceCategoryAssignment = {
  id: number;
  party_id: number;
  service_category_id: number;
  is_primary: boolean;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category_code?: string;
  category_name_en?: string;
};

export async function getPartyServiceCategoryAssignments(partyId: number): Promise<ActionResult<PartyServiceCategoryAssignment[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_service_category_assignments")
      .select("*, party_service_categories_master!service_category_id(category_code, category_name_en)")
      .eq("party_id", partyId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as PartyServiceCategoryAssignment),
      category_code: (row.party_service_categories_master as { category_code?: string } | null)?.category_code,
      category_name_en: (row.party_service_categories_master as { category_name_en?: string } | null)?.category_name_en,
    }));
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getServiceCategoriesForSelect(): Promise<ActionResult<{ id: number; category_code: string; category_name_en: string; parent_category_id: number | null }[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_service_categories_master")
      .select("id, category_code, category_name_en, parent_category_id")
      .eq("is_active", true)
      .order("sort_order")
      .order("category_name_en");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

const assignSchema = z.object({
  party_id: z.number().int().positive(),
  service_category_id: z.number().int().positive(),
  is_primary: z.boolean().default(false),
  remarks: z.string().nullable().optional(),
});

export async function addPartyServiceCategory(input: z.infer<typeof assignSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = assignSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_services")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    // Check for duplicate active
    const { count } = await supabase
      .from("party_service_category_assignments")
      .select("id", { count: "exact", head: true })
      .eq("party_id", parsed.data.party_id)
      .eq("service_category_id", parsed.data.service_category_id)
      .eq("is_active", true);
    if (count && count > 0) return { success: false, error: "This service category is already assigned to this party" };

    const { data, error } = await supabase
      .from("party_service_category_assignments")
      .insert({ ...parsed.data, is_active: true, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_service_category_assignments", entity_id: data.id, entity_reference: `party_${parsed.data.party_id}_svc_${parsed.data.service_category_id}`, action: "create", new_values: parsed.data });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function removePartyServiceCategory(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_services")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { error } = await supabase.from("party_service_category_assignments").update({ is_active: false, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_service_category_assignments", entity_id: id, entity_reference: String(id), action: "deactivate" });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
