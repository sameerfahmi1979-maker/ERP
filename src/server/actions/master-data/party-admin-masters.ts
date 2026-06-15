"use server";

/**
 * Server actions for Party Master admin lookup tables.
 * Phase ERP BASE 002F.5A.3
 * Tables: party_types, party_service_categories_master, party_relationship_types
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import type { ActionResult } from "@/features/master-data/parties/party-types";

const REVALIDATE_PATH = "/admin/master-data/parties";

// ─── Party Types ──────────────────────────────────────────────────────────────

const partyTypeSchema = z.object({
  type_code: z.string().min(1).regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores"),
  type_name: z.string().min(1),
  type_name_ar: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  icon_name: z.string().nullable().optional(),
  color_token: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export type PartyTypeAdminRow = {
  id: number;
  type_code: string;
  type_name: string;
  type_name_ar: string | null;
  description: string | null;
  icon_name: string | null;
  color_token: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function getPartyTypesAdmin(): Promise<ActionResult<PartyTypeAdminRow[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_types")
      .select("*")
      .order("sort_order")
      .order("type_name");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as PartyTypeAdminRow[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createPartyType(input: z.infer<typeof partyTypeSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = partyTypeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_types")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_types")
      .insert({ ...parsed.data, is_system: false, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_types", entity_id: data.id, entity_reference: parsed.data.type_code, action: "create", new_values: parsed.data });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updatePartyType(id: number, input: Partial<z.infer<typeof partyTypeSchema>>): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_types")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_types").select("type_code, is_system").eq("id", id).single();
    if (old?.is_system && input.type_code && input.type_code !== old.type_code) {
      return { success: false, error: "Cannot change code of system party type" };
    }

    const { error } = await supabase.from("party_types").update({ ...input, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_types", entity_id: id, entity_reference: old?.type_code ?? String(id), action: "update", new_values: input });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function togglePartyTypeActive(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_types")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data: row } = await supabase.from("party_types").select("is_active, is_system, type_code").eq("id", id).single();
    if (!row) return { success: false, error: "Not found" };

    if (row.is_system && row.is_active) {
      // Check if any active assignments
      const { count } = await supabase.from("party_type_assignments").select("id", { count: "exact", head: true }).eq("party_type_id", id).eq("is_active", true);
      if (count && count > 0) return { success: false, error: `Cannot deactivate: ${count} active party assignment(s) use this type.` };
    }

    const { error } = await supabase.from("party_types").update({ is_active: !row.is_active, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Party Service Categories ─────────────────────────────────────────────────

const serviceCategorySchema = z.object({
  category_code: z.string().min(1).regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores"),
  category_name_en: z.string().min(1),
  category_name_ar: z.string().nullable().optional(),
  parent_category_id: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export type ServiceCategoryAdminRow = {
  id: number;
  category_code: string;
  category_name_en: string;
  category_name_ar: string | null;
  parent_category_id: number | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  parent_name?: string | null;
};

export async function getServiceCategoriesAdmin(): Promise<ActionResult<ServiceCategoryAdminRow[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_service_categories_master")
      .select("*, parent:party_service_categories_master!parent_category_id(category_name_en)")
      .order("sort_order")
      .order("category_name_en");
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      ...(row as ServiceCategoryAdminRow),
      parent_name: (row.parent as { category_name_en?: string } | null)?.category_name_en ?? null,
    }));
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createServiceCategory(input: z.infer<typeof serviceCategorySchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = serviceCategorySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_services")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_service_categories_master")
      .insert({ ...parsed.data, is_system: false, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_service_categories_master", entity_id: data.id, entity_reference: parsed.data.category_code, action: "create", new_values: parsed.data });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updateServiceCategory(id: number, input: Partial<z.infer<typeof serviceCategorySchema>>): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_services")) return { success: false, error: "Permission denied" };

    if (input.parent_category_id === id) return { success: false, error: "A category cannot be its own parent" };

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_service_categories_master").select("category_code").eq("id", id).single();
    const { error } = await supabase.from("party_service_categories_master").update({ ...input, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_service_categories_master", entity_id: id, entity_reference: old?.category_code ?? String(id), action: "update", new_values: input });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── Party Relationship Types ─────────────────────────────────────────────────

const relationshipTypeSchema = z.object({
  relationship_code: z.string().min(1).regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores"),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export type RelationshipTypeAdminRow = {
  id: number;
  relationship_code: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function getRelationshipTypesAdmin(): Promise<ActionResult<RelationshipTypeAdminRow[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_relationship_types")
      .select("*")
      .order("sort_order")
      .order("name_en");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as RelationshipTypeAdminRow[] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function createRelationshipType(input: z.infer<typeof relationshipTypeSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = relationshipTypeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_relationships")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("party_relationship_types")
      .insert({ ...parsed.data, is_system: false, created_by: ctx.profile?.id, updated_by: ctx.profile?.id })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_relationship_types", entity_id: data.id, entity_reference: parsed.data.relationship_code, action: "create", new_values: parsed.data });
    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function updateRelationshipType(id: number, input: Partial<z.infer<typeof relationshipTypeSchema>>): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.parties.manage_relationships")) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data: old } = await supabase.from("party_relationship_types").select("relationship_code").eq("id", id).single();
    const { error } = await supabase.from("party_relationship_types").update({ ...input, updated_by: ctx.profile?.id }).eq("id", id);
    if (error) return { success: false, error: error.message };

    await logAudit({ module_code: "MASTER_DATA", entity_name: "party_relationship_types", entity_id: id, entity_reference: old?.relationship_code ?? String(id), action: "update", new_values: input });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
