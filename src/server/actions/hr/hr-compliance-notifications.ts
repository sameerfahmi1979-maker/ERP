"use server";

/**
 * DMS.1 — HR Compliance Expiry Notifications
 *
 * Scans employee_identity_documents and employee_medical_insurances
 * for documents expiring within the configured reminder windows.
 * Outputs to erp_notifications (in-app) and optionally erp_email_queue.
 *
 * Called manually from the notifications admin UI as a standalone action.
 * The DMS expiry scheduler does NOT call this automatically in DMS.1
 * (deferred to DMS.2 or HR.15 when full HR manager relationships are modeled).
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function canRun(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    isGlobalAdmin(ctx) ||
    hasPermission(ctx, "hr.admin") ||
    hasPermission(ctx, "hr.compliance.manage") ||
    hasPermission(ctx, "notifications.admin")
  );
}

const HR_REMINDER_DAYS = [90, 60, 30, 14, 7, 1, 0];

// ── generateHrComplianceExpiryNotifications ──────────────────────────────────

export type HrComplianceExpiryResult = {
  identity_docs_scanned: number;
  medical_insurance_scanned: number;
  notifications_created: number;
  skipped: number;
  errors: string[];
};

export async function generateHrComplianceExpiryNotifications(options: {
  /** If set, only check documents expiring within this many days */
  withinDays?: number;
  limit?: number;
} = {}): Promise<ActionResult<HrComplianceExpiryResult>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRun(ctx)) return { success: false, error: "Permission denied — hr.compliance.manage required" };

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const maxDays = options.withinDays ?? 90;
    const futureDate = new Date(today.getTime() + maxDays * 86_400_000).toISOString().split("T")[0];
    const limit = Math.min(options.limit ?? 200, 500);

    const result: HrComplianceExpiryResult = {
      identity_docs_scanned: 0,
      medical_insurance_scanned: 0,
      notifications_created: 0,
      skipped: 0,
      errors: [],
    };

    const now = new Date().toISOString();

    // ── 1. Employee Identity Documents ────────────────────────────────────────
    const { data: identityDocs, error: idErr } = await supabase
      .from("employee_identity_documents")
      .select(`
        id, employee_id, document_type, document_number, expiry_date,
        employee:employees!employee_id(id, full_name_en, employee_code, created_by)
      `)
      .not("expiry_date", "is", null)
      .lte("expiry_date", futureDate)
      .is("deleted_at", null)
      .limit(limit);

    if (idErr) {
      result.errors.push(`identity_docs fetch: ${idErr.message}`);
    } else {
      result.identity_docs_scanned = (identityDocs ?? []).length;

      for (const doc of identityDocs ?? []) {
        const d = doc as Record<string, unknown>;
        const emp = d.employee as Record<string, unknown> | null;
        if (!emp) { result.skipped++; continue; }

        const expiryDate = d.expiry_date as string;
        const daysRemaining = Math.round(
          (new Date(expiryDate).getTime() - today.getTime()) / 86_400_000
        );

        // Find closest reminder window
        const reminderDay = HR_REMINDER_DAYS.find((r) => daysRemaining <= r && daysRemaining >= 0) ?? 0;
        const isExpired = daysRemaining < 0;

        const notificationCode = `HR_COMPLIANCE_ID_${d.id}_DAYS_${Math.abs(daysRemaining)}`;

        // Skip if we already sent a notification for this exact window recently (idempotency)
        const { count: existing } = await supabase
          .from("erp_notifications")
          .select("id", { count: "exact", head: true })
          .eq("notification_code", notificationCode);

        if ((existing ?? 0) > 0) { result.skipped++; continue; }

        const recipientId = emp.created_by as number | null;
        if (!recipientId) { result.skipped++; continue; }

        const severity = isExpired ? "urgent" : daysRemaining <= 7 ? "warning" : "info";
        const title = isExpired
          ? `EXPIRED: ${d.document_type} for ${emp.full_name_en}`
          : `Expiry Alert: ${d.document_type} for ${emp.full_name_en} (${daysRemaining}d)`;
        const message = isExpired
          ? `${d.document_type} (${d.document_number}) for employee ${emp.employee_code} expired on ${expiryDate}.`
          : `${d.document_type} (${d.document_number}) for employee ${emp.employee_code} expires on ${expiryDate} (${daysRemaining} days remaining).`;

        const { error: notifErr } = await supabase.from("erp_notifications").insert({
          notification_code: notificationCode,
          source_module: "HR",
          source_entity_type: "employee_identity_documents",
          source_entity_id: d.id as number,
          notification_type: isExpired ? "compliance_expired" : "compliance_expiry_reminder",
          severity,
          title,
          message,
          recipient_user_id: recipientId,
          channel_in_app: true,
          channel_email: false,
          scheduled_for: now,
          action_url: `/admin/hr/employees/record/${d.employee_id}`,
          action_label: "View Employee",
          metadata_json: {
            employee_id: d.employee_id,
            document_type: d.document_type,
            document_number: d.document_number,
            expiry_date: expiryDate,
            days_remaining: daysRemaining,
          },
          created_at: now,
          updated_at: now,
        });

        if (!notifErr) {
          result.notifications_created++;
        } else {
          result.skipped++;
        }
      }
    }

    // ── 2. Employee Medical Insurances ────────────────────────────────────────
    const { data: medDocs, error: medErr } = await supabase
      .from("employee_medical_insurances")
      .select(`
        id, employee_id, insurance_provider, policy_number, expiry_date,
        employee:employees!employee_id(id, full_name_en, employee_code, created_by)
      `)
      .not("expiry_date", "is", null)
      .lte("expiry_date", futureDate)
      .is("deleted_at", null)
      .limit(limit);

    if (medErr) {
      result.errors.push(`medical_insurance fetch: ${medErr.message}`);
    } else {
      result.medical_insurance_scanned = (medDocs ?? []).length;

      for (const doc of medDocs ?? []) {
        const d = doc as Record<string, unknown>;
        const emp = d.employee as Record<string, unknown> | null;
        if (!emp) { result.skipped++; continue; }

        const expiryDate = d.expiry_date as string;
        const daysRemaining = Math.round(
          (new Date(expiryDate).getTime() - today.getTime()) / 86_400_000
        );
        const isExpired = daysRemaining < 0;

        const notificationCode = `HR_COMPLIANCE_MED_${d.id}_DAYS_${Math.abs(daysRemaining)}`;

        const { count: existing } = await supabase
          .from("erp_notifications")
          .select("id", { count: "exact", head: true })
          .eq("notification_code", notificationCode);

        if ((existing ?? 0) > 0) { result.skipped++; continue; }

        const recipientId = emp.created_by as number | null;
        if (!recipientId) { result.skipped++; continue; }

        const severity = isExpired ? "urgent" : daysRemaining <= 7 ? "warning" : "info";
        const title = isExpired
          ? `EXPIRED: Medical Insurance for ${emp.full_name_en}`
          : `Expiry Alert: Medical Insurance for ${emp.full_name_en} (${daysRemaining}d)`;
        const message = isExpired
          ? `Medical insurance (${d.policy_number}) for employee ${emp.employee_code} expired on ${expiryDate}.`
          : `Medical insurance (${d.policy_number}) for employee ${emp.employee_code} expires on ${expiryDate} (${daysRemaining} days remaining).`;

        const { error: notifErr } = await supabase.from("erp_notifications").insert({
          notification_code: notificationCode,
          source_module: "HR",
          source_entity_type: "employee_medical_insurances",
          source_entity_id: d.id as number,
          notification_type: isExpired ? "compliance_expired" : "compliance_expiry_reminder",
          severity,
          title,
          message,
          recipient_user_id: recipientId,
          channel_in_app: true,
          channel_email: false,
          scheduled_for: now,
          action_url: `/admin/hr/employees/record/${d.employee_id}`,
          action_label: "View Employee",
          metadata_json: {
            employee_id: d.employee_id,
            insurance_provider: d.insurance_provider,
            policy_number: d.policy_number,
            expiry_date: expiryDate,
            days_remaining: daysRemaining,
          },
          created_at: now,
          updated_at: now,
        });

        if (!notifErr) {
          result.notifications_created++;
        } else {
          result.skipped++;
        }
      }
    }

    await logAudit({
      module_code: "HR",
      entity_name: "erp_notifications",
      entity_id: 0,
      entity_reference: "hr-compliance-expiry-scan",
      action: "create",
      new_values: result,
    });

    revalidatePath("/notifications");
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
