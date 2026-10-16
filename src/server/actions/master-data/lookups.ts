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
import {hasGlobalPermission} from '@/lib/rbac/scope';
import {saveLookupMutation} from '@/server/lookup-save';
import {lookupCapabilities} from '@/features/master-data/lookups/permissions';
import type {LookupMutationContract,LookupMutationResult} from '@/features/master-data/lookups/mutation-contract';

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
  /** Administrative reads only; ordinary shared-choice responses stay unchanged. */
  kind?: "forbidden" | "not_found" | "failed";
};

type LookupDashboardResult =
  | { success: true; data: LookupDashboardStats; error?: never; kind?: never }
  | { success: false; kind: "forbidden" | "failed"; error: string; data?: never };

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
    if (!lookupCapabilities(ctx).read) {
      return { success: false, kind: "forbidden", error: "Global lookup catalogue access is required." };
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

    if (error || !Array.isArray(data)) {
      logger.error("listLookupCategories error", error);
      return { success: false, kind: error?.code === "42501" ? "forbidden" : "failed", error: error?.code === "42501" ? "Global lookup catalogue access is required." : "The lookup categories could not be loaded. Try again." };
    }

    // Compute stats
    const categoriesWithStats = (data ?? []).map((cat) => {
      const values: Pick<LookupValue, "id" | "is_active" | "is_locked">[] = cat.values || [];
      return {
        ...cat,
        values: undefined, // remove the nested values
        total_values: values.length,
        active_values: values.filter((v) => v.is_active).length,
        inactive_values: values.filter((v) => !v.is_active).length,
        locked_values: values.filter((v) => v.is_locked).length,
      } as LookupCategoryWithStats;
    });

    return { success: true, data: categoriesWithStats };
  } catch (error) {
    logger.error("listLookupCategories exception", error);
    return { success: false, kind: "failed", error: "The lookup categories could not be loaded. Try again." };
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
    if (!lookupCapabilities(ctx).read) {
      return { success: false, kind: "forbidden", error: "Global lookup catalogue access is required." };
    }

    if (!Number.isSafeInteger(id) || id < 1) return { success: false, kind: "not_found", error: "Lookup record not found." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_lookup_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logger.error("getLookupCategoryById error", error);
      return { success: false, kind: error.code === "42501" ? "forbidden" : "failed", error: error.code === "42501" ? "Global lookup catalogue access is required." : "The lookup category could not be loaded. Try again." };
    }

    if (!data) return { success: false, kind: "not_found", error: "Lookup record not found." };
    return { success: true, data: data as LookupCategory };
  } catch (error) {
    logger.error("getLookupCategoryById exception", error);
    return { success: false, kind: "failed", error: "The lookup category could not be loaded. Try again." };
  }
}

/**
 * Create a new lookup category
 * Requires: master_data.lookups.manage permission
 */
export async function createLookupCategory(input:CreateLookupCategoryInput,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 const p=createLookupCategorySchema.safeParse(input);
 if(!p.success)return {success:false,error:'Check the lookup category fields. Protected fields cannot be submitted.'};
 return saveLookupMutation(null,{kind:'category',action:'save',categoryId:null,categoryRevision:null,data:p.data},contract);
}

/**
 * Update an existing lookup category
 * Requires: master_data.lookups.manage permission (or lock permission for locked categories)
 */
export async function updateLookupCategory(input:UpdateLookupCategoryInput,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 const p=updateLookupCategorySchema.safeParse(input);
 if(!p.success)return {success:false,error:'Check the lookup category fields. Its code and system identity cannot change.'};
 const {id,...data}=p.data;
 return saveLookupMutation(id,{kind:'category',action:'save',categoryId:null,categoryRevision:null,data},contract);
}

/**
 * Toggle lookup category active status
 * Requires: master_data.lookups.manage permission
 */
export async function toggleLookupCategoryStatus(id:number,is_active:boolean,deactivation_reason?:string|null,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 const p=toggleLookupStatusSchema.safeParse({id,is_active,deactivation_reason});
 if(!p.success)return {success:false,error:'Check the category status request.'};
 return saveLookupMutation(id,{kind:'category',action:'active',categoryId:null,categoryRevision:null,data:{is_active,...(deactivation_reason===undefined?{}:{deactivation_reason})}},contract);
}

/**
 * Toggle lookup category lock status
 * Requires: master_data.lookups.lock permission
 */
export async function toggleLookupCategoryLock(id:number,is_locked:boolean,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 if(!toggleLookupLockSchema.safeParse({id,is_locked}).success)return {success:false,error:'Check the category lock request.'};
 return saveLookupMutation(id,{kind:'category',action:'lock',categoryId:null,categoryRevision:null,data:{is_locked}},contract);
}

/**
 * List lookup values with optional filters
 * Requires: master_data.lookups.view permission
 */
export async function listLookupValues(
  filters?: LookupValueFilters
): Promise<ActionResult<LookupValueWithCategory[]>> {
  try {
    const ctx = await getAuthContext();
    if (!lookupCapabilities(ctx).read) {
      return { success: false, kind: "forbidden", error: "Global lookup catalogue access is required." };
    }

    const supabase = await createClient();
    let query = supabase.from("global_lookup_values").select(`
      *,
      category:global_lookup_categories!inner(id, category_code, category_name_en, category_name_ar, workspace_revision, is_locked, is_active),
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

    if (error || !Array.isArray(data)) {
      logger.error("listLookupValues error", error);
      return { success: false, kind: error?.code === "42501" ? "forbidden" : "failed", error: error?.code === "42501" ? "Global lookup catalogue access is required." : "The lookup values could not be loaded. Try again." };
    }

    return { success: true, data: data as LookupValueWithCategory[] };
  } catch (error) {
    logger.error("listLookupValues exception", error);
    return { success: false, kind: "failed", error: "The lookup values could not be loaded. Try again." };
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
    if (!lookupCapabilities(ctx).read) {
      return { success: false, kind: "forbidden", error: "Global lookup catalogue access is required." };
    }

    if (!Number.isSafeInteger(id) || id < 1) return { success: false, kind: "not_found", error: "Lookup record not found." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_lookup_values")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logger.error("getLookupValueById error", error);
      return { success: false, kind: error.code === "42501" ? "forbidden" : "failed", error: error.code === "42501" ? "Global lookup catalogue access is required." : "The lookup value could not be loaded. Try again." };
    }

    if (!data) return { success: false, kind: "not_found", error: "Lookup record not found." };
    return { success: true, data: data as LookupValue };
  } catch (error) {
    logger.error("getLookupValueById exception", error);
    return { success: false, kind: "failed", error: "The lookup value could not be loaded. Try again." };
  }
}

/**
 * Create a new lookup value
 * Requires: master_data.lookups.manage permission
 */
export async function createLookupValue(input:CreateLookupValueInput,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 const p=createLookupValueSchema.safeParse(input);
 if(!p.success||!contract||p.data.category_id!==contract.categoryId)return {success:false,error:'Check the value fields and its original category. Default and lock use separate commands.'};
 const {category_id,...data}=p.data;
 return saveLookupMutation(null,{kind:'value',action:'save',categoryId:category_id,categoryRevision:contract.categoryRevision,data},contract);
}

/**
 * Update an existing lookup value
 * Requires: master_data.lookups.manage permission (or lock permission for locked values)
 */
export async function updateLookupValue(input:UpdateLookupValueInput,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 const p=updateLookupValueSchema.safeParse(input);
 if(!p.success||!contract)return {success:false,error:'Check the value fields. Its code and category cannot change; default and lock use separate commands.'};
 const {id,...data}=p.data;
 return saveLookupMutation(id,{kind:'value',action:'save',categoryId:contract.categoryId,categoryRevision:contract.categoryRevision,data},contract);
}

/**
 * Toggle lookup value active status
 * Requires: master_data.lookups.manage permission
 */
export async function toggleLookupValueStatus(id:number,is_active:boolean,deactivation_reason?:string|null,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 if(!toggleLookupStatusSchema.safeParse({id,is_active,deactivation_reason}).success||!contract)return {success:false,error:'Check the value status request.'};
 return saveLookupMutation(id,{kind:'value',action:'active',categoryId:contract.categoryId,categoryRevision:contract.categoryRevision,data:{is_active,...(deactivation_reason===undefined?{}:{deactivation_reason})}},contract);
}

/**
 * Toggle lookup value lock status
 * Requires: master_data.lookups.lock permission
 */
export async function toggleLookupValueLock(id:number,is_locked:boolean,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 if(!toggleLookupLockSchema.safeParse({id,is_locked}).success||!contract)return {success:false,error:'Check the value lock request.'};
 return saveLookupMutation(id,{kind:'value',action:'lock',categoryId:contract.categoryId,categoryRevision:contract.categoryRevision,data:{is_locked}},contract);
}

/**
 * Set a lookup value as the default for its category
 * Requires: master_data.lookups.manage permission
 */
export async function setDefaultLookupValue(id:number,category_id:number,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 if(!setDefaultValueSchema.safeParse({id,category_id}).success||!contract||contract.categoryId!==category_id)return {success:false,error:'Check the original default request and category.'};
 return saveLookupMutation(id,{kind:'value',action:'default',categoryId:category_id,categoryRevision:contract.categoryRevision,data:{}},contract);
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
    const isAdmin = hasGlobalPermission(ctx, "master_data.lookups.view") || hasGlobalPermission(ctx, "master_data.lookups.manage") || hasGlobalPermission(ctx, "master_data.lookups.lock");
    const shouldIncludeInactive = includeInactive && isAdmin;

    // 3. Get category
    const supabase = await createClient();
    const { data: category, error: catError } = await supabase
      .from("erp_lookup_category_choices")
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
      .from("erp_lookup_value_choices")
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
        .from("erp_lookup_value_choices")
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

    const isAdmin = hasGlobalPermission(ctx, "master_data.lookups.view") || hasGlobalPermission(ctx, "master_data.lookups.manage") || hasGlobalPermission(ctx, "master_data.lookups.lock");
    const shouldIncludeInactive = includeInactive && isAdmin;

    const normalizedCodes = categoryCodes.map((c) => c.toUpperCase());

    const supabase = await createClient();

    // Round-trip 1: resolve all category IDs at once
    let catQuery = supabase
      .from("erp_lookup_category_choices")
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
      .from("erp_lookup_value_choices")
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
export async function getLookupDashboardStats(): Promise<LookupDashboardResult> {
  const failed: LookupDashboardResult = { success: false, kind: "failed", error: "Master data statistics could not be loaded. Try again." };
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.dashboard.view")) {
      return { success: false, kind: "forbidden", error: "Permission denied" };
    }

    const supabase = await createClient();

    // Get category stats
    const { data: categories, error: categoriesError } = await supabase
      .from("global_lookup_categories")
      .select("id, is_active, is_locked");
    if (categoriesError || !Array.isArray(categories)) return failed;

    // Get value stats
    const { data: values, error: valuesError } = await supabase
      .from("global_lookup_values")
      .select("id, is_active, is_locked");
    if (valuesError || !Array.isArray(values)) return failed;

    // Get recently updated values
    const { data: recent, error: recentError } = await supabase
      .from("global_lookup_values")
      .select(`
        value_label_en,
        updated_at,
        category:global_lookup_categories!inner(category_name_en)
      `)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (recentError || !Array.isArray(recent)) return failed;

    const total_categories = categories.length;
    const active_categories = categories.filter(c => c.is_active).length;
    const inactive_categories = total_categories - active_categories;
    const locked_categories = categories.filter(c => c.is_locked).length;

    const total_values = values.length;
    const active_values = values.filter(v => v.is_active).length;
    const inactive_values = total_values - active_values;
    const locked_values = values.filter(v => v.is_locked).length;

    const recently_updated = recent.map((r) => ({
      category_name: (Array.isArray(r.category) ? r.category[0] : r.category)?.category_name_en || "Unknown",
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
  } catch {
    logger.error("getLookupDashboardStats exception");
    return failed;
  }
}
