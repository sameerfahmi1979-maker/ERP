"use server";

/**
 * Global ERP Report Center — Report Schedules Server Actions
 * Phase: REPORT.5 — Email / Scheduling / Report History / Security UAT
 *
 * Foundation for scheduled report delivery.
 * Processing (processDueReportSchedules) is implemented here but requires
 * an external cron trigger (Supabase Edge Function or pg_cron) to run automatically.
 * This is documented as operational follow-up.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { runReport } from "@/lib/report-center/report-runner";
import { sendExportEmail } from "@/server/actions/email";
import { generateAttachmentByType } from "@/lib/export/generate-attachment";
import { resolveTemplateForExport } from "@/server/actions/reports/templates";
import type { ERPExportOptions } from "@/lib/export/export-types";

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

    return await executeScheduleRun(sched, ctx.permissionCodes);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Process due schedules (foundation — call from cron/edge function)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process all active schedules that are due.
 * Intended to be called from a Supabase Edge Function or pg_cron job.
 * Operational follow-up: set up cron to call this endpoint.
 */
export async function processDueReportSchedules(): Promise<ActionResult<{ processed: number; failed: number }>> {
  try {
    const db = createAdminClient();
    const now = new Date().toISOString();

    const { data: dueSchedules } = await db
      .from("erp_report_schedules")
      .select(`
        *,
        report:erp_report_registry(
          id, report_code, report_name_en, required_permissions,
          sensitive_profile, is_active, supports_scheduling
        )
      `)
      .eq("is_active", true)
      .is("deleted_at", null)
      .lte("next_run_at", now)
      .not("next_run_at", "is", null);

    if (!dueSchedules || dueSchedules.length === 0) {
      return { success: true, data: { processed: 0, failed: 0 } };
    }

    let processed = 0;
    let failed = 0;

    for (const schedule of dueSchedules) {
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

      if (!sched.report?.is_active) {
        await markScheduleSkipped(db, sched.id, sched.frequency, sched.day_of_week, sched.day_of_month, sched.time_of_day ?? "07:00", sched.timezone, "Report is inactive");
        failed++;
        continue;
      }

      if (!sched.selected_template_id && sched.owner_company_id === null) {
        await markScheduleSkipped(db, sched.id, sched.frequency, sched.day_of_week, sched.day_of_month, sched.time_of_day ?? "07:00", sched.timezone, "Multi-company report requires template selection");
        failed++;
        continue;
      }

      const creatorPermissions = await getCreatorPermissions(db, sched.created_by);

      const missingPerms = sched.report.required_permissions.filter(
        (p) => !creatorPermissions.includes(p)
      );
      if (missingPerms.length > 0) {
        await markScheduleSkipped(db, sched.id, sched.frequency, sched.day_of_week, sched.day_of_month, sched.time_of_day ?? "07:00", sched.timezone, `Creator missing permissions: ${missingPerms.join(", ")}`);
        failed++;
        continue;
      }

      const result = await executeScheduleRun(sched, creatorPermissions);

      const nextRunAt = calculateNextRunAt(sched.frequency, sched.day_of_week, sched.day_of_month, sched.time_of_day ?? "07:00", sched.timezone);

      await db
        .from("erp_report_schedules")
        .update({
          last_run_at: now,
          last_status: result.success ? "success" : "failed",
          next_run_at: nextRunAt,
          updated_at: now,
        })
        .eq("id", sched.id);

      if (result.success) {
        processed++;
      } else {
        failed++;
      }
    }

    return { success: true, data: { processed, failed } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function executeScheduleRun(
  sched: ReportSchedule & {
    report: {
      id: number;
      report_code: string;
      report_name_en: string;
      required_permissions: string[];
      sensitive_profile: string;
      is_active: boolean;
    };
  },
  permissionCodes: string[]
): Promise<ActionResult<{ deliveryLogId?: number }>> {
  const db = createAdminClient();

  const runResult = await runReport(
    {
      reportCode: sched.report.report_code,
      outputFormat: sched.output_format as "pdf" | "excel" | "csv",
      filters: sched.filters_json,
      templateId: sched.selected_template_id ?? undefined,
      ownerCompanyIds: sched.owner_company_id ? [sched.owner_company_id] : [],
      requestedByUserId: sched.created_by,
    },
    permissionCodes
  );

  if (!runResult.success || !runResult.data) {
    return { success: false, error: runResult.error ?? "Report run failed." };
  }

  const { columns, rows } = runResult.data;

  const exportColumns = columns.map((col) => ({
    key: col,
    header: col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
  const exportData = rows.map((row) =>
    Object.fromEntries(columns.map((col) => [col, row[col] ?? ""]))
  );

  // Resolve report branding from the selected (or run-resolved) template
  const resolvedTemplateId = sched.selected_template_id ?? runResult.resolvedTemplateId;
  let brandingContext: ERPExportOptions<Record<string, unknown>>["branding"] | undefined;
  if (resolvedTemplateId) {
    try {
      const ctx = await resolveTemplateForExport({
        templateId: resolvedTemplateId,
        reportCode: sched.report.report_code,
        permissionCodes,
      });
      brandingContext = ctx ?? undefined;
    } catch (err) {
      logger.warn(`[schedules] Branding resolve failed for schedule ${sched.id}:`, err);
    }
  }

  const exportOptions: ERPExportOptions<Record<string, unknown>> = {
    title: sched.report.report_name_en,
    filename: `${sched.report.report_code}_${new Date().toISOString().split("T")[0]}`,
    columns: exportColumns,
    data: exportData,
    branding: brandingContext,
  };

  let attachment;
  try {
    attachment = await generateAttachmentByType(sched.output_format, exportOptions);
  } catch (err) {
    return { success: false, error: `Attachment generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const subject =
    sched.email_subject_template ??
    `${sched.report.report_name_en} — ${new Date().toLocaleDateString("en-GB")}`;
  const body =
    sched.email_body_template ??
    `Dear Recipient,\n\nPlease find attached the scheduled ${sched.report.report_name_en} report.\n\nRegards,\nERP System`;

  const emailResult = await sendExportEmail({
    to: sched.recipient_to,
    cc: sched.recipient_cc ?? [],
    subject,
    body,
    attachment,
    context: { moduleCode: "reports" },
  });

  const { data: deliveryLog } = await db
    .from("erp_report_delivery_logs")
    .insert({
      run_id: runResult.runId ?? null,
      delivery_type: "scheduled_email",
      recipient_to: sched.recipient_to,
      recipient_cc: sched.recipient_cc ?? [],
      subject,
      body_preview: body.substring(0, 200),
      attachment_format: sched.output_format,
      attachment_filename: attachment.filename,
      attachment_size_bytes: attachment.sizeBytes,
      provider: emailResult.provider ?? "erp_provider",
      delivery_status: emailResult.success ? "sent" : "failed",
      success: emailResult.success,
      sent_at: emailResult.success ? new Date().toISOString() : null,
      error_message: emailResult.success ? null : emailResult.error,
      created_by: sched.created_by,
    })
    .select("id")
    .single();

  return {
    success: emailResult.success,
    data: { deliveryLogId: (deliveryLog as { id?: number } | null)?.id },
    error: emailResult.success ? undefined : emailResult.error,
  };
}

async function markScheduleSkipped(
  db: ReturnType<typeof createAdminClient>,
  scheduleId: number,
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  timeOfDay: string,
  timezone: string,
  reason: string
) {
  const nextRunAt = calculateNextRunAt(
    frequency as "daily" | "weekly" | "monthly",
    dayOfWeek,
    dayOfMonth,
    timeOfDay,
    timezone
  );
  await db
    .from("erp_report_schedules")
    .update({
      last_run_at: new Date().toISOString(),
      last_status: "skipped",
      next_run_at: nextRunAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  logger.warn(`[schedules] Schedule ${scheduleId} skipped: ${reason}`);
}

async function getCreatorPermissions(
  db: ReturnType<typeof createAdminClient>,
  userId: number
): Promise<string[]> {
  try {
    const { data } = await db
      .from("user_role_assignments")
      .select("role:roles(role_permissions(permission:permissions(permission_code)))")
      .eq("user_profile_id", userId)
      .eq("is_active", true);

    if (!data) return [];

    const codes = new Set<string>();
    for (const ura of data) {
      const role = (ura as { role?: { role_permissions?: Array<{ permission?: { permission_code?: string } }> } }).role;
      for (const rp of role?.role_permissions ?? []) {
        if (rp.permission?.permission_code) {
          codes.add(rp.permission.permission_code);
        }
      }
    }
    return Array.from(codes);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timezone-aware date helpers (using built-in Intl — no external dependency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current date/time components in the given IANA timezone.
 */
function getLocalParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return {
    year: get("year"),
    month: get("month") - 1, // 0-indexed for Date.UTC()
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.find((p) => p.type === "weekday")?.value ?? "Sun"
    ),
  };
}

/**
 * Given a local date/time (year, month0, day, hours, minutes) expressed in
 * the target timezone, returns the equivalent UTC Date.
 *
 * Works by computing the timezone offset at a close-by UTC time (one
 * iteration is sufficient for fixed-offset zones like Asia/Dubai and
 * accurate within ±1 minute for DST zones).
 */
function localToUtc(
  year: number,
  month0: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  // First approximation: treat local time as UTC
  const approx = new Date(Date.UTC(year, month0, day, hours, minutes, 0, 0));
  // Find what local time that UTC shows in the target timezone
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(approx);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const localH = get("hour") % 24;
  const localM = get("minute");
  // Offset in milliseconds: how much to shift to get the intended local time
  const diffMs = ((hours - localH) * 60 + (minutes - localM)) * 60_000;
  return new Date(approx.getTime() + diffMs);
}

function calculateNextRunAt(
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  timeOfDay: string,
  timezone: string
): string {
  const tz = timezone || "Asia/Dubai";
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const local = getLocalParts(now, tz);

  if (frequency === "daily") {
    // Attempt today at the scheduled time in the target timezone
    let next = localToUtc(local.year, local.month, local.day, hours, minutes, tz);
    if (next <= now) {
      // Already passed — schedule for tomorrow
      const tomorrow = new Date(now.getTime() + 86_400_000);
      const t = getLocalParts(tomorrow, tz);
      next = localToUtc(t.year, t.month, t.day, hours, minutes, tz);
    }
    return next.toISOString();
  }

  if (frequency === "weekly") {
    const targetDow = dayOfWeek ?? 0;
    const daysUntil = (targetDow - local.dayOfWeek + 7) % 7 || 7;
    const target = new Date(now.getTime() + daysUntil * 86_400_000);
    const t = getLocalParts(target, tz);
    const next = localToUtc(t.year, t.month, t.day, hours, minutes, tz);
    return next.toISOString();
  }

  // monthly
  const targetDay = dayOfMonth ?? 1;
  // Try current month
  let next = localToUtc(local.year, local.month, targetDay, hours, minutes, tz);
  if (next <= now) {
    // Move to next month
    const nextMonth = local.month + 1;
    const nextYear = nextMonth > 11 ? local.year + 1 : local.year;
    const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
    next = localToUtc(nextYear, adjustedMonth, targetDay, hours, minutes, tz);
  }
  return next.toISOString();
}
