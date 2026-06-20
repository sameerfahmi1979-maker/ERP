"use server";

/**
 * Server Actions for Global Lookup / Dropdown Engine
 * Phase 002F.3B
 * 
 * Includes:
 * - CRUD operations for categories and values
 * - Safe dropdown loading service for normal users
 * - Admin management operations
 * - Audit logging for all mutations
 */

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";

function revalidateLookupPages() {
  revalidatePath("/admin/master-data");
  revalidatePath("/admin/master-data/lookups/categories");
  revalidatePath("/admin/master-data/lookups/values");
  revalidatePath("/admin/master-data/lookups/system");
}
import {
  createLookupCategorySchema,
  updateLookupCategorySchema,
  createLookupValueSchema,
  updateLookupValueSchema,
  toggleLookupStatusSchema,
  toggleLookupLockSchema,
  setDefaultValueSchema,
  type CreateLookupCategoryInput,
  type UpdateLookupCategoryInput,
  type CreateLookupValueInput,
  type UpdateLookupValueInput,
} from "@/features/master-data/lookups/validation";
import type {
  LookupCategory,
  LookupValue,
  LookupCategoryWithStats,
  LookupValueWithCategory,
  LookupCategoryFilters,
  LookupValueFilters,
  LookupDashboardStats,
} from "@/features/master-data/lookups/types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// LOOKUP CATEGORIES - CRUD OPERATIONS
// ============================================================================

/**
 * List all lookup categories with optional filters
 * Requires: master_data.lookups.view permission
 */
export async function listLookupCategories(
  filters?: LookupCategoryFilters
): Promise<ActionResult<LookupCategoryWithStats[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    let query = supabase.from("global_lookup_categories").select(`
      *,
      values:global_lookup_values(id, is_active, is_locked)
    `);

    // Apply filters
    if (filters?.search) {
      query = query.or(`category_code.ilike.%${filters.search}%,category_name_en.ilike.%${filters.search}%`);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }
    if (filters?.module_code) {
      query = query.eq("module_code", filters.module_code);
    }
    if (filters?.category_scope) {
      query = query.eq("category_scope", filters.category_scope);
    }

    query = query.order("sort_order", { ascending: true }).order("category_name_en", { ascending: true });

    const { data, error } = await query;

    if (error) {
      logger.error("listLookupCategories error", error);
      return { success: false, error: error.message };
    }

    // Compute stats
    const categoriesWithStats = (data as any[]).map((cat: any) => {
      const values = cat.values || [];
      return {
        ...cat,
        values: undefined, // remove the nested values
        total_values: values.length,
        active_values: values.filter((v: any) => v.is_active).length,
        inactive_values: values.filter((v: any) => !v.is_active).length,
        locked_values: values.filter((v: any) => v.is_locked).length,
      } as LookupCategoryWithStats;
    });

    return { success: true, data: categoriesWithStats };
  } catch (error) {
    logger.error("listLookupCategories exception", error);
    return { success: false, error: "Failed to fetch lookup categories" };
  }
}

/**
 * Get a single lookup category by ID
 * Requires: master_data.lookups.view permission
 */
export async function getLookupCategoryById(
  id: number
): Promise<ActionResult<LookupCategory>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_lookup_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error("getLookupCategoryById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as LookupCategory };
  } catch (error) {
    logger.error("getLookupCategoryById exception", error);
    return { success: false, error: "Failed to fetch lookup category" };
  }
}

/**
 * Create a new lookup category
 * Requires: master_data.lookups.manage permission
 */
export async function createLookupCategory(
  input: CreateLookupCategoryInput
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createLookupCategorySchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }

    // 2. Check permission
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    // 3. Insert category
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_lookup_categories")
      .insert({
        ...result.data,
        created_by: ctx.profile.id,
        updated_by: ctx.profile.id,
      })
      .select("id, category_code")
      .single();

    if (error) {
      logger.error("createLookupCategory error", error);
      return { success: false, error: error.message };
    }

    // 4. Audit log
    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_categories",
      entity_id: data.id,
      entity_reference: data.category_code,
      action: "create_category",
      new_values: result.data,
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    // 5. Revalidate
    revalidateLookupPages();

    return { success: true, data: { id: data.id } };
  } catch (error) {
    logger.error("createLookupCategory exception", error);
    return { success: false, error: "Failed to create lookup category" };
  }
}

/**
 * Update an existing lookup category
 * Requires: master_data.lookups.manage permission (or lock permission for locked categories)
 */
export async function updateLookupCategory(
  input: UpdateLookupCategoryInput
): Promise<ActionResult<void>> {
  try {
    // 1. Validate input
    const result = updateLookupCategorySchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }

    // 2. Check permission
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    // 3. Get existing category to check if locked
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_lookup_categories")
      .select("*")
      .eq("id", input.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Category not found" };
    }

    // Check lock permission if category is locked
    if (existing.is_locked && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Cannot modify locked category without lock permission" };
    }

    // 4. Update category
    const { id, ...updateData } = result.data;
    const { error: updateError } = await supabase
      .from("global_lookup_categories")
      .update({
        ...updateData,
        updated_by: ctx.profile.id,
      })
      .eq("id", id);

    if (updateError) {
      logger.error("updateLookupCategory error", updateError);
      return { success: false, error: updateError.message };
    }

    // 5. Audit log
    const auditDiff = createAuditDiff(existing, { ...existing, ...updateData });
    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_categories",
      entity_id: id,
      entity_reference: existing.category_code,
      action: "update_category",
      old_values: auditDiff.old_values,
      new_values: auditDiff.new_values,
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    // 6. Revalidate
    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("updateLookupCategory exception", error);
    return { success: false, error: "Failed to update lookup category" };
  }
}

/**
 * Toggle lookup category active status
 * Requires: master_data.lookups.manage permission
 */
export async function toggleLookupCategoryStatus(
  id: number,
  is_active: boolean,
  deactivation_reason?: string | null
): Promise<ActionResult<void>> {
  try {
    const result = toggleLookupStatusSchema.safeParse({ id, is_active, deactivation_reason });
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || "Validation failed" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_lookup_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Category not found" };
    }

    if (existing.is_locked && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Cannot modify locked category" };
    }

    const { error: updateError } = await supabase
      .from("global_lookup_categories")
      .update({
        is_active,
        deactivated_at: is_active ? null : new Date().toISOString(),
        deactivated_by: is_active ? null : ctx.profile.id,
        deactivation_reason: is_active ? null : deactivation_reason,
        updated_by: ctx.profile.id,
      })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_categories",
      entity_id: id,
      entity_reference: existing.category_code,
      action: is_active ? "activate_category" : "deactivate_category",
      old_values: { is_active: existing.is_active },
      new_values: { is_active, deactivation_reason },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("toggleLookupCategoryStatus exception", error);
    return { success: false, error: "Failed to toggle category status" };
  }
}

/**
 * Toggle lookup category lock status
 * Requires: master_data.lookups.lock permission
 */
export async function toggleLookupCategoryLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const result = toggleLookupLockSchema.safeParse({ id, is_locked });
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || "Validation failed" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_lookup_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Category not found" };
    }

    const { error: updateError } = await supabase
      .from("global_lookup_categories")
      .update({
        is_locked,
        updated_by: ctx.profile.id,
      })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_categories",
      entity_id: id,
      entity_reference: existing.category_code,
      action: is_locked ? "lock_category" : "unlock_category",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("toggleLookupCategoryLock exception", error);
    return { success: false, error: "Failed to toggle category lock" };
  }
}

// ============================================================================
// LOOKUP VALUES - CRUD OPERATIONS
// ============================================================================

/**
 * List lookup values with optional filters
 * Requires: master_data.lookups.view permission
 */
export async function listLookupValues(
  filters?: LookupValueFilters
): Promise<ActionResult<LookupValueWithCategory[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    let query = supabase.from("global_lookup_values").select(`
      *,
      category:global_lookup_categories!inner(category_code, category_name_en, category_name_ar),
      parent_value:global_lookup_values!parent_value_id(value_code, value_label_en, value_label_ar)
    `);

    // Apply filters
    if (filters?.search) {
      query = query.or(`value_code.ilike.%${filters.search}%,value_label_en.ilike.%${filters.search}%`);
    }
    if (filters?.category_id) {
      query = query.eq("category_id", filters.category_id);
    }
    if (filters?.category_code) {
      query = query.eq("category.category_code", filters.category_code);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }
    if (filters?.is_system !== undefined) {
      query = query.eq("is_system", filters.is_system);
    }
    if (filters?.is_locked !== undefined) {
      query = query.eq("is_locked", filters.is_locked);
    }
    if (filters?.is_default !== undefined) {
      query = query.eq("is_default", filters.is_default);
    }
    if (filters?.parent_value_id !== undefined) {
      if (filters.parent_value_id === null) {
        query = query.is("parent_value_id", null);
      } else {
        query = query.eq("parent_value_id", filters.parent_value_id);
      }
    }

    query = query.order("sort_order", { ascending: true }).order("value_label_en", { ascending: true });

    const { data, error } = await query;

    if (error) {
      logger.error("listLookupValues error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as LookupValueWithCategory[] };
  } catch (error) {
    logger.error("listLookupValues exception", error);
    return { success: false, error: "Failed to fetch lookup values" };
  }
}

/**
 * Get a single lookup value by ID
 * Requires: master_data.lookups.view permission
 */
export async function getLookupValueById(
  id: number
): Promise<ActionResult<LookupValue>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_lookup_values")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error("getLookupValueById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as LookupValue };
  } catch (error) {
    logger.error("getLookupValueById exception", error);
    return { success: false, error: "Failed to fetch lookup value" };
  }
}

/**
 * Create a new lookup value
 * Requires: master_data.lookups.manage permission
 */
export async function createLookupValue(
  input: CreateLookupValueInput
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createLookupValueSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }

    // 2. Check permission
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    // 3. Check if category is locked
    const supabase = await createClient();
    const { data: category, error: catError } = await supabase
      .from("global_lookup_categories")
      .select("is_locked, category_code")
      .eq("id", result.data.category_id)
      .single();

    if (catError || !category) {
      return { success: false, error: "Category not found" };
    }

    if (category.is_locked && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Cannot add values to locked category" };
    }

    // 4. Insert value
    const { data, error } = await supabase
      .from("global_lookup_values")
      .insert({
        ...result.data,
        created_by: ctx.profile.id,
        updated_by: ctx.profile.id,
      })
      .select("id, value_code")
      .single();

    if (error) {
      logger.error("createLookupValue error", error);
      return { success: false, error: error.message };
    }

    // 5. Audit log
    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_values",
      entity_id: data.id,
      entity_reference: `${category.category_code}:${data.value_code}`,
      action: "create_value",
      new_values: result.data,
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    // 6. Revalidate
    revalidateLookupPages();

    return { success: true, data: { id: data.id } };
  } catch (error) {
    logger.error("createLookupValue exception", error);
    return { success: false, error: "Failed to create lookup value" };
  }
}

/**
 * Update an existing lookup value
 * Requires: master_data.lookups.manage permission (or lock permission for locked values)
 */
export async function updateLookupValue(
  input: UpdateLookupValueInput
): Promise<ActionResult<void>> {
  try {
    // 1. Validate input
    const result = updateLookupValueSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      return { success: false, error: errors };
    }

    // 2. Check permission
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    // 3. Get existing value to check if locked
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_lookup_values")
      .select("*, category:global_lookup_categories!inner(category_code, is_locked)")
      .eq("id", input.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Value not found" };
    }

    // Check lock permission if value or category is locked
    if ((existing.is_locked || (existing.category as any).is_locked) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Cannot modify locked value without lock permission" };
    }

    // 4. Update value
    const { id, ...updateData } = result.data;
    const { error: updateError } = await supabase
      .from("global_lookup_values")
      .update({
        ...updateData,
        updated_by: ctx.profile.id,
      })
      .eq("id", id);

    if (updateError) {
      logger.error("updateLookupValue error", updateError);
      return { success: false, error: updateError.message };
    }

    // 5. Audit log
    const auditDiff = createAuditDiff(existing, { ...existing, ...updateData });
    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_values",
      entity_id: id,
      entity_reference: `${(existing.category as any).category_code}:${existing.value_code}`,
      action: "update_value",
      old_values: auditDiff.old_values,
      new_values: auditDiff.new_values,
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    // 6. Revalidate
    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("updateLookupValue exception", error);
    return { success: false, error: "Failed to update lookup value" };
  }
}

/**
 * Toggle lookup value active status
 * Requires: master_data.lookups.manage permission
 */
export async function toggleLookupValueStatus(
  id: number,
  is_active: boolean,
  deactivation_reason?: string | null
): Promise<ActionResult<void>> {
  try {
    const result = toggleLookupStatusSchema.safeParse({ id, is_active, deactivation_reason });
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || "Validation failed" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_lookup_values")
      .select("*, category:global_lookup_categories!inner(category_code, is_locked)")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Value not found" };
    }

    if ((existing.is_locked || (existing.category as any).is_locked) && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Cannot modify locked value" };
    }

    const { error: updateError } = await supabase
      .from("global_lookup_values")
      .update({
        is_active,
        deactivated_at: is_active ? null : new Date().toISOString(),
        deactivated_by: is_active ? null : ctx.profile.id,
        deactivation_reason: is_active ? null : deactivation_reason,
        updated_by: ctx.profile.id,
      })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_values",
      entity_id: id,
      entity_reference: `${(existing.category as any).category_code}:${existing.value_code}`,
      action: is_active ? "activate_value" : "deactivate_value",
      old_values: { is_active: existing.is_active },
      new_values: { is_active, deactivation_reason },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("toggleLookupValueStatus exception", error);
    return { success: false, error: "Failed to toggle value status" };
  }
}

/**
 * Toggle lookup value lock status
 * Requires: master_data.lookups.lock permission
 */
export async function toggleLookupValueLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const result = toggleLookupLockSchema.safeParse({ id, is_locked });
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || "Validation failed" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("global_lookup_values")
      .select("*, category:global_lookup_categories!inner(category_code)")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Value not found" };
    }

    const { error: updateError } = await supabase
      .from("global_lookup_values")
      .update({
        is_locked,
        updated_by: ctx.profile.id,
      })
      .eq("id", id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "global_lookup_values",
      entity_id: id,
      entity_reference: `${(existing.category as any).category_code}:${existing.value_code}`,
      action: is_locked ? "lock_value" : "unlock_value",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("toggleLookupValueLock exception", error);
    return { success: false, error: "Failed to toggle value lock" };
  }
}

/**
 * Set a lookup value as the default for its category
 * Requires: master_data.lookups.manage permission
 */
export async function setDefaultLookupValue(
  id: number,
  category_id: number
): Promise<ActionResult<void>> {
  try {
    const result = setDefaultValueSchema.safeParse({ id, category_id });
    if (!result.success) {
      return { success: false, error: result.error.issues[0]?.message || "Validation failed" };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.lookups.manage")) {
      return { success: false, error: "Permission denied" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();

    // 1. Remove default from all values in this category
    await supabase
      .from("global_lookup_values")
      .update({ is_default: false })
      .eq("category_id", category_id);

    // 2. Set new default
    const { error: updateError } = await supabase
      .from("global_lookup_values")
      .update({ is_default: true, updated_by: ctx.profile.id })
      .eq("id", id)
      .eq("category_id", category_id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // 3. Audit log
    const { data: valueData } = await supabase
      .from("global_lookup_values")
      .select("value_code, category:global_lookup_categories!inner(category_code)")
      .eq("id", id)
      .single();

    if (valueData) {
      await logAudit({
        module_code: "master_data",
        entity_name: "global_lookup_values",
        entity_id: id,
        entity_reference: `${(valueData.category as any).category_code}:${valueData.value_code}`,
        action: "set_default_value",
        new_values: { is_default: true },
        owner_company_id: ctx.profile.owner_company_id,
        branch_id: ctx.profile.branch_id,
      });
    }

    revalidateLookupPages();

    return { success: true };
  } catch (error) {
    logger.error("setDefaultLookupValue exception", error);
    return { success: false, error: "Failed to set default value" };
  }
}

// ============================================================================
// SAFE DROPDOWN SERVICE FOR NORMAL USERS
// ============================================================================

/**
 * Get active lookup values for dropdown usage in forms
 * 
 * SAFE FOR NORMAL USERS:
 * - Does NOT require master_data.lookups.view permission
 * - Only requires valid authenticated user
 * - Returns only active values
 * - Does not expose admin metadata
 * 
 * @param categoryCode - The category code (e.g., 'STATUS_TYPES')
 * @param parentValueCode - Optional parent value code for hierarchical filtering
 * @param includeInactive - Only works for users with admin permission
 */
export async function getActiveLookupValuesByCategoryCode(
  categoryCode: string,
  parentValueCode?: string | null,
  includeInactive = false
): Promise<ActionResult<LookupValue[]>> {
  try {
    // 1. Authenticate user (must be valid ERP user)
    const ctx = await getAuthContext();
    if (!ctx.profile) {
      return { success: false, error: "Authentication required" };
    }

    // 2. Check if user is admin (for includeInactive option)
    const isAdmin = hasPermission(ctx, "master_data.lookups.view");
    const shouldIncludeInactive = includeInactive && isAdmin;

    // 3. Get category
    const supabase = await createClient();
    const { data: category, error: catError } = await supabase
      .from("global_lookup_categories")
      .select("id, is_active")
      .eq("category_code", categoryCode.toUpperCase())
      .single();

    if (catError || !category) {
      return { success: false, error: "Category not found" };
    }

    // 4. Only return values if category is active (unless admin)
    if (!category.is_active && !isAdmin) {
      return { success: true, data: [] };
    }

    // 5. Build query for values
    let query = supabase
      .from("global_lookup_values")
      .select("id, value_code, value_label_en, value_label_ar, color_hex, icon_name, badge_variant, sort_order, is_default, parent_value_id")
      .eq("category_id", category.id);

    // Filter by active status (unless admin requested inactive)
    if (!shouldIncludeInactive) {
      query = query.eq("is_active", true);
    }

    // Filter by parent value if specified
    if (parentValueCode) {
      // First get parent value ID
      const { data: parentValue } = await supabase
        .from("global_lookup_values")
        .select("id")
        .eq("category_id", category.id)
        .eq("value_code", parentValueCode.toUpperCase())
        .single();

      if (parentValue) {
        query = query.eq("parent_value_id", parentValue.id);
      } else {
        // Parent not found, return empty
        return { success: true, data: [] };
      }
    } else {
      // No parent filter, return only top-level values (no parent)
      query = query.is("parent_value_id", null);
    }

    query = query.order("sort_order", { ascending: true }).order("value_label_en", { ascending: true });

    const { data, error } = await query;

    if (error) {
      logger.error("getActiveLookupValuesByCategoryCode error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as LookupValue[] };
  } catch (error) {
    logger.error("getActiveLookupValuesByCategoryCode exception", error);
    return { success: false, error: "Failed to fetch lookup values" };
  }
}

// ============================================================================
// BATCH LOOKUP SERVICE — Phase 002F.3E.3B.6B
// ============================================================================

/**
 * Batch-fetch active lookup values for multiple category codes in two DB
 * round-trips instead of 2×N.
 *
 * Round-trip 1: fetch all matching categories in one IN query
 * Round-trip 2: fetch all values for those category IDs in one IN query
 *
 * Returns a Record<categoryCode, LookupValue[]> so callers can group by code.
 *
 * Limitations vs single-category fetch:
 *  - parentValueCode filtering is NOT supported (batch returns top-level values only)
 *  - includeInactive behaves the same as the single action
 *
 * SAFE FOR NORMAL USERS — only requires valid authenticated ERP user.
 */
export async function getActiveLookupValuesByCategoryCodes(
  categoryCodes: string[],
  includeInactive = false
): Promise<ActionResult<Record<string, LookupValue[]>>> {
  try {
    if (!categoryCodes.length) {
      return { success: true, data: {} };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) {
      return { success: false, error: "Authentication required" };
    }

    const isAdmin = hasPermission(ctx, "master_data.lookups.view");
    const shouldIncludeInactive = includeInactive && isAdmin;

    const normalizedCodes = categoryCodes.map((c) => c.toUpperCase());

    const supabase = await createClient();

    // Round-trip 1: resolve all category IDs at once
    let catQuery = supabase
      .from("global_lookup_categories")
      .select("id, category_code, is_active")
      .in("category_code", normalizedCodes);

    if (!shouldIncludeInactive) {
      catQuery = catQuery.eq("is_active", true);
    }

    const { data: categories, error: catError } = await catQuery;
    if (catError) {
      logger.error("getActiveLookupValuesByCategoryCodes categories error", catError);
      return { success: false, error: catError.message };
    }

    if (!categories || categories.length === 0) {
      // Build empty map for all requested codes
      const emptyMap: Record<string, LookupValue[]> = {};
      for (const code of normalizedCodes) emptyMap[code] = [];
      return { success: true, data: emptyMap };
    }

    // Build code→id mapping
    const codeToId: Record<string, number> = {};
    for (const cat of categories) {
      codeToId[cat.category_code] = cat.id;
    }
    const categoryIds = Object.values(codeToId);

    // Round-trip 2: fetch all values for those category IDs at once
    let valQuery = supabase
      .from("global_lookup_values")
      .select(
        "id, category_id, value_code, value_label_en, value_label_ar, color_hex, icon_name, badge_variant, sort_order, is_default, parent_value_id"
      )
      .in("category_id", categoryIds)
      .is("parent_value_id", null); // top-level values only (mirrors single-fetch behaviour)

    if (!shouldIncludeInactive) {
      valQuery = valQuery.eq("is_active", true);
    }

    valQuery = valQuery
      .order("sort_order", { ascending: true })
      .order("value_label_en", { ascending: true });

    const { data: values, error: valError } = await valQuery;
    if (valError) {
      logger.error("getActiveLookupValuesByCategoryCodes values error", valError);
      return { success: false, error: valError.message };
    }

    // Group values by category code
    const result: Record<string, LookupValue[]> = {};

    // Initialise empty arrays for all requested codes (even those with no values)
    for (const code of normalizedCodes) result[code] = [];

    // Invert codeToId so we can map category_id → code quickly
    const idToCode: Record<number, string> = {};
    for (const [code, id] of Object.entries(codeToId)) {
      idToCode[id] = code;
    }

    for (const val of values ?? []) {
      const code = idToCode[val.category_id];
      if (code) {
        result[code].push(val as LookupValue);
      }
    }

    return { success: true, data: result };
  } catch (error) {
    logger.error("getActiveLookupValuesByCategoryCodes exception", error);
    return { success: false, error: "Failed to fetch lookup values" };
  }
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

/**
 * Get master data dashboard statistics
 * Requires: master_data.dashboard.view permission
 */
export async function getLookupDashboardStats(): Promise<ActionResult<LookupDashboardStats>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.dashboard.view")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    // Get category stats
    const { data: categories } = await supabase
      .from("global_lookup_categories")
      .select("id, is_active, is_locked");

    const total_categories = categories?.length || 0;
    const active_categories = categories?.filter(c => c.is_active).length || 0;
    const inactive_categories = total_categories - active_categories;
    const locked_categories = categories?.filter(c => c.is_locked).length || 0;

    // Get value stats
    const { data: values } = await supabase
      .from("global_lookup_values")
      .select("id, is_active, is_locked");

    const total_values = values?.length || 0;
    const active_values = values?.filter(v => v.is_active).length || 0;
    const inactive_values = total_values - active_values;
    const locked_values = values?.filter(v => v.is_locked).length || 0;

    // Get recently updated values
    const { data: recent } = await supabase
      .from("global_lookup_values")
      .select(`
        value_label_en,
        updated_at,
        category:global_lookup_categories!inner(category_name_en)
      `)
      .order("updated_at", { ascending: false })
      .limit(10);

    const recently_updated = (recent || []).map((r: any) => ({
      category_name: r.category?.category_name_en || "Unknown",
      value_label: r.value_label_en,
      updated_at: r.updated_at,
      updated_by_name: null, // user_profiles join deferred — not displayed in current UI
    }));

    const stats: LookupDashboardStats = {
      total_categories,
      active_categories,
      inactive_categories,
      locked_categories,
      total_values,
      active_values,
      inactive_values,
      locked_values,
      recently_updated,
    };

    return { success: true, data: stats };
  } catch (error) {
    logger.error("getLookupDashboardStats exception", error);
    return { success: false, error: "Failed to fetch dashboard stats" };
  }
}
