"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {createCalendarSchema,updateCalendarSchema,createShiftSchema,updateShiftSchema} from "@/lib/master-data/calendar-validation";
import {setMasterArchived} from "@/server/master-lifecycle";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import {saveWorkspaceRecord,type WorkspaceSaveResult} from "@/server/workspace-save";
import {workspaceValidationFailure} from "@/lib/workspace/field-errors";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string; kind?: 'forbidden'|'not_found'|'failed'|'invalid_input' };

export type WorkCalendarRow = {
  id: number;
  workspace_revision: number;
  calendar_code: string;
  calendar_name: string;
  calendar_type: string;
  owner_company_id: number | null;
  working_days: string[];
  weekend_days: string[];
  has_ramadan_timing: boolean;
  has_summer_timing: boolean;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_company?: { id: number; legal_name_en: string } | null;
  shifts?: WorkShiftRow[];
};

export type WorkShiftRow = {
  id: number;
  workspace_revision: number;
  shift_code: string;
  shift_name: string;
  calendar_id: number;
  shift_start_time: string;
  shift_end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  total_hours: number | null;
  is_overnight: boolean;
  ramadan_start_time: string | null;
  ramadan_end_time: string | null;
  summer_start_time: string | null;
  summer_end_time: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CreateCalInput = z.infer<typeof createCalendarSchema>;
type UpdateCalInput = z.infer<typeof updateCalendarSchema>;
type CreateShiftInput = z.infer<typeof createShiftSchema>;
type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.view") || hasPermission(ctx, "common_md.work_calendars.view");
}
function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "common_md.manage") || hasPermission(ctx, "common_md.work_calendars.manage");
}

export async function listWorkCalendars(filters?: { owner_company_id?: number; is_active?: boolean; search?: string }): Promise<ActionResult<WorkCalendarRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, kind:'forbidden', error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("work_calendars")
      .select("*, owner_company:owner_companies(id,legal_name_en)")
      .is("deleted_at", null)
      .order("calendar_name");
    if (filters?.owner_company_id) q = q.eq("owner_company_id", filters.owner_company_id);
    if (filters?.is_active !== undefined) q = q.eq("is_active", filters.is_active);
    if (filters?.search) q = q.ilike("calendar_name", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return { success: false, kind:'failed', error: "Work calendars could not be loaded. Try again." };
    return { success: true, data: (data ?? []) as WorkCalendarRow[] };
  } catch {
    return { success: false, kind:'failed', error: "Work calendars could not be loaded. Try again." };
  }
}

export async function getWorkCalendarById(id: number): Promise<ActionResult<WorkCalendarRow>> {
  if(!Number.isSafeInteger(id)||id<=0)return {success:false,kind:'invalid_input',error:'Invalid work calendar identifier.'};
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, kind:'forbidden', error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_calendars")
      .select("*, owner_company:owner_companies(id,legal_name_en), shifts:work_shifts(*)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { success: false, kind:'failed', error: "Work calendar could not be loaded. Try again." };
    // Missing or outside RLS scope is intentionally indistinguishable; never probe with elevated access.
    if (!data) return { success: false, kind:'not_found', error: "Work calendar not found or unavailable to your account." };
    return { success: true, data: data as WorkCalendarRow };
  } catch {
    return { success: false, kind:'failed', error: "Work calendar could not be loaded. Try again." };
  }
}

function revalidateConfirmedPath(path: string) {
  // A display-cache failure cannot revoke the already validated save receipt.
  try { revalidatePath(path); } catch { /* Other targets must still be attempted. */ }
}
function invalidateCalendarSave(result: WorkspaceSaveResult, entity: "work_calendars" | "work_shifts") {
  if (!result.success || !result.data) return;
  revalidateConfirmedPath("/admin/common-master-data/work-calendars");
  revalidateConfirmedPath("/admin/hr/settings/work-shifts");
  const calendarId = entity === "work_calendars" ? result.data.id : result.data.calendar_id;
  if (calendarId) revalidateConfirmedPath(`/admin/common-master-data/work-calendars/record/${calendarId}`);
}

export async function createWorkCalendar(input: CreateCalInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = createCalendarSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  if (!canManage(await getAuthContext())) return {success:false,error:"Permission denied"};
  const result = await saveWorkspaceRecord("work_calendars",null,parsed.data,contract);
  invalidateCalendarSave(result,"work_calendars");
  return result;
}

export async function updateWorkCalendar(input: UpdateCalInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = updateCalendarSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  if (!canManage(await getAuthContext())) return {success:false,error:"Permission denied"};
  const {id,...payload} = parsed.data;
  const result = await saveWorkspaceRecord("work_calendars",id,payload,contract);
  invalidateCalendarSave(result,"work_calendars");
  return result;
}

export async function softDeleteWorkCalendar(id: number,contract:WorkspaceSaveContract) {
  return setMasterArchived('work_calendars',id,true,contract);
}
export async function restoreWorkCalendar(id:number,contract:WorkspaceSaveContract) {
  return setMasterArchived('work_calendars',id,false,contract);
}

export async function createWorkShift(input: CreateShiftInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = createShiftSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  if (!canManage(await getAuthContext())) return {success:false,error:"Permission denied"};
  const result = await saveWorkspaceRecord("work_shifts",null,parsed.data,contract);
  invalidateCalendarSave(result,"work_shifts");
  return result;
}

export async function updateWorkShift(input: UpdateShiftInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed = updateShiftSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  if (!canManage(await getAuthContext())) return {success:false,error:"Permission denied"};
  const {id,...payload} = parsed.data;
  const result = await saveWorkspaceRecord("work_shifts",id,payload,contract);
  invalidateCalendarSave(result,"work_shifts");
  return result;
}

export async function softDeleteWorkShift(id: number, _calendar_id: number,contract:WorkspaceSaveContract) {
  return setMasterArchived('work_shifts',id,true,contract);
}
export async function restoreWorkShift(id:number,contract:WorkspaceSaveContract) {
  return setMasterArchived('work_shifts',id,false,contract);
}

export async function getWorkCalendarComboboxOptions(search?: string): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, kind:'forbidden', error: "Permission denied" };
    const supabase = await createClient();
    let q = supabase
      .from("work_calendars")
      .select("id, calendar_name, calendar_code")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("calendar_name")
      .limit(50);
    if (search) q = q.ilike("calendar_name", `%${search}%`);
    const { data, error } = await q;
    if (error) return { success: false, kind:'failed', error: "Work calendar choices could not be loaded. Try again." };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `${r.calendar_name} (${r.calendar_code})` })) };
  } catch {
    return { success: false, kind:'failed', error: "Work calendar choices could not be loaded. Try again." };
  }
}
