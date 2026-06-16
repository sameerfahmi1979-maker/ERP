"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";

export type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type WorkCalendarRow = {
  id: number;
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

const CAL_TYPES = ['standard','ramadan','summer','project','custom'] as const;

const createCalendarSchema = z.object({
  calendar_code: z.string().min(1).max(20),
  calendar_name: z.string().min(1).max(200),
  calendar_type: z.enum(CAL_TYPES).default('standard'),
  owner_company_id: z.number().int().positive().optional().nullable(),
  working_days: z.array(z.string()).default(['mon','tue','wed','thu','fri']),
  weekend_days: z.array(z.string()).default(['sat','sun']),
  has_ramadan_timing: z.boolean().default(false),
  has_summer_timing: z.boolean().default(false),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

const updateCalendarSchema = createCalendarSchema.partial().extend({ id: z.number().int().positive() });

const createShiftSchema = z.object({
  shift_code: z.string().min(1).max(20),
  shift_name: z.string().min(1).max(200),
  calendar_id: z.number().int().positive(),
  shift_start_time: z.string(),
  shift_end_time: z.string(),
  break_start_time: z.string().optional().nullable(),
  break_end_time: z.string().optional().nullable(),
  total_hours: z.number().optional().nullable(),
  is_overnight: z.boolean().default(false),
  ramadan_start_time: z.string().optional().nullable(),
  ramadan_end_time: z.string().optional().nullable(),
  summer_start_time: z.string().optional().nullable(),
  summer_end_time: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

const updateShiftSchema = createShiftSchema.partial().extend({ id: z.number().int().positive() });

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
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
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
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as WorkCalendarRow[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getWorkCalendarById(id: number): Promise<ActionResult<WorkCalendarRow>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_calendars")
      .select("*, owner_company:owner_companies(id,legal_name_en), shifts:work_shifts(*)")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Work calendar not found" };
    return { success: true, data: data as WorkCalendarRow };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createWorkCalendar(input: CreateCalInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createCalendarSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_calendars")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_calendars", entity_id: data.id, entity_reference: parsed.data.calendar_code, action: "create", new_values: parsed.data });
    revalidatePath("/admin/common-master-data/work-calendars");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateWorkCalendar(input: UpdateCalInput): Promise<ActionResult> {
  try {
    const parsed = updateCalendarSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const { id, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("work_calendars")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id!)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_calendars", entity_id: id!, entity_reference: String(id), action: "update", new_values: rest });
    revalidatePath("/admin/common-master-data/work-calendars");
    revalidatePath(`/admin/common-master-data/work-calendars/record/${id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteWorkCalendar(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("work_calendars")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_calendars", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath("/admin/common-master-data/work-calendars");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createWorkShift(input: CreateShiftInput): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createShiftSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_shifts")
      .insert({ ...parsed.data, created_by: ctx.profile?.id ?? null, updated_by: ctx.profile?.id ?? null })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_shifts", entity_id: data.id, entity_reference: parsed.data.shift_code, action: "create", new_values: parsed.data });
    revalidatePath(`/admin/common-master-data/work-calendars/record/${parsed.data.calendar_id}`);
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateWorkShift(input: UpdateShiftInput): Promise<ActionResult> {
  try {
    const parsed = updateShiftSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues.map(i => i.message).join("; ") };
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const { id, ...rest } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("work_shifts")
      .update({ ...rest, updated_by: ctx.profile?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", id!)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_shifts", entity_id: id!, entity_reference: String(id), action: "update", new_values: rest });
    if (rest.calendar_id) revalidatePath(`/admin/common-master-data/work-calendars/record/${rest.calendar_id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteWorkShift(id: number, calendar_id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("work_shifts")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: ctx.profile?.id ?? null })
      .eq("id", id);
    if (error) return { success: false, error: error.message };
    await logAudit({ module_code: "common_md", entity_name: "work_shifts", entity_id: id, entity_reference: String(id), action: "delete" });
    revalidatePath(`/admin/common-master-data/work-calendars/record/${calendar_id}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getWorkCalendarComboboxOptions(search?: string): Promise<ActionResult<{ value: string; label: string }[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canView(ctx)) return { success: false, error: "Permission denied" };
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
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map(r => ({ value: String(r.id), label: `${r.calendar_name} (${r.calendar_code})` })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
