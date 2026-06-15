"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type DmsExpiryReminderRow = {
  id: number;
  document_id: number;
  reminder_days_before: number;
  reminder_date: string;
  status: string;
  notification_status: string;
  sent_at: string | null;
  last_notification_at: string | null;
  retry_count: number;
  dismissed_by: number | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
  escalation_level: number;
  assigned_to: number | null;
  department_code: string | null;
  recipients_json: unknown;
  created_at: string;
  updated_at: string;
  // joined
  document?: { id: number; document_no: string; title: string; expiry_date: string | null } | null;
  dismisser?: { full_name: string | null } | null;
  assignee?: { full_name: string | null } | null;
};

export type DmsExpiryDashboardStats = {
  expired: number;
  expiring_7: number;
  expiring_30: number;
  expiring_60: number;
  expiring_90: number;
  missing_expiry: number;
  pending_reminders: number;
  dismissed_reminders: number;
  open_renewals: number;
};

export type DmsExpiringDocumentRow = {
  id: number;
  document_no: string;
  title: string;
  expiry_date: string | null;
  issue_date: string | null;
  status: string;
  confidentiality: string;
  days_remaining: number | null;
  document_type: string | null;
  category: string | null;
  owner: string | null;
  latest_reminder_status: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function canViewExpiry(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.expiry.view") ||
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canManageExpiry(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.expiry.manage") || hasPermission(ctx, "dms.admin");
}

function canDismissReminder(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.expiry.dismiss") ||
    hasPermission(ctx, "dms.expiry.manage") ||
    hasPermission(ctx, "dms.admin")
  );
}

// Standard reminder days schedule
const REMINDER_DAYS = [90, 60, 30, 14, 7, 1, 0] as const;

// ── getDmsExpiryDashboardStats ─────────────────────────────────────────────────

export async function getDmsExpiryDashboardStats(): Promise<ActionResult<DmsExpiryDashboardStats>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewExpiry(ctx)) return { success: false, error: "Permission denied" };

    const today = new Date().toISOString().split("T")[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0];
    const in90 = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

    const [
      { count: expired },
      { count: expiring_7 },
      { count: expiring_30 },
      { count: expiring_60 },
      { count: expiring_90 },
      { count: missing_expiry },
      { count: pending_reminders },
      { count: dismissed_reminders },
      { count: open_renewals },
    ] = await Promise.all([
      supabase.from("dms_documents").select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null).lt("expiry_date", today).is("deleted_at", null).neq("status", "archived"),
      supabase.from("dms_documents").select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", in7).is("deleted_at", null),
      supabase.from("dms_documents").select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null).gt("expiry_date", in7).lte("expiry_date", in30).is("deleted_at", null),
      supabase.from("dms_documents").select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null).gt("expiry_date", in30).lte("expiry_date", in60).is("deleted_at", null),
      supabase.from("dms_documents").select("id", { count: "exact", head: true })
        .not("expiry_date", "is", null).gt("expiry_date", in60).lte("expiry_date", in90).is("deleted_at", null),
      supabase.from("dms_documents").select("id", { count: "exact", head: true })
        .is("expiry_date", null).is("deleted_at", null).neq("status", "archived"),
      supabase.from("dms_expiry_reminders").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("dms_expiry_reminders").select("id", { count: "exact", head: true }).eq("status", "dismissed"),
      supabase.from("dms_renewal_requests").select("id", { count: "exact", head: true })
        .in("status", ["draft", "requested", "in_progress", "waiting_for_document"]).is("deleted_at", null),
    ]);

    return {
      success: true,
      data: {
        expired: expired ?? 0,
        expiring_7: expiring_7 ?? 0,
        expiring_30: expiring_30 ?? 0,
        expiring_60: expiring_60 ?? 0,
        expiring_90: expiring_90 ?? 0,
        missing_expiry: missing_expiry ?? 0,
        pending_reminders: pending_reminders ?? 0,
        dismissed_reminders: dismissed_reminders ?? 0,
        open_renewals: open_renewals ?? 0,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsExpiringDocuments ───────────────────────────────────────────────────

export type ExpiringDocumentsFilter = {
  view: "expired" | "expiring" | "missing_expiry" | "all";
  limit?: number;
};

export async function getDmsExpiringDocuments(
  filter: ExpiringDocumentsFilter = { view: "expiring" }
): Promise<ActionResult<DmsExpiringDocumentRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewExpiry(ctx)) return { success: false, error: "Permission denied" };

    const today = new Date().toISOString().split("T")[0];
    const in90 = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

    let query = supabase
      .from("dms_documents")
      .select(
        `id, document_no, title, expiry_date, issue_date, status, confidentiality:confidentiality_level,
         document_type:dms_document_types!document_type_id(name_en),
         category:dms_document_types!document_type_id(category:dms_document_categories!category_id(name_en))`,
      )
      .is("deleted_at", null)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(filter.limit ?? 200);

    if (filter.view === "expired") {
      query = query.not("expiry_date", "is", null).lt("expiry_date", today);
    } else if (filter.view === "expiring") {
      query = query.not("expiry_date", "is", null).gte("expiry_date", today).lte("expiry_date", in90);
    } else if (filter.view === "missing_expiry") {
      query = query.is("expiry_date", null).neq("status", "archived");
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const today2 = new Date();
    const rows: DmsExpiringDocumentRow[] = (data ?? []).map((d) => {
      const raw = d as Record<string, unknown>;
      const expiryDate = raw.expiry_date as string | null;
      let daysRemaining: number | null = null;
      if (expiryDate) {
        const exp = new Date(expiryDate);
        daysRemaining = Math.round((exp.getTime() - today2.getTime()) / 86400000);
      }
      const dt = raw.document_type as { name_en?: string } | null;
      const catWrapper = raw.category as { category?: { name_en?: string } } | null;
      return {
        id: raw.id as number,
        document_no: raw.document_no as string,
        title: raw.title as string,
        expiry_date: expiryDate,
        issue_date: raw.issue_date as string | null,
        status: raw.status as string,
        confidentiality: raw.confidentiality as string,
        days_remaining: daysRemaining,
        document_type: dt?.name_en ?? null,
        category: catWrapper?.category?.name_en ?? null,
        owner: null,
        latest_reminder_status: null,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsExpiryReminders ──────────────────────────────────────────────────────

export type ExpiryRemindersFilter = {
  documentId?: number;
  status?: string;
  dueOnly?: boolean;
};

export async function getDmsExpiryReminders(
  filter: ExpiryRemindersFilter = {}
): Promise<ActionResult<DmsExpiryReminderRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewExpiry(ctx)) return { success: false, error: "Permission denied" };

    let query = supabase
      .from("dms_expiry_reminders")
      .select(
        `id, document_id, reminder_days_before, reminder_date, status,
         notification_status, sent_at, last_notification_at, retry_count,
         dismissed_by, dismissed_at, dismissal_reason, escalation_level,
         assigned_to, department_code, recipients_json, created_at, updated_at,
         document:dms_documents!document_id(id, document_no, title, expiry_date),
         dismisser:user_profiles!dismissed_by(full_name),
         assignee:user_profiles!assigned_to(full_name)`
      )
      .order("reminder_date", { ascending: true })
      .limit(500);

    if (filter.documentId) query = query.eq("document_id", filter.documentId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.dueOnly) {
      const today = new Date().toISOString().split("T")[0];
      query = query.lte("reminder_date", today).eq("status", "pending");
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as DmsExpiryReminderRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── generateDmsExpiryRemindersForDocument ─────────────────────────────────────

export async function generateDmsExpiryRemindersForDocument(
  documentId: number
): Promise<ActionResult<{ created: number; skipped: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageExpiry(ctx)) return { success: false, error: "Permission denied" };

    const { data: doc, error: docError } = await supabase
      .from("dms_documents")
      .select("id, document_no, title, expiry_date, status")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !doc) return { success: false, error: "Document not found" };

    const expiryDate = (doc as Record<string, unknown>).expiry_date as string | null;
    if (!expiryDate) {
      return { success: false, error: "Document has no expiry date set" };
    }

    const expiry = new Date(expiryDate);
    const now = new Date();
    let created = 0;
    let skipped = 0;

    for (const daysBefore of REMINDER_DAYS) {
      const reminderDate = new Date(expiry);
      reminderDate.setDate(reminderDate.getDate() - daysBefore);

      const { error: upsertError } = await supabase
        .from("dms_expiry_reminders")
        .upsert(
          {
            document_id: documentId,
            reminder_days_before: daysBefore,
            reminder_date: reminderDate.toISOString().split("T")[0],
            status: reminderDate < now ? "pending" : "pending",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "document_id,reminder_days_before", ignoreDuplicates: false }
        );

      if (upsertError) {
        skipped++;
      } else {
        created++;
      }
    }

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "expiry_reminders_generated",
      description: `Expiry reminder schedule generated: ${created} reminders for expiry ${expiryDate}`,
      performed_by: ctx.profile.id,
      metadata_json: { expiry_date: expiryDate, created, skipped },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_expiry_reminders",
      entity_id: documentId,
      entity_reference: (doc as Record<string, unknown>).document_no as string,
      action: "create",
      new_values: { expiry_date: expiryDate, created, skipped },
    });

    revalidatePath("/dms/expiring");
    revalidatePath(`/dms/documents/record/${documentId}`);
    return { success: true, data: { created, skipped } };
  } catch (e) {
    console.error("generateDmsExpiryRemindersForDocument", e);
    return { success: false, error: String(e) };
  }
}

// ── rebuildDmsExpiryReminders ──────────────────────────────────────────────────

export async function rebuildDmsExpiryReminders(
  documentId: number
): Promise<ActionResult<{ created: number; cancelled: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageExpiry(ctx)) return { success: false, error: "Permission denied" };

    // Cancel all pending reminders first
    const cancelResult = await supabase
      .from("dms_expiry_reminders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("document_id", documentId)
      .eq("status", "pending")
      .select("id");
    const cancelled = cancelResult.data?.length ?? 0;

    // Regenerate
    const result = await generateDmsExpiryRemindersForDocument(documentId);
    if (!result.success) return { success: false, error: result.error };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "expiry_schedule_rebuilt",
      description: `Expiry reminder schedule rebuilt. ${cancelled ?? 0} old reminders cancelled.`,
      performed_by: ctx.profile.id,
      metadata_json: { cancelled: cancelled ?? 0, created: result.data?.created ?? 0 },
    });

    revalidatePath("/dms/expiring");
    revalidatePath(`/dms/documents/record/${documentId}`);
    return { success: true, data: { created: result.data?.created ?? 0, cancelled: cancelled ?? 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── generateDmsExpiryRemindersBulk ────────────────────────────────────────────

export async function generateDmsExpiryRemindersBulk(
  options: { limit?: number; onlyMissingSchedule?: boolean } = {}
): Promise<ActionResult<{ processed: number; errors: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageExpiry(ctx)) return { success: false, error: "Permission denied" };

    const { data: docs, error } = await supabase
      .from("dms_documents")
      .select("id, document_no")
      .not("expiry_date", "is", null)
      .is("deleted_at", null)
      .neq("status", "archived")
      .limit(options.limit ?? 100);

    if (error) return { success: false, error: error.message };

    let processed = 0;
    let errors = 0;
    for (const doc of docs ?? []) {
      const result = await generateDmsExpiryRemindersForDocument(doc.id);
      if (result.success) processed++;
      else errors++;
    }

    revalidatePath("/dms/expiring");
    return { success: true, data: { processed, errors } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── dismissDmsExpiryReminder ───────────────────────────────────────────────────

const DismissSchema = z.object({
  reminderId: z.number().int().positive(),
  reason: z.string().max(1000).optional(),
});

export async function dismissDmsExpiryReminder(
  reminderId: number,
  reason?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canDismissReminder(ctx)) return { success: false, error: "Permission denied" };

    const parsed = DismissSchema.safeParse({ reminderId, reason });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { data: reminder, error: fetchErr } = await supabase
      .from("dms_expiry_reminders")
      .select("id, document_id")
      .eq("id", reminderId)
      .single();

    if (fetchErr || !reminder) return { success: false, error: "Reminder not found" };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("dms_expiry_reminders")
      .update({
        status: "dismissed",
        dismissed_by: ctx.profile.id,
        dismissed_at: now,
        dismissal_reason: reason ?? null,
        updated_at: now,
      })
      .eq("id", reminderId);

    if (error) return { success: false, error: error.message };

    const rem = reminder as Record<string, unknown>;
    await supabase.from("dms_document_events").insert({
      document_id: rem.document_id,
      event_type: "expiry_reminder_dismissed",
      description: `Reminder dismissed${reason ? `: ${reason}` : ""}`,
      performed_by: ctx.profile.id,
      metadata_json: { reminder_id: reminderId, reason },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_expiry_reminders",
      entity_id: reminderId,
      entity_reference: String(rem.document_id),
      action: "update",
      new_values: { status: "dismissed", reason },
    });

    revalidatePath("/dms/expiring");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── markDmsExpiryReminderHandled ───────────────────────────────────────────────

export async function markDmsExpiryReminderHandled(reminderId: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageExpiry(ctx)) return { success: false, error: "Permission denied" };

    const { data: reminder, error: fetchErr } = await supabase
      .from("dms_expiry_reminders")
      .select("id, document_id")
      .eq("id", reminderId)
      .single();

    if (fetchErr || !reminder) return { success: false, error: "Reminder not found" };

    const now = new Date().toISOString();
    await supabase
      .from("dms_expiry_reminders")
      .update({ status: "sent", sent_at: now, updated_at: now })
      .eq("id", reminderId);

    const rem = reminder as Record<string, unknown>;
    await supabase.from("dms_document_events").insert({
      document_id: rem.document_id,
      event_type: "expiry_reminder_handled",
      description: "Expiry reminder marked as handled",
      performed_by: ctx.profile.id,
      metadata_json: { reminder_id: reminderId },
    });

    revalidatePath("/dms/expiring");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
