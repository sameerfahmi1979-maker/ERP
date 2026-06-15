"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  createUomCategorySchema,
  updateUomCategorySchema,
  createUnitOfMeasureSchema,
  updateUnitOfMeasureSchema,
  createUomConversionSchema,
  updateUomConversionSchema,
  toggleUomStatusSchema,
  type CreateUomCategoryInput,
  type UpdateUomCategoryInput,
  type CreateUnitOfMeasureInput,
  type UpdateUnitOfMeasureInput,
  type CreateUomConversionInput,
  type UpdateUomConversionInput,
  type ToggleUomStatusInput,
} from "./validation";
import type {
  UomCategory,
  UnitOfMeasure,
  UnitOfMeasureWithCategory,
  UomConversion,
  UomConversionWithUnits,
  UomSelectOption,
  UomCategoryFilters,
  UnitOfMeasureFilters,
  UomConversionFilters,
} from "./types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

const UOM_PATHS = [
  "/admin/master-data/uom/categories",
  "/admin/master-data/uom/units",
  "/admin/master-data/uom/conversions",
] as const;

function revalidateUomPages() {
  UOM_PATHS.forEach((path) => revalidatePath(path));
}

function formatValidationErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function isSystemAdmin(roleCodes: string[] | undefined): boolean {
  return roleCodes?.includes("system_admin") ?? false;
}

function lockedRecordError<T>(): ActionResult<T> {
  return { success: false, error: "This record is locked and cannot be modified" };
}

function managePermissionError<T>(): ActionResult<T> {
  return { success: false, error: "You do not have permission to manage UOM master data" };
}

function viewPermissionError<T>(): ActionResult<T> {
  return { success: false, error: "You do not have permission to view UOM data" };
}

// ============================================================================
// UOM CATEGORIES
// ============================================================================

export async function getUomCategories(
  filters?: UomCategoryFilters,
): Promise<ActionResult<UomCategory[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("uom_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("category_name_en", { ascending: true });

    if (filters?.searchTerm) {
      query = query.or(
        `category_code.ilike.%${filters.searchTerm}%,category_name_en.ilike.%${filters.searchTerm}%`,
      );
    }

    if (filters?.isActive !== undefined) {
      query = query.eq("is_active", filters.isActive);
    }

    if (filters?.isSystem !== undefined) {
      query = query.eq("is_system", filters.isSystem);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getUomCategories error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getUomCategories error", error);
    return { success: false, error: "Failed to load UOM categories" };
  }
}

export async function getUomCategoryById(id: number): Promise<ActionResult<UomCategory>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("uom_categories")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getUomCategoryById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getUomCategoryById error", error);
    return { success: false, error: "Failed to load UOM category" };
  }
}

export async function createUomCategory(
  input: CreateUomCategoryInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createUomCategorySchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      category_name_ar: validated.category_name_ar || null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("uom_categories")
      .insert(dataToInsert)
      .select("id, category_code")
      .single();

    if (error) {
      console.error("createUomCategory error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_categories",
      entity_id: data.id,
      entity_reference: data.category_code,
      action: "create",
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createUomCategory error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateUomCategory(input: UpdateUomCategoryInput): Promise<ActionResult<void>> {
  try {
    const result = updateUomCategorySchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("uom_categories")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (existing.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const { category_name_ar, description_en, description_ar, notes, ...rest } = validated;
    const dataToUpdate = {
      ...rest,
      category_name_ar: category_name_ar === undefined ? undefined : category_name_ar || null,
      description_en: description_en === undefined ? undefined : description_en || null,
      description_ar: description_ar === undefined ? undefined : description_ar || null,
      notes: notes === undefined ? undefined : notes || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("uom_categories")
      .update(dataToUpdate)
      .eq("id", validated.id);

    if (error) {
      console.error("updateUomCategory error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_categories",
      entity_id: validated.id,
      entity_reference: existing.category_code,
      action: "update",
      old_values: createAuditDiff(existing, validated),
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("updateUomCategory error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteUomCategory(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete UOM categories" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_categories")
      .select("category_code")
      .eq("id", id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const { error } = await supabase.from("uom_categories").delete().eq("id", id);

    if (error) {
      console.error("deleteUomCategory error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_categories",
      entity_id: id,
      entity_reference: existing.category_code,
      action: "delete",
      old_values: { id, category_code: existing.category_code },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("deleteUomCategory error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function toggleUomCategoryStatus(
  input: ToggleUomStatusInput,
): Promise<ActionResult<void>> {
  try {
    const result = toggleUomStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_categories")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (existing.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      is_active: validated.is_active,
      deactivated_at: validated.is_active ? null : new Date().toISOString(),
      deactivated_by: validated.is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: validated.is_active ? null : validated.deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("uom_categories")
      .update(dataToUpdate)
      .eq("id", validated.id);

    if (error) {
      console.error("toggleUomCategoryStatus error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_categories",
      entity_id: validated.id,
      entity_reference: existing.category_code,
      action: "toggle_status",
      old_values: { is_active: existing.is_active },
      new_values: { is_active: validated.is_active, deactivation_reason: validated.deactivation_reason },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("toggleUomCategoryStatus error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function toggleUomCategoryLock(
  id: number,
  locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can lock/unlock UOM categories" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_categories")
      .select("category_code")
      .eq("id", id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const { error } = await supabase
      .from("uom_categories")
      .update({ is_locked: locked, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) {
      console.error("toggleUomCategoryLock error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_categories",
      entity_id: id,
      entity_reference: existing.category_code,
      action: locked ? "lock" : "unlock",
      new_values: { is_locked: locked },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("toggleUomCategoryLock error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getActiveUomCategoriesForSelect(): Promise<ActionResult<UomSelectOption[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("uom_categories")
      .select("id, category_code, category_name_en, category_name_ar")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("category_name_en", { ascending: true });

    if (error) {
      console.error("getActiveUomCategoriesForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: UomSelectOption[] = (data || []).map((cat) => ({
      id: cat.id,
      code: cat.category_code,
      name_en: cat.category_name_en,
      name_ar: cat.category_name_ar,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveUomCategoriesForSelect error", error);
    return { success: false, error: "Failed to load UOM categories" };
  }
}

// ============================================================================
// UNITS OF MEASURE
// ============================================================================

export async function getUnitsOfMeasure(
  filters?: UnitOfMeasureFilters,
): Promise<ActionResult<UnitOfMeasureWithCategory[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("units_of_measure")
      .select("*, category:uom_categories(*)")
      .order("sort_order", { ascending: true })
      .order("unit_name_en", { ascending: true });

    if (filters?.searchTerm) {
      query = query.or(
        `unit_code.ilike.%${filters.searchTerm}%,unit_name_en.ilike.%${filters.searchTerm}%`,
      );
    }

    if (filters?.categoryId) {
      query = query.eq("uom_category_id", filters.categoryId);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq("is_active", filters.isActive);
    }

    if (filters?.isBaseUnit !== undefined) {
      query = query.eq("is_base_unit", filters.isBaseUnit);
    }

    if (filters?.isSystem !== undefined) {
      query = query.eq("is_system", filters.isSystem);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getUnitsOfMeasure error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getUnitsOfMeasure error", error);
    return { success: false, error: "Failed to load units of measure" };
  }
}

export async function getUnitOfMeasureById(id: number): Promise<ActionResult<UnitOfMeasureWithCategory>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("units_of_measure")
      .select("*, category:uom_categories(*)")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getUnitOfMeasureById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getUnitOfMeasureById error", error);
    return { success: false, error: "Failed to load unit of measure" };
  }
}

export async function createUnitOfMeasure(
  input: CreateUnitOfMeasureInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createUnitOfMeasureSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      unit_name_ar: validated.unit_name_ar || null,
      symbol: validated.symbol || null,
      description_en: validated.description_en || null,
      description_ar: validated.description_ar || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("units_of_measure")
      .insert(dataToInsert)
      .select("id, unit_code")
      .single();

    if (error) {
      console.error("createUnitOfMeasure error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "units_of_measure",
      entity_id: data.id,
      entity_reference: data.unit_code,
      action: "create",
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createUnitOfMeasure error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateUnitOfMeasure(input: UpdateUnitOfMeasureInput): Promise<ActionResult<void>> {
  try {
    const result = updateUnitOfMeasureSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("units_of_measure")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (existing.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const { unit_name_ar, symbol, description_en, description_ar, notes, ...rest } = validated;
    const dataToUpdate = {
      ...rest,
      unit_name_ar: unit_name_ar === undefined ? undefined : unit_name_ar || null,
      symbol: symbol === undefined ? undefined : symbol || null,
      description_en: description_en === undefined ? undefined : description_en || null,
      description_ar: description_ar === undefined ? undefined : description_ar || null,
      notes: notes === undefined ? undefined : notes || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("units_of_measure")
      .update(dataToUpdate)
      .eq("id", validated.id);

    if (error) {
      console.error("updateUnitOfMeasure error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "units_of_measure",
      entity_id: validated.id,
      entity_reference: existing.unit_code,
      action: "update",
      old_values: createAuditDiff(existing, validated),
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("updateUnitOfMeasure error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteUnitOfMeasure(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete units of measure" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("units_of_measure")
      .select("unit_code")
      .eq("id", id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const { error } = await supabase.from("units_of_measure").delete().eq("id", id);

    if (error) {
      console.error("deleteUnitOfMeasure error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "units_of_measure",
      entity_id: id,
      entity_reference: existing.unit_code,
      action: "delete",
      old_values: { id, unit_code: existing.unit_code },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("deleteUnitOfMeasure error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function toggleUnitOfMeasureStatus(
  input: ToggleUomStatusInput,
): Promise<ActionResult<void>> {
  try {
    const result = toggleUomStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("units_of_measure")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (existing.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      is_active: validated.is_active,
      deactivated_at: validated.is_active ? null : new Date().toISOString(),
      deactivated_by: validated.is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: validated.is_active ? null : validated.deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("units_of_measure")
      .update(dataToUpdate)
      .eq("id", validated.id);

    if (error) {
      console.error("toggleUnitOfMeasureStatus error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "units_of_measure",
      entity_id: validated.id,
      entity_reference: existing.unit_code,
      action: "toggle_status",
      old_values: { is_active: existing.is_active },
      new_values: { is_active: validated.is_active, deactivation_reason: validated.deactivation_reason },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("toggleUnitOfMeasureStatus error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function toggleUnitOfMeasureLock(
  id: number,
  locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can lock/unlock units of measure" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("units_of_measure")
      .select("unit_code")
      .eq("id", id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const { error } = await supabase
      .from("units_of_measure")
      .update({ is_locked: locked, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) {
      console.error("toggleUnitOfMeasureLock error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "units_of_measure",
      entity_id: id,
      entity_reference: existing.unit_code,
      action: locked ? "lock" : "unlock",
      new_values: { is_locked: locked },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("toggleUnitOfMeasureLock error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getActiveUnitsForSelect(
  categoryId?: number,
): Promise<ActionResult<UomSelectOption[]>> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("units_of_measure")
      .select("id, unit_code, unit_name_en, unit_name_ar, symbol, is_base_unit")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("unit_name_en", { ascending: true });

    if (categoryId) {
      query = query.eq("uom_category_id", categoryId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getActiveUnitsForSelect error", error);
      return { success: false, error: error.message };
    }

    const options: UomSelectOption[] = (data || []).map((unit) => ({
      id: unit.id,
      code: unit.unit_code,
      name_en: unit.unit_name_en,
      name_ar: unit.unit_name_ar,
      symbol: unit.symbol,
      is_base_unit: unit.is_base_unit,
    }));

    return { success: true, data: options };
  } catch (error) {
    console.error("getActiveUnitsForSelect error", error);
    return { success: false, error: "Failed to load units of measure" };
  }
}

// ============================================================================
// UOM CONVERSIONS
// ============================================================================

export async function getUomConversions(
  filters?: UomConversionFilters,
): Promise<ActionResult<UomConversionWithUnits[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    let query = supabase
      .from("uom_conversions")
      .select("*, from_unit:units_of_measure!from_uom_id(*), to_unit:units_of_measure!to_uom_id(*)")
      .order("sort_order", { ascending: true });

    if (filters?.fromUomId) {
      query = query.eq("from_uom_id", filters.fromUomId);
    }

    if (filters?.toUomId) {
      query = query.eq("to_uom_id", filters.toUomId);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq("is_active", filters.isActive);
    }

    if (filters?.isSystem !== undefined) {
      query = query.eq("is_system", filters.isSystem);
    }

    const { data, error } = await query;
    if (error) {
      console.error("getUomConversions error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getUomConversions error", error);
    return { success: false, error: "Failed to load UOM conversions" };
  }
}

export async function getUomConversionById(id: number): Promise<ActionResult<UomConversionWithUnits>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.view")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("uom_conversions")
      .select("*, from_unit:units_of_measure!from_uom_id(*), to_unit:units_of_measure!to_uom_id(*)")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getUomConversionById error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getUomConversionById error", error);
    return { success: false, error: "Failed to load UOM conversion" };
  }
}

export async function createUomConversion(
  input: CreateUomConversionInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createUomConversionSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const dataToInsert = {
      ...validated,
      conversion_formula_code: validated.conversion_formula_code || null,
      notes: validated.notes || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("uom_conversions")
      .insert(dataToInsert)
      .select("id")
      .single();

    if (error) {
      console.error("createUomConversion error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_conversions",
      entity_id: data.id,
      entity_reference: `${validated.from_uom_id}->${validated.to_uom_id}`,
      action: "create",
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createUomConversion error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function updateUomConversion(input: UpdateUomConversionInput): Promise<ActionResult<void>> {
  try {
    const result = updateUomConversionSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_conversions")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (existing.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const { conversion_formula_code, notes, ...rest } = validated;
    const dataToUpdate = {
      ...rest,
      conversion_formula_code: conversion_formula_code === undefined ? undefined : conversion_formula_code || null,
      notes: notes === undefined ? undefined : notes || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("uom_conversions")
      .update(dataToUpdate)
      .eq("id", validated.id);

    if (error) {
      console.error("updateUomConversion error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_conversions",
      entity_id: validated.id,
      entity_reference: `${existing.from_uom_id}->${existing.to_uom_id}`,
      action: "update",
      old_values: createAuditDiff(existing, validated),
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("updateUomConversion error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function deleteUomConversion(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can delete UOM conversions" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_conversions")
      .select("from_uom_id, to_uom_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const { error } = await supabase.from("uom_conversions").delete().eq("id", id);

    if (error) {
      console.error("deleteUomConversion error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_conversions",
      entity_id: id,
      entity_reference: `${existing.from_uom_id}->${existing.to_uom_id}`,
      action: "delete",
      old_values: { id, from_uom_id: existing.from_uom_id, to_uom_id: existing.to_uom_id },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("deleteUomConversion error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function toggleUomConversionStatus(
  input: ToggleUomStatusInput,
): Promise<ActionResult<void>> {
  try {
    const result = toggleUomStatusSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return managePermissionError();
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_conversions")
      .select("*")
      .eq("id", validated.id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    if (existing.is_locked && !isSystemAdmin(ctx.roleCodes)) {
      return lockedRecordError();
    }

    const dataToUpdate = {
      is_active: validated.is_active,
      deactivated_at: validated.is_active ? null : new Date().toISOString(),
      deactivated_by: validated.is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: validated.is_active ? null : validated.deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("uom_conversions")
      .update(dataToUpdate)
      .eq("id", validated.id);

    if (error) {
      console.error("toggleUomConversionStatus error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_conversions",
      entity_id: validated.id,
      entity_reference: `${existing.from_uom_id}->${existing.to_uom_id}`,
      action: "toggle_status",
      old_values: { is_active: existing.is_active },
      new_values: { is_active: validated.is_active, deactivation_reason: validated.deactivation_reason },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("toggleUomConversionStatus error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function toggleUomConversionLock(
  id: number,
  locked: boolean,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isSystemAdmin(ctx.roleCodes)) {
      return { success: false, error: "Only system administrators can lock/unlock UOM conversions" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("uom_conversions")
      .select("from_uom_id, to_uom_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const { error } = await supabase
      .from("uom_conversions")
      .update({ is_locked: locked, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);

    if (error) {
      console.error("toggleUomConversionLock error", error);
      return { success: false, error: error.message };
    }

    await logAudit({
      module_code: "master_data",
      entity_name: "uom_conversions",
      entity_id: id,
      entity_reference: `${existing.from_uom_id}->${existing.to_uom_id}`,
      action: locked ? "lock" : "unlock",
      new_values: { is_locked: locked },
    });

    revalidateUomPages();
    return { success: true };
  } catch (error) {
    console.error("toggleUomConversionLock error", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}
