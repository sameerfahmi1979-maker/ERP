"use server";

import {saveUomRecord} from "@/server/uom-save";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import type {WorkspaceSaveResult} from "@/server/workspace-save";
import {workspaceValidationFailure} from "@/lib/workspace/field-errors";
import type { WorkspaceFieldErrors } from "@/lib/workspace/field-errors";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import type {
  UnitOfMeasureFilters,
  UnitOfMeasureWithCategory,
  UomCategory,
  UomCategoryFilters,
  UomConversionFilters,
  UomConversionWithUnits,
  UomSelectOption
} from "./types";
import {
  createUnitOfMeasureSchema,
  createUomCategorySchema,
  createUomConversionSchema,
  toggleUomStatusSchema,
  updateUnitOfMeasureSchema,
  updateUomCategorySchema,
  updateUomConversionSchema,
  type CreateUnitOfMeasureInput,
  type CreateUomCategoryInput,
  type CreateUomConversionInput,
  type ToggleUomStatusInput,
  type UpdateUnitOfMeasureInput,
  type UpdateUomCategoryInput,
  type UpdateUomConversionInput,
} from "./validation";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: WorkspaceFieldErrors;
};

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
    if (!hasPermission(ctx, "master_data.uom.view") && !hasGlobalPermission(ctx, "master_data.uom.manage")) {
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
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
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
    if (!hasPermission(ctx, "master_data.uom.view") && !hasGlobalPermission(ctx, "master_data.uom.manage")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("uom_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getUomCategoryById error", error);
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
    }

    if (!data) return { success: false, error: "Record not found or outside your permitted access." };
    return { success: true, data };
  } catch (error) {
    console.error("getUomCategoryById error", error);
    return { success: false, error: "Failed to load UOM category" };
  }
}

export async function createUomCategory(input:CreateUomCategoryInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=createUomCategorySchema.safeParse(input);
 if(!result.success)return workspaceValidationFailure(result.error.issues);
 return saveUomRecord('uom_categories','save',null,result.data,contract);
}

export async function updateUomCategory(input:UpdateUomCategoryInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=updateUomCategorySchema.safeParse(input);
 if(!result.success)return workspaceValidationFailure(result.error.issues);
 const {id,...data}=result.data;return saveUomRecord('uom_categories','save',id,data,contract);
}

/** Retire without erasing references, receipts or audit history. */
export async function deleteUomCategory(id:number,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 return saveUomRecord('uom_categories','retire',id,{is_active:false},contract);
}

export async function toggleUomCategoryStatus(input:ToggleUomStatusInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=toggleUomStatusSchema.safeParse(input);if(!result.success)return workspaceValidationFailure(result.error.issues);
 const {id,...data}=result.data;return saveUomRecord('uom_categories','active',id,data,contract);
}

export async function toggleUomCategoryLock(id:number,locked:boolean,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 return saveUomRecord('uom_categories','lock',id,{is_locked:locked},contract);
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
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
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
    if (!hasPermission(ctx, "master_data.uom.view") && !hasGlobalPermission(ctx, "master_data.uom.manage")) {
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
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
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
    if (!hasPermission(ctx, "master_data.uom.view") && !hasGlobalPermission(ctx, "master_data.uom.manage")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("units_of_measure")
      .select("*, category:uom_categories(*)")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getUnitOfMeasureById error", error);
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
    }

    if (!data) return { success: false, error: "Record not found or outside your permitted access." };
    return { success: true, data };
  } catch (error) {
    console.error("getUnitOfMeasureById error", error);
    return { success: false, error: "Failed to load unit of measure" };
  }
}

export async function createUnitOfMeasure(input:CreateUnitOfMeasureInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=createUnitOfMeasureSchema.safeParse(input);
 if(!result.success)return workspaceValidationFailure(result.error.issues);
 return saveUomRecord('units_of_measure','save',null,result.data,contract);
}

export async function updateUnitOfMeasure(input:UpdateUnitOfMeasureInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=updateUnitOfMeasureSchema.safeParse(input);
 if(!result.success)return workspaceValidationFailure(result.error.issues);
 const {id,...data}=result.data;return saveUomRecord('units_of_measure','save',id,data,contract);
}

/** Retire without erasing references, receipts or audit history. */
export async function deleteUnitOfMeasure(id:number,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 return saveUomRecord('units_of_measure','retire',id,{is_active:false},contract);
}

export async function toggleUnitOfMeasureStatus(input:ToggleUomStatusInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=toggleUomStatusSchema.safeParse(input);if(!result.success)return workspaceValidationFailure(result.error.issues);
 const {id,...data}=result.data;return saveUomRecord('units_of_measure','active',id,data,contract);
}

export async function toggleUnitOfMeasureLock(id:number,locked:boolean,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 return saveUomRecord('units_of_measure','lock',id,{is_locked:locked},contract);
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
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
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
    if (!hasPermission(ctx, "master_data.uom.view") && !hasGlobalPermission(ctx, "master_data.uom.manage")) {
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
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
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
    if (!hasPermission(ctx, "master_data.uom.view") && !hasGlobalPermission(ctx, "master_data.uom.manage")) {
      return viewPermissionError();
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("uom_conversions")
      .select("*, from_unit:units_of_measure!from_uom_id(*), to_unit:units_of_measure!to_uom_id(*)")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("getUomConversionById error", error);
      return { success: false, error: "Unable to load units data. Try again; no empty or missing result has been assumed." };
    }

    if (!data) return { success: false, error: "Record not found or outside your permitted access." };
    return { success: true, data };
  } catch (error) {
    console.error("getUomConversionById error", error);
    return { success: false, error: "Failed to load UOM conversion" };
  }
}

export async function createUomConversion(input:CreateUomConversionInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=createUomConversionSchema.safeParse(input);
 if(!result.success)return workspaceValidationFailure(result.error.issues);
 return saveUomRecord('uom_conversions','save',null,result.data,contract);
}

export async function updateUomConversion(input:UpdateUomConversionInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=updateUomConversionSchema.safeParse(input);
 if(!result.success)return workspaceValidationFailure(result.error.issues);
 const {id,...data}=result.data;return saveUomRecord('uom_conversions','save',id,data,contract);
}

/** Retire without erasing references, receipts or audit history. */
export async function deleteUomConversion(id:number,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 return saveUomRecord('uom_conversions','retire',id,{is_active:false},contract);
}

export async function toggleUomConversionStatus(input:ToggleUomStatusInput,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const result=toggleUomStatusSchema.safeParse(input);if(!result.success)return workspaceValidationFailure(result.error.issues);
 const {id,...data}=result.data;return saveUomRecord('uom_conversions','active',id,data,contract);
}

export async function toggleUomConversionLock(id:number,locked:boolean,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 return saveUomRecord('uom_conversions','lock',id,{is_locked:locked},contract);
}
