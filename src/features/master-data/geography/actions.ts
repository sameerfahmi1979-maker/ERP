"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  createCountrySchema,
  updateCountrySchema,
  createEmirateSchema,
  updateEmirateSchema,
  createCitySchema,
  updateCitySchema,
  createAreaZoneSchema,
  updateAreaZoneSchema,
  createPortSchema,
  updatePortSchema,
  toggleGeographyStatusSchema,
  type CreateCountryInput,
  type UpdateCountryInput,
  type CreateEmirateInput,
  type UpdateEmirateInput,
  type CreateCityInput,
  type UpdateCityInput,
  type CreateAreaZoneInput,
  type UpdateAreaZoneInput,
  type CreatePortInput,
  type UpdatePortInput,
  type ToggleGeographyStatusInput,
} from "./validation";
import type {
  Country,
  Emirate,
  CityWithEmirate,
  AreaZoneWithRelations,
  PortWithRelations,
} from "./types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ============================================================================
// COUNTRIES
// ============================================================================

/**
 * Create a new country
 * Permission: master_data.geography.manage
 */
export async function createCountry(
  input: CreateCountryInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createCountrySchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Create country
    const supabase = await createClient();
    
    const dataToInsert = {
      ...validated,
      name_ar: validated.name_ar || null,
      nationality_ar: validated.nationality_ar || null,
      phone_code: validated.phone_code || null,
      default_currency_code: validated.default_currency_code || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("countries")
      .insert(dataToInsert)
      .select("id, country_code")
      .single();

    if (error) {
      console.error("createCountry error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "countries",
      entity_id: data.id,
      entity_reference: data.country_code,
      action: "create",
      new_values: validated,
    });

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/countries");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCountry exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing country
 * Permission: master_data.geography.manage
 */
export async function updateCountry(
  input: UpdateCountryInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateCountrySchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("countries")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Country not found" };
    }

    // 4. Update country
    const dataToUpdate = {
      ...updates,
      name_ar: updates.name_ar === "" ? null : updates.name_ar,
      nationality_ar: updates.nationality_ar === "" ? null : updates.nationality_ar,
      phone_code: updates.phone_code === "" ? null : updates.phone_code,
      default_currency_code: updates.default_currency_code === "" ? null : updates.default_currency_code,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("countries")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updateCountry error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "countries",
      entity_id: id,
      entity_reference: oldData.country_code,
      action: "update",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/countries");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCountry exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle country status (activate/deactivate)
 * Permission: master_data.geography.manage
 */
export async function toggleCountryStatus(
  input: ToggleGeographyStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = toggleGeographyStatusSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, is_active, deactivation_reason } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("countries")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Country not found" };
    }

    // 4. Update status
    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("countries")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("toggleCountryStatus error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "countries",
      entity_id: id,
      entity_reference: oldData.country_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/countries");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleCountryStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// EMIRATES
// ============================================================================

/**
 * Create a new emirate
 * Permission: master_data.geography.manage
 */
export async function createEmirate(
  input: CreateEmirateInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createEmirateSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Create emirate
    const supabase = await createClient();
    
    const dataToInsert = {
      ...validated,
      name_ar: validated.name_ar || null,
      abbreviation_ar: validated.abbreviation_ar || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("emirates")
      .insert(dataToInsert)
      .select("id, emirate_code")
      .single();

    if (error) {
      console.error("createEmirate error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "emirates",
      entity_id: data.id,
      entity_reference: data.emirate_code,
      action: "create",
      new_values: validated,
    });

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/emirates");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createEmirate exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing emirate
 * Permission: master_data.geography.manage
 */
export async function updateEmirate(
  input: UpdateEmirateInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateEmirateSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("emirates")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Emirate not found" };
    }

    // 4. Update emirate
    const dataToUpdate = {
      ...updates,
      name_ar: updates.name_ar === "" ? null : updates.name_ar,
      abbreviation_ar: updates.abbreviation_ar === "" ? null : updates.abbreviation_ar,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("emirates")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updateEmirate error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "emirates",
      entity_id: id,
      entity_reference: oldData.emirate_code,
      action: "update",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/emirates");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateEmirate exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle emirate status (activate/deactivate)
 * Permission: master_data.geography.manage
 */
export async function toggleEmirateStatus(
  input: ToggleGeographyStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = toggleGeographyStatusSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, is_active, deactivation_reason } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("emirates")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Emirate not found" };
    }

    // 4. Update status
    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("emirates")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("toggleEmirateStatus error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "emirates",
      entity_id: id,
      entity_reference: oldData.emirate_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/emirates");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleEmirateStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// CITIES
// ============================================================================

/**
 * Create a new city
 * Permission: master_data.geography.manage
 */
export async function createCity(
  input: CreateCityInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createCitySchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Create city
    const supabase = await createClient();
    
    const dataToInsert = {
      ...validated,
      name_ar: validated.name_ar || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("cities")
      .insert(dataToInsert)
      .select("id, city_code")
      .single();

    if (error) {
      console.error("createCity error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "cities",
      entity_id: data.id,
      entity_reference: data.city_code,
      action: "create",
      new_values: validated,
    });

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/cities");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createCity exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing city
 * Permission: master_data.geography.manage
 */
export async function updateCity(
  input: UpdateCityInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateCitySchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("cities")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "City not found" };
    }

    // 4. Update city
    const dataToUpdate = {
      ...updates,
      name_ar: updates.name_ar === "" ? null : updates.name_ar,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("cities")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updateCity error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "cities",
      entity_id: id,
      entity_reference: oldData.city_code,
      action: "update",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/cities");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateCity exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle city status (activate/deactivate)
 * Permission: master_data.geography.manage
 */
export async function toggleCityStatus(
  input: ToggleGeographyStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = toggleGeographyStatusSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, is_active, deactivation_reason } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("cities")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "City not found" };
    }

    // 4. Update status
    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("cities")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("toggleCityStatus error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "cities",
      entity_id: id,
      entity_reference: oldData.city_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/cities");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleCityStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// AREAS/ZONES
// ============================================================================

/**
 * Create a new area/zone
 * Permission: master_data.geography.manage
 */
export async function createAreaZone(
  input: CreateAreaZoneInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createAreaZoneSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Create area/zone
    const supabase = await createClient();
    
    const dataToInsert = {
      ...validated,
      name_ar: validated.name_ar || null,
      area_type_code: validated.area_type_code || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("areas_zones")
      .insert(dataToInsert)
      .select("id, area_code")
      .single();

    if (error) {
      console.error("createAreaZone error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "areas_zones",
      entity_id: data.id,
      entity_reference: data.area_code,
      action: "create",
      new_values: validated,
    });

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/areas");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createAreaZone exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing area/zone
 * Permission: master_data.geography.manage
 */
export async function updateAreaZone(
  input: UpdateAreaZoneInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updateAreaZoneSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("areas_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Area/Zone not found" };
    }

    // 4. Update area/zone
    const dataToUpdate = {
      ...updates,
      name_ar: updates.name_ar === "" ? null : updates.name_ar,
      area_type_code: updates.area_type_code === "" ? null : updates.area_type_code,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("areas_zones")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updateAreaZone error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "areas_zones",
      entity_id: id,
      entity_reference: oldData.area_code,
      action: "update",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/areas");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updateAreaZone exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle area/zone status (activate/deactivate)
 * Permission: master_data.geography.manage
 */
export async function toggleAreaZoneStatus(
  input: ToggleGeographyStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = toggleGeographyStatusSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, is_active, deactivation_reason } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("areas_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Area/Zone not found" };
    }

    // 4. Update status
    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("areas_zones")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("toggleAreaZoneStatus error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "areas_zones",
      entity_id: id,
      entity_reference: oldData.area_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/areas");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("toggleAreaZoneStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// PORTS
// ============================================================================

/**
 * Create a new port
 * Permission: master_data.geography.manage
 */
export async function createPort(
  input: CreatePortInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createPortSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Create port
    const supabase = await createClient();
    
    const dataToInsert = {
      ...validated,
      name_ar: validated.name_ar || null,
      icao_code: validated.icao_code || null,
      iata_code: validated.iata_code || null,
      created_by: ctx.profile?.id ?? null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("ports")
      .insert(dataToInsert)
      .select("id, port_code")
      .single();

    if (error) {
      console.error("createPort error", error);
      return { success: false, error: error.message };
    }

    // 4. Log audit
    await logAudit({
      module_code: "master_data",
      entity_name: "ports",
      entity_id: data.id,
      entity_reference: data.port_code,
      action: "create",
      new_values: validated,
    });

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/ports");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("createPort exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Update an existing port
 * Permission: master_data.geography.manage
 */
export async function updatePort(
  input: UpdatePortInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = updatePortSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("ports")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Port not found" };
    }

    // 4. Update port
    const dataToUpdate = {
      ...updates,
      name_ar: updates.name_ar === "" ? null : updates.name_ar,
      icao_code: updates.icao_code === "" ? null : updates.icao_code,
      iata_code: updates.iata_code === "" ? null : updates.iata_code,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("ports")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("updatePort error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "ports",
      entity_id: id,
      entity_reference: oldData.port_code,
      action: "update",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/ports");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("updatePort exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle port status (activate/deactivate)
 * Permission: master_data.geography.manage
 */
export async function togglePortStatus(
  input: ToggleGeographyStatusInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = toggleGeographyStatusSchema.safeParse(input);
    
    if (!result.success) {
      const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return { success: false, error: errors };
    }
    
    const validated = result.data;
    const { id, is_active, deactivation_reason } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.manage")) {
      return { success: false, error: "You do not have permission to manage geography master data" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("ports")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Port not found" };
    }

    // 4. Update status
    const dataToUpdate = {
      is_active,
      deactivated_at: is_active ? null : new Date().toISOString(),
      deactivated_by: is_active ? null : ctx.profile?.id ?? null,
      deactivation_reason: is_active ? null : deactivation_reason || null,
      updated_by: ctx.profile?.id ?? null,
    };

    const { error } = await supabase
      .from("ports")
      .update(dataToUpdate)
      .eq("id", id);

    if (error) {
      console.error("togglePortStatus error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...dataToUpdate });
    
    await logAudit({
      module_code: "master_data",
      entity_name: "ports",
      entity_id: id,
      entity_reference: oldData.port_code,
      action: is_active ? "activate" : "deactivate",
      old_values,
      new_values,
    });

    // 6. Revalidate
    revalidatePath("/admin/master-data/geography/ports");

    return { success: true, data: { id } };
  } catch (error) {
    console.error("togglePortStatus exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// LIST/GET/SELECT ACTIONS (For UI DataTables and Forms)
// ============================================================================

/**
 * Get all countries with filters
 * Permission: master_data.geography.view
 */
export async function getCountries(filters?: {
  search?: string;
  is_gcc?: boolean;
  is_uae?: boolean;
  is_active?: boolean;
}): Promise<ActionResult<Country[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }

    const supabase = await createClient();
    let query = supabase
      .from("countries")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(`country_code.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%,name_ar.ilike.%${filters.search}%,nationality_en.ilike.%${filters.search}%`);
    }

    if (filters?.is_gcc !== undefined) {
      query = query.eq("is_gcc", filters.is_gcc);
    }

    if (filters?.is_uae !== undefined) {
      query = query.eq("is_uae", filters.is_uae);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getCountries error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getCountries exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get all emirates with filters
 * Permission: master_data.geography.view
 */
export async function getEmirates(filters?: {
  search?: string;
  country_id?: number; // NEW: Filter by country
  is_active?: boolean;
}): Promise<ActionResult<Emirate[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }

    const supabase = await createClient();
    let query = supabase
      .from("emirates")
      .select("*")
      .order("sort_order", { ascending: true });

    if (filters?.search) {
      query = query.or(`emirate_code.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%,name_ar.ilike.%${filters.search}%`);
    }

    // NEW: Filter by country_id
    if (filters?.country_id) {
      query = query.eq("country_id", filters.country_id);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getEmirates error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getEmirates exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get all cities with filters
 * Permission: master_data.geography.view
 */
export async function getCities(filters?: {
  search?: string;
  emirate_id?: number;
  country_id?: number; // NEW: Filter by country
  is_active?: boolean;
}): Promise<ActionResult<CityWithEmirate[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }

    const supabase = await createClient();
    let query = supabase
      .from("cities")
      .select("*, emirate:emirates(emirate_code, name_en, name_ar)")
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true});

    if (filters?.search) {
      query = query.or(`city_code.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%,name_ar.ilike.%${filters.search}%`);
    }

    if (filters?.emirate_id) {
      query = query.eq("emirate_id", filters.emirate_id);
    }

    // NEW: Filter by country_id
    if (filters?.country_id) {
      query = query.eq("country_id", filters.country_id);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getCities error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getCities exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get all areas/zones with filters
 * Permission: master_data.geography.view
 */
export async function getAreasZones(filters?: {
  search?: string;
  city_id?: number;
  area_type_code?: string;
  is_active?: boolean;
}): Promise<ActionResult<AreaZoneWithRelations[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }

    const supabase = await createClient();
    let query = supabase
      .from("areas_zones")
      .select("*, city:cities(city_code, name_en, name_ar, emirate:emirates(emirate_code, name_en, name_ar))")
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(`area_code.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%,name_ar.ilike.%${filters.search}%`);
    }

    if (filters?.city_id) {
      query = query.eq("city_id", filters.city_id);
    }

    if (filters?.area_type_code) {
      query = query.eq("area_type_code", filters.area_type_code);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getAreasZones error", error);
      return { success: false, error: error.message };
    }

    // Transform data to flatten nested emirate from city
    const transformedData = (data || []).map(area => {
      const { city, ...rest } = area as any;
      const { emirate, ...cityWithoutEmirate } = city || {};
      
      return {
        ...rest,
        city: cityWithoutEmirate,
        emirate: emirate || null
      };
    });

    return { success: true, data: transformedData };
  } catch (error) {
    console.error("getAreasZones exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get all ports with filters
 * Permission: master_data.geography.view
 */
export async function getPorts(filters?: {
  search?: string;
  emirate_id?: number;
  country_id?: number; // NEW: Filter by country
  port_type_code?: string;
  is_active?: boolean;
}): Promise<ActionResult<PortWithRelations[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }

    const supabase = await createClient();
    let query = supabase
      .from("ports")
      .select("*, emirate:emirates(emirate_code, name_en, name_ar)")
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true });

    if (filters?.search) {
      query = query.or(`port_code.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%,name_ar.ilike.%${filters.search}%`);
    }

    if (filters?.emirate_id) {
      query = query.eq("emirate_id", filters.emirate_id);
    }

    // NEW: Filter by country_id
    if (filters?.country_id) {
      query = query.eq("country_id", filters.country_id);
    }

    if (filters?.port_type_code) {
      query = query.eq("port_type_code", filters.port_type_code);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq("is_active", filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error("getPorts error", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error("getPorts exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get single country by ID
 * Permission: master_data.geography.view
 */
export async function getCountryById(id: number): Promise<ActionResult<Country>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("countries")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getCountryById error", error);
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Country not found" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("getCountryById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// DELETE ACTIONS (Global Admin / System Admin Only)
// ============================================================================

/**
 * Delete a country (HARD DELETE)
 * Permission: system_admin role only (global admin rule)
 * WARNING: This is a hard delete. Data cannot be recovered.
 */
export async function deleteCountry(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions - must be system_admin
    const ctx = await getAuthContext();
    const isSystemAdmin = ctx.roleCodes.includes('system_admin');
    
    if (!isSystemAdmin) {
      return { success: false, error: "Only system administrators can delete geography records. Use deactivate instead." };
    }

    // 2. Get country for audit (before deletion)
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("countries")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Country not found" };
    }

    // 3. Log audit BEFORE deletion
    await logAudit({
      module_code: "master_data",
      entity_name: "countries",
      entity_id: id,
      entity_reference: oldData.country_code,
      action: "delete",
      old_values: oldData,
    });

    // 4. Delete country
    const { error } = await supabase
      .from("countries")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteCountry error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete country with related records (emirates, cities, etc.). Deactivate instead."
          : error.message,
      };
    }

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/countries");

    return { success: true };
  } catch (error) {
    console.error("deleteCountry exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete an emirate (HARD DELETE)
 * Permission: system_admin role only (global admin rule)
 * WARNING: This is a hard delete. Data cannot be recovered.
 */
export async function deleteEmirate(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions - must be system_admin
    const ctx = await getAuthContext();
    const isSystemAdmin = ctx.roleCodes.includes('system_admin');
    
    if (!isSystemAdmin) {
      return { success: false, error: "Only system administrators can delete geography records. Use deactivate instead." };
    }

    // 2. Get emirate for audit (before deletion)
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("emirates")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Emirate not found" };
    }

    // 3. Log audit BEFORE deletion
    await logAudit({
      module_code: "master_data",
      entity_name: "emirates",
      entity_id: id,
      entity_reference: oldData.emirate_code,
      action: "delete",
      old_values: oldData,
    });

    // 4. Delete emirate
    const { error } = await supabase
      .from("emirates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteEmirate error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete emirate with related records (cities, ports, etc.). Deactivate instead."
          : error.message,
      };
    }

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/emirates");

    return { success: true };
  } catch (error) {
    console.error("deleteEmirate exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a city (HARD DELETE)
 * Permission: system_admin role only (global admin rule)
 * WARNING: This is a hard delete. Data cannot be recovered.
 */
export async function deleteCity(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions - must be system_admin
    const ctx = await getAuthContext();
    const isSystemAdmin = ctx.roleCodes.includes('system_admin');
    
    if (!isSystemAdmin) {
      return { success: false, error: "Only system administrators can delete geography records. Use deactivate instead." };
    }

    // 2. Get city for audit (before deletion)
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("cities")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "City not found" };
    }

    // 3. Log audit BEFORE deletion
    await logAudit({
      module_code: "master_data",
      entity_name: "cities",
      entity_id: id,
      entity_reference: oldData.city_code,
      action: "delete",
      old_values: oldData,
    });

    // 4. Delete city
    const { error } = await supabase
      .from("cities")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteCity error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete city with related records (areas, branches, etc.). Deactivate instead."
          : error.message,
      };
    }

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/cities");

    return { success: true };
  } catch (error) {
    console.error("deleteCity exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete an area/zone (HARD DELETE)
 * Permission: system_admin role only (global admin rule)
 * WARNING: This is a hard delete. Data cannot be recovered.
 */
export async function deleteAreaZone(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions - must be system_admin
    const ctx = await getAuthContext();
    const isSystemAdmin = ctx.roleCodes.includes('system_admin');
    
    if (!isSystemAdmin) {
      return { success: false, error: "Only system administrators can delete geography records. Use deactivate instead." };
    }

    // 2. Get area/zone for audit (before deletion)
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("areas_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Area/Zone not found" };
    }

    // 3. Log audit BEFORE deletion
    await logAudit({
      module_code: "master_data",
      entity_name: "areas_zones",
      entity_id: id,
      entity_reference: oldData.area_code,
      action: "delete",
      old_values: oldData,
    });

    // 4. Delete area/zone
    const { error } = await supabase
      .from("areas_zones")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteAreaZone error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete area/zone with related records (branches, sites, etc.). Deactivate instead."
          : error.message,
      };
    }

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/areas");

    return { success: true };
  } catch (error) {
    console.error("deleteAreaZone exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a port (HARD DELETE)
 * Permission: system_admin role only (global admin rule)
 * WARNING: This is a hard delete. Data cannot be recovered.
 */
export async function deletePort(id: number): Promise<ActionResult> {
  try {
    // 1. Check permissions - must be system_admin
    const ctx = await getAuthContext();
    const isSystemAdmin = ctx.roleCodes.includes('system_admin');
    
    if (!isSystemAdmin) {
      return { success: false, error: "Only system administrators can delete geography records. Use deactivate instead." };
    }

    // 2. Get port for audit (before deletion)
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("ports")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "Port not found" };
    }

    // 3. Log audit BEFORE deletion
    await logAudit({
      module_code: "master_data",
      entity_name: "ports",
      entity_id: id,
      entity_reference: oldData.port_code,
      action: "delete",
      old_values: oldData,
    });

    // 4. Delete port
    const { error } = await supabase
      .from("ports")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deletePort error", error);
      return {
        success: false,
        error: error.message.includes("foreign key")
          ? "Cannot delete port with related records (shipments, cargo, etc.). Deactivate instead."
          : error.message,
      };
    }

    // 5. Revalidate
    revalidatePath("/admin/master-data/geography/ports");

    return { success: true };
  } catch (error) {
    console.error("deletePort exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// LOCK / UNLOCK ACTIONS
// ============================================================================

/**
 * Toggle Country Lock
 * Permission: master_data.lookups.lock OR system_admin
 */
export async function toggleCountryLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    
    // Allow system_admin or users with lock permission
    const isSystemAdmin = ctx.roleCodes?.includes('system_admin');
    if (!isSystemAdmin && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("countries")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Country not found" };
    }

    const { error: updateError } = await supabase
      .from("countries")
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
      entity_name: "countries",
      entity_id: id,
      entity_reference: existing.country_code,
      action: is_locked ? "country.lock" : "country.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidatePath("/admin/master-data/geography/countries");
    return { success: true };
  } catch (error) {
    console.error("toggleCountryLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle Emirate Lock
 * Permission: master_data.lookups.lock OR system_admin
 */
export async function toggleEmirateLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    
    // Allow system_admin or users with lock permission
    const isSystemAdmin = ctx.roleCodes?.includes('system_admin');
    if (!isSystemAdmin && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("emirates")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Emirate not found" };
    }

    const { error: updateError } = await supabase
      .from("emirates")
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
      entity_name: "emirates",
      entity_id: id,
      entity_reference: existing.emirate_code,
      action: is_locked ? "emirate.lock" : "emirate.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidatePath("/admin/master-data/geography/emirates");
    return { success: true };
  } catch (error) {
    console.error("toggleEmirateLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle City Lock
 * Permission: master_data.lookups.lock OR system_admin
 */
export async function toggleCityLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    
    // Allow system_admin or users with lock permission
    const isSystemAdmin = ctx.roleCodes?.includes('system_admin');
    if (!isSystemAdmin && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("cities")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "City not found" };
    }

    const { error: updateError } = await supabase
      .from("cities")
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
      entity_name: "cities",
      entity_id: id,
      entity_reference: existing.city_code,
      action: is_locked ? "city.lock" : "city.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidatePath("/admin/master-data/geography/cities");
    return { success: true };
  } catch (error) {
    console.error("toggleCityLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle Area/Zone Lock
 * Permission: master_data.lookups.lock OR system_admin
 */
export async function toggleAreaZoneLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    
    // Allow system_admin or users with lock permission
    const isSystemAdmin = ctx.roleCodes?.includes('system_admin');
    if (!isSystemAdmin && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("areas_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Area not found" };
    }

    const { error: updateError } = await supabase
      .from("areas_zones")
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
      entity_name: "areas_zones",
      entity_id: id,
      entity_reference: existing.area_code,
      action: is_locked ? "area_zone.lock" : "area_zone.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidatePath("/admin/master-data/geography/areas");
    return { success: true };
  } catch (error) {
    console.error("toggleAreaZoneLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Toggle Port Lock
 * Permission: master_data.lookups.lock OR system_admin
 */
export async function togglePortLock(
  id: number,
  is_locked: boolean
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    
    // Allow system_admin or users with lock permission
    const isSystemAdmin = ctx.roleCodes?.includes('system_admin');
    if (!isSystemAdmin && !hasPermission(ctx, "master_data.lookups.lock")) {
      return { success: false, error: "Lock permission required" };
    }

    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found" };
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("ports")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Port not found" };
    }

    const { error: updateError } = await supabase
      .from("ports")
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
      entity_name: "ports",
      entity_id: id,
      entity_reference: existing.port_code,
      action: is_locked ? "port.lock" : "port.unlock",
      old_values: { is_locked: existing.is_locked },
      new_values: { is_locked },
      owner_company_id: ctx.profile.owner_company_id,
      branch_id: ctx.profile.branch_id,
    });

    revalidatePath("/admin/master-data/geography/ports");
    return { success: true };
  } catch (error) {
    console.error("togglePortLock exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
