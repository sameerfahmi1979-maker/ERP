"use server";

/**
 * Global ERP Report Center — Report Schedules Server Actions
 * Phase: REPORT.5 — Email / Scheduling / Report History / Security UAT
 *
 * Foundation for scheduled report delivery (CRUD + ad-hoc "Run now").
 *
 * OUTPUT.7 (WP11): automated processing moved to the authenticated internal
 * worker route `/api/internal/report-schedules/process` backed by
 * `src/lib/report-center/schedule-worker.ts` (lease/lock, idempotent
 * run-once per due slot, bounded retries). The former unauthenticated
 * `processDueReportSchedules` server action was removed.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import {
  executeScheduleRun,
  calculateNextRunAt,
} from "@/lib/report-center/schedule-execution";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface ReportSchedule {
  id: number;
  schedule_code: string | null;
  report_id: number;
  created_by: number;
  owner_company_id: number | null;
  schedule_name: string;
  filters_json: Record<string, unknown>;
  selected_template_id: number | null;
  output_format: "pdf" | "excel" | "csv";
  recipient_to: string[];
  recipient_cc: string[] | null;
  email_subject_template: string | null;
  email_body_template: string | null;
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: "success" | "failed" | "skipped" | "cancelled" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  report?: {
    report_code: string;
    report_name_en: string;
    module_code: string;
    supports_scheduling: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// List report schedules
// ─────────────────────────────────────────────────────────────────────────────

export async function listReportSchedules(): Promise<ActionResult<ReportSchedule[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const canViewAll =
      hasPermission(ctx, "reports.schedule.view") ||
      hasPermission(ctx, "reports.schedule.manage");

    // Users without schedule permissions may only see their own schedules.
    // Users with schedule view/manage permissions see all schedules.
    const db = createAdminClient();

    let query = db
      .from("erp_report_schedules")
      .select(`
        *,
        report:erp_report_registry(report_code, report_name_en, module_code, supports_scheduling)
      `)
      .is("deleted_at", null)
      .order("schedule_name");

    if (!canViewAll) {
      // Scope to own schedules only
      query = query.eq("created_by", ctx.profile.id);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ReportSchedule[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Get single report schedule
// ─────────────────────────────────────────────────────────────────────────────

export async function getReportSchedule(id: number): Promise<ActionResult<ReportSchedule>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const db = createAdminClient();

    const { data, error } = await db
      .from("erp_report_schedules")
      .select(`
        *,
        report:erp_report_registry(report_code, report_name_en, module_code, supports_scheduling)
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Schedule not found." };

    const rec = data as ReportSchedule;
    const isOwner = rec.created_by === ctx.profile.id;
    const canView =
      hasPermission(ctx, "reports.schedule.view") ||
      hasPermission(ctx, "reports.schedule.manage");

    if (!isOwner && !canView) {
      return { success: false, error: "Permission denied." };
    }

    return { success: true, data: rec };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Create report schedule
// ─────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  reportCode: z.string().min(1).max(100),
  scheduleName: z.string().min(1).max(200),
  filtersJson: z.record(z.string(), z.unknown()).optional().default({}),
  selectedTemplateId: z.number().int().positive().nullable().optional(),
  ownerCompanyId: z.number().int().positive().nullable().optional(),
  outputFormat: z.enum(["pdf", "excel", "csv"]).default("pdf"),
  recipientTo: z.array(z.string().email()).min(1, "At least one recipient is required"),
  recipientCc: z.array(z.string().email()).optional().default([]),
  emailSubjectTemplate: z.string().max(500).optional(),
  emailBodyTemplate: z.string().max(5000).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().default("Asia/Dubai"),
  isActive: z.boolean().default(true),
});

export async function createReportSchedule(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (
      !hasPermission(ctx, "reports.schedule.manage") &&
      !hasPermission(ctx, "reports.run")
    ) {
      return { success: false, error: "Permission denied." };
    }
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }
    if (!hasPermission(ctx, "reports.email")) {
      return { success: false, error: "You need reports.email permission to create scheduled email deliveries." };
    }

    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }

    const db = createAdminClient();

    const { data: registry } = await db
      .from("erp_report_registry")
      .select("id, required_permissions, sensitive_profile")
      .eq("report_code", parsed.data.reportCode)
      .eq("is_active", true)
      .maybeSingle();

    if (!registry) {
      return { success: false, error: `Report '${parsed.data.reportCode}' not found or inactive.` };
    }

    const reg = registry as { id: number; required_permissions: string[]; sensitive_profile: string };

    const missingPerms = reg.required_permissions.filter(
      (p) => !ctx.permissionCodes.includes(p)
    );
    if (missingPerms.length > 0) {
      return {
        success: false,
        error: `You are missing required report permissions: ${missingPerms.join(", ")}`,
      };
    }

    const scheduleCode = `SCH-${Date.now()}`;

    const nextRunAt = calculateNextRunAt(
      parsed.data.frequency,
      parsed.data.dayOfWeek ?? null,
      parsed.data.dayOfMonth ?? null,
      parsed.data.timeOfDay ?? "07:00",
      parsed.data.timezone
    );

    const { data, error } = await db
      .from("erp_report_schedules")
      .insert({
        schedule_code: scheduleCode,
        report_id: reg.id,
        created_by: ctx.profile.id,
        owner_company_id: parsed.data.ownerCompanyId ?? null,
        schedule_name: parsed.data.scheduleName,
        filters_json: parsed.data.filtersJson,
        selected_template_id: parsed.data.selectedTemplateId ?? null,
        output_format: parsed.data.outputFormat,
        recipient_to: parsed.data.recipientTo,
        recipient_cc: parsed.data.recipientCc,
        email_subject_template: parsed.data.emailSubjectTemplate ?? null,
        email_body_template: parsed.data.emailBodyTemplate ?? null,
        frequency: parsed.data.frequency,
        day_of_week: parsed.data.dayOfWeek ?? null,
        day_of_month: parsed.data.dayOfMonth ?? null,
        time_of_day: parsed.data.timeOfDay ?? "07:00",
        timezone: parsed.data.timezone,
        next_run_at: nextRunAt,
        is_active: parsed.data.isActive,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "REPORTS",
      entity_name: "erp_report_schedules",
      entity_id: (data as { id: number }).id,
      entity_reference: scheduleCode,
      action: "create",
      new_values: { report_code: parsed.data.reportCode, frequency: parsed.data.frequency },
    });

    revalidatePath("/admin/reports/schedules");
    return { success: true, data: { id: (data as { id: number }).id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update report schedule
// ─────────────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  id: z.number().int().positive(),
  scheduleName: z.string().min(1).max(200).optional(),
  filtersJson: z.record(z.string(), z.unknown()).optional(),
  selectedTemplateId: z.number().int().positive().nullable().optional(),
  ownerCompanyId: z.number().int().positive().nullable().optional(),
  outputFormat: z.enum(["pdf", "excel", "csv"]).optional(),
  recipientTo: z.array(z.string().email()).optional(),
  recipientCc: z.array(z.string().email()).optional(),
  emailSubjectTemplate: z.string().max(500).nullable().optional(),
  emailBodyTemplate: z.string().max(5000).nullable().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function updateReportSchedule(
  input: z.infer<typeof updateSchema>
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const db = createAdminClient();

    const { data: existing } = await db
      .from("erp_report_schedules")
      .select("id, created_by, frequency, day_of_week, day_of_month, time_of_day, timezone")
      .eq("id", parsed.data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Schedule not found." };

    const rec = existing as {
      id: number;
      created_by: number;
      frequency: string;
      day_of_week: number | null;
      day_of_month: number | null;
      time_of_day: string | null;
      timezone: string;
    };

    const isOwner = rec.created_by === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.schedule.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "You can only edit your own schedules." };
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.scheduleName !== undefined) updates.schedule_name = parsed.data.scheduleName;
    if (parsed.data.filtersJson !== undefined) updates.filters_json = parsed.data.filtersJson;
    if (parsed.data.selectedTemplateId !== undefined) updates.selected_template_id = parsed.data.selectedTemplateId;
    if (parsed.data.ownerCompanyId !== undefined) updates.owner_company_id = parsed.data.ownerCompanyId;
    if (parsed.data.outputFormat !== undefined) updates.output_format = parsed.data.outputFormat;
    if (parsed.data.recipientTo !== undefined) updates.recipient_to = parsed.data.recipientTo;
    if (parsed.data.recipientCc !== undefined) updates.recipient_cc = parsed.data.recipientCc;
    if (parsed.data.emailSubjectTemplate !== undefined) updates.email_subject_template = parsed.data.emailSubjectTemplate;
    if (parsed.data.emailBodyTemplate !== undefined) updates.email_body_template = parsed.data.emailBodyTemplate;
    if (parsed.data.frequency !== undefined) updates.frequency = parsed.data.frequency;
    if (parsed.data.dayOfWeek !== undefined) updates.day_of_week = parsed.data.dayOfWeek;
    if (parsed.data.dayOfMonth !== undefined) updates.day_of_month = parsed.data.dayOfMonth;
    if (parsed.data.timeOfDay !== undefined) updates.time_of_day = parsed.data.timeOfDay;
    if (parsed.data.timezone !== undefined) updates.timezone = parsed.data.timezone;
    if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive;

    const newFrequency = (parsed.data.frequency ?? rec.frequency) as "daily" | "weekly" | "monthly";
    const newDayOfWeek = parsed.data.dayOfWeek !== undefined ? parsed.data.dayOfWeek : rec.day_of_week;
    const newDayOfMonth = parsed.data.dayOfMonth !== undefined ? parsed.data.dayOfMonth : rec.day_of_month;
    const newTimeOfDay = parsed.data.timeOfDay ?? rec.time_of_day ?? "07:00";
    const newTimezone = parsed.data.timezone ?? rec.timezone;

    updates.next_run_at = calculateNextRunAt(newFrequency, newDayOfWeek, newDayOfMonth, newTimeOfDay, newTimezone);

    const { error } = await db
      .from("erp_report_schedules")
      .update(updates)
      .eq("id", parsed.data.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/admin/reports/schedules");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete report schedule (soft delete)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteReportSchedule(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const db = createAdminClient();

    const { data: existing } = await db
      .from("erp_report_schedules")
      .select("id, created_by, schedule_code")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing) return { success: false, error: "Schedule not found." };

    const rec = existing as { id: number; created_by: number; schedule_code: string };
    const isOwner = rec.created_by === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.schedule.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "You can only delete your own schedules." };
    }

    const { error } = await db
      .from("erp_report_schedules")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: ctx.profile.id,
        is_active: false,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "REPORTS",
      entity_name: "erp_report_schedules",
      entity_id: id,
      entity_reference: rec.schedule_code,
      action: "delete",
      new_values: { deleted_at: new Date().toISOString() },
    });

    revalidatePath("/admin/reports/schedules");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run schedule now (ad-hoc trigger)
// ─────────────────────────────────────────────────────────────────────────────

export async function runReportScheduleNow(
  id: number
): Promise<ActionResult<{ deliveryLogId?: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "User profile not found." };
    }

    const db = createAdminClient();

    const { data: schedule } = await db
      .from("erp_report_schedules")
      .select(`
        *,
        report:erp_report_registry(
          id, report_code, report_name_en, required_permissions,
          sensitive_profile, is_active, supports_scheduling
        )
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!schedule) return { success: false, error: "Schedule not found." };

    const sched = schedule as ReportSchedule & {
      report: {
        id: number;
        report_code: string;
        report_name_en: string;
        required_permissions: string[];
        sensitive_profile: string;
        is_active: boolean;
      };
    };

    const isOwner = sched.created_by === ctx.profile.id;
    const canManage = hasPermission(ctx, "reports.schedule.manage");

    if (!isOwner && !canManage) {
      return { success: false, error: "Permission denied." };
    }

    const res = await executeScheduleRun(sched, ctx.permissionCodes);
    return {
      success: res.success,
      data: { deliveryLogId: res.deliveryLogId },
      error: res.error,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
