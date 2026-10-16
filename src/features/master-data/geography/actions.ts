"use server";

import {createClient} from "@/lib/supabase/server";
import {getAuthContext,hasPermission} from "@/lib/rbac/check";
import type {WorkspaceFieldErrors} from "@/lib/workspace/field-errors";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import {saveGeographyInput} from "@/server/geography-save";
import {
 createCountrySchema,updateCountrySchema,type CreateCountryInput,type UpdateCountryInput,
 createEmirateSchema,updateEmirateSchema,type CreateEmirateInput,type UpdateEmirateInput,
 createCitySchema,updateCitySchema,type CreateCityInput,type UpdateCityInput,
 createAreaZoneSchema,updateAreaZoneSchema,type CreateAreaZoneInput,type UpdateAreaZoneInput,
 createPortSchema,updatePortSchema,type CreatePortInput,type UpdatePortInput,
 toggleGeographyStatusSchema,toggleGeographyLockSchema,type ToggleGeographyStatusInput,
} from "./validation";
import type {Country,Emirate,CityWithEmirate,AreaZoneWithRelations,PortWithRelations} from "./types";

export type ActionResult<T=unknown>={success:boolean;data?:T;error?:string;fieldErrors?:WorkspaceFieldErrors};

export async function createCountry(input:CreateCountryInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('countries','save',input,createCountrySchema,contract);
}
export async function updateCountry(input:UpdateCountryInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('countries','save',input,updateCountrySchema,contract);
}
export async function toggleCountryStatus(input:ToggleGeographyStatusInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('countries','active',input,toggleGeographyStatusSchema,contract);
}
/** Historical export retained for callers; this retires without deleting history. */
export async function deleteCountry(id:number,contract?:WorkspaceSaveContract){
 return saveGeographyInput('countries','retire',{id,is_active:false},toggleGeographyStatusSchema,contract);
}
export async function toggleCountryLock(id:number,is_locked:boolean,contract?:WorkspaceSaveContract){
 return saveGeographyInput('countries','lock',{id,is_locked},toggleGeographyLockSchema,contract);
}

export async function createEmirate(input:CreateEmirateInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('emirates','save',input,createEmirateSchema,contract);
}
export async function updateEmirate(input:UpdateEmirateInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('emirates','save',input,updateEmirateSchema,contract);
}
export async function toggleEmirateStatus(input:ToggleGeographyStatusInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('emirates','active',input,toggleGeographyStatusSchema,contract);
}
/** Historical export retained for callers; this retires without deleting history. */
export async function deleteEmirate(id:number,contract?:WorkspaceSaveContract){
 return saveGeographyInput('emirates','retire',{id,is_active:false},toggleGeographyStatusSchema,contract);
}
export async function toggleEmirateLock(id:number,is_locked:boolean,contract?:WorkspaceSaveContract){
 return saveGeographyInput('emirates','lock',{id,is_locked},toggleGeographyLockSchema,contract);
}

export async function createCity(input:CreateCityInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('cities','save',input,createCitySchema,contract);
}
export async function updateCity(input:UpdateCityInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('cities','save',input,updateCitySchema,contract);
}
export async function toggleCityStatus(input:ToggleGeographyStatusInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('cities','active',input,toggleGeographyStatusSchema,contract);
}
/** Historical export retained for callers; this retires without deleting history. */
export async function deleteCity(id:number,contract?:WorkspaceSaveContract){
 return saveGeographyInput('cities','retire',{id,is_active:false},toggleGeographyStatusSchema,contract);
}
export async function toggleCityLock(id:number,is_locked:boolean,contract?:WorkspaceSaveContract){
 return saveGeographyInput('cities','lock',{id,is_locked},toggleGeographyLockSchema,contract);
}

export async function createAreaZone(input:CreateAreaZoneInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('areas_zones','save',input,createAreaZoneSchema,contract);
}
export async function updateAreaZone(input:UpdateAreaZoneInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('areas_zones','save',input,updateAreaZoneSchema,contract);
}
export async function toggleAreaZoneStatus(input:ToggleGeographyStatusInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('areas_zones','active',input,toggleGeographyStatusSchema,contract);
}
/** Historical export retained for callers; this retires without deleting history. */
export async function deleteAreaZone(id:number,contract?:WorkspaceSaveContract){
 return saveGeographyInput('areas_zones','retire',{id,is_active:false},toggleGeographyStatusSchema,contract);
}
export async function toggleAreaZoneLock(id:number,is_locked:boolean,contract?:WorkspaceSaveContract){
 return saveGeographyInput('areas_zones','lock',{id,is_locked},toggleGeographyLockSchema,contract);
}

export async function createPort(input:CreatePortInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('ports','save',input,createPortSchema,contract);
}
export async function updatePort(input:UpdatePortInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('ports','save',input,updatePortSchema,contract);
}
export async function togglePortStatus(input:ToggleGeographyStatusInput,contract?:WorkspaceSaveContract){
 return saveGeographyInput('ports','active',input,toggleGeographyStatusSchema,contract);
}
/** Historical export retained for callers; this retires without deleting history. */
export async function deletePort(id:number,contract?:WorkspaceSaveContract){
 return saveGeographyInput('ports','retire',{id,is_active:false},toggleGeographyStatusSchema,contract);
}
export async function togglePortLock(id:number,is_locked:boolean,contract?:WorkspaceSaveContract){
 return saveGeographyInput('ports','lock',{id,is_locked},toggleGeographyLockSchema,contract);
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
      const { city, ...rest } = area;
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

export async function getEmirateById(id: number): Promise<ActionResult<Emirate>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.from("emirates").select("*").eq("id", id).single();
    if (error) { console.error("getEmirateById error", error); return { success: false, error: error.message }; }
    if (!data) return { success: false, error: "Emirate not found" };
    return { success: true, data };
  } catch (error) {
    console.error("getEmirateById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getCityById(id: number): Promise<ActionResult<CityWithEmirate>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cities")
      .select("*, emirate:emirates(id, emirate_name_en, emirate_name_ar, emirate_code, country_id)")
      .eq("id", id)
      .single();
    if (error) { console.error("getCityById error", error); return { success: false, error: error.message }; }
    if (!data) return { success: false, error: "City not found" };
    return { success: true, data: data as CityWithEmirate };
  } catch (error) {
    console.error("getCityById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getAreaById(id: number): Promise<ActionResult<AreaZoneWithRelations>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("area_zones")
      .select("*, city:cities(id, city_name_en, emirate_id), emirate:emirates(id, emirate_name_en, country_id)")
      .eq("id", id)
      .single();
    if (error) { console.error("getAreaById error", error); return { success: false, error: error.message }; }
    if (!data) return { success: false, error: "Area not found" };
    return { success: true, data: data as AreaZoneWithRelations };
  } catch (error) {
    console.error("getAreaById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getPortById(id: number): Promise<ActionResult<PortWithRelations>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.geography.view")) {
      return { success: false, error: "You do not have permission to view geography data" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ports")
      .select("*, country:countries(id, country_name_en, country_code)")
      .eq("id", id)
      .single();
    if (error) { console.error("getPortById error", error); return { success: false, error: error.message }; }
    if (!data) return { success: false, error: "Port not found" };
    return { success: true, data: data as PortWithRelations };
  } catch (error) {
    console.error("getPortById exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
