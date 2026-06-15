"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

export type SessionCleanupCandidate = {
  id: number;
  session_code: string;
  status: string;
  original_filename: string;
  file_size_bytes: number;
  temp_storage_path: string | null;
  uploaded_at: string;
  expires_at: string | null;
  temp_cleaned_at: string | null;
};

export type CleanupResult = {
  scanned: number;
  cleaned: number;
  failed: number;
  skipped: number;
  total_bytes_freed: number;
  candidates: SessionCleanupCandidate[];
  errors: { session_id: number; error: string }[];
};

// Cleanup thresholds in hours
const CLEANUP_THRESHOLDS_HOURS: Record<string, number> = {
  completed: 24,
  cancelled: 24,
  failed: 168, // 7 days
  expired: 336, // 14 days
};

const CleanupOptionsSchema = z.object({
  dryRun: z.boolean().default(true),
  statusFilter: z.array(z.string()).optional(),
  olderThanHours: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(500).default(100),
});

export type CleanupOptions = z.infer<typeof CleanupOptionsSchema>;

// ── markExpiredDmsUploadSessions ───────────────────────────────────────────────

export async function markExpiredDmsUploadSessions(): Promise<ActionResult<{ marked: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin") && !hasPermission(ctx, "dms.documents.upload")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data: expired, error: fetchError } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code")
      .lt("expires_at", now)
      .in("status", ["uploaded", "duplicate_detected", "ready_to_attach"])
      .is("deleted_at", null);

    if (fetchError) return { success: false, error: fetchError.message };

    const expiredIds = (expired ?? []).map((r: { id: number }) => r.id);
    if (expiredIds.length === 0) return { success: true, data: { marked: 0 } };

    const { error: updateError } = await supabase
      .from("dms_upload_sessions")
      .update({ status: "expired", updated_at: now })
      .in("id", expiredIds);

    if (updateError) return { success: false, error: updateError.message };

    // Log one audit entry for the batch
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: 0,
      entity_reference: `batch-${expiredIds.length}`,
      action: "update",
      new_values: { status: "expired", count: expiredIds.length },
    });

    revalidatePath("/dms/inbox");
    return { success: true, data: { marked: expiredIds.length } };
  } catch (err) {
    console.error("markExpiredDmsUploadSessions error", err);
    return { success: false, error: String(err) };
  }
}

// ── cleanupDmsExpiredUploadSessions ───────────────────────────────────────────

export async function cleanupDmsExpiredUploadSessions(
  options: CleanupOptions = { dryRun: true, limit: 100 }
): Promise<ActionResult<CleanupResult>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: requires dms.admin" };
    }

    const parsed = CleanupOptionsSchema.safeParse(options);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid options" };
    }

    const { dryRun, statusFilter, olderThanHours, limit } = parsed.data;
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const now = new Date();

    const eligibleStatuses = statusFilter ?? ["completed", "cancelled", "failed", "expired"];

    let query = supabase
      .from("dms_upload_sessions")
      .select(
        "id, session_code, status, original_filename, file_size_bytes, temp_storage_path, uploaded_at, expires_at, temp_cleaned_at"
      )
      .in("status", eligibleStatuses)
      .is("deleted_at", null)
      .is("temp_cleaned_at", null) // only sessions not yet cleaned
      .not("temp_storage_path", "is", null) // must have a temp path
      .order("uploaded_at", { ascending: true })
      .limit(limit);

    const { data: allCandidates, error: fetchError } = await query;
    if (fetchError) return { success: false, error: fetchError.message };

    // Filter by threshold
    const candidates = (allCandidates ?? []).filter(
      (s: SessionCleanupCandidate) => {
        const threshold = olderThanHours ?? CLEANUP_THRESHOLDS_HOURS[s.status] ?? 24;
        const uploadedAt = new Date(s.uploaded_at);
        const ageHours = (now.getTime() - uploadedAt.getTime()) / (1000 * 60 * 60);
        return ageHours >= threshold;
      }
    );

    const result: CleanupResult = {
      scanned: allCandidates?.length ?? 0,
      cleaned: 0,
      failed: 0,
      skipped: 0,
      total_bytes_freed: 0,
      candidates,
      errors: [],
    };

    if (dryRun) {
      return { success: true, data: result };
    }

    // Actual cleanup
    for (const session of candidates) {
      if (!session.temp_storage_path) {
        result.skipped++;
        continue;
      }

      try {
        const { error: deleteError } = await adminClient.storage
          .from("dms-temp")
          .remove([session.temp_storage_path]);

        if (deleteError) {
          result.failed++;
          result.errors.push({ session_id: session.id, error: deleteError.message });

          await supabase
            .from("dms_upload_sessions")
            .update({
              cleanup_error_message: deleteError.message,
              updated_at: now.toISOString(),
            })
            .eq("id", session.id);
          continue;
        }

        // Mark cleaned
        await supabase
          .from("dms_upload_sessions")
          .update({
            temp_cleaned_at: now.toISOString(),
            cleanup_error_message: null,
            updated_at: now.toISOString(),
          })
          .eq("id", session.id);

        // Insert DMS event (using 0 as document_id since this is session-level)
        await supabase.from("dms_document_events").insert({
          document_id: null,
          event_type: "upload_session_cleaned",
          description: `Temp file deleted: ${session.original_filename} (session ${session.session_code})`,
          performed_by: ctx.profile?.id ?? null,
          metadata_json: {
            session_id: session.id,
            session_code: session.session_code,
            temp_path: session.temp_storage_path,
            file_size_bytes: session.file_size_bytes,
          },
        }).maybeSingle();

        result.cleaned++;
        result.total_bytes_freed += session.file_size_bytes ?? 0;
      } catch (e) {
        result.failed++;
        result.errors.push({ session_id: session.id, error: String(e) });
      }
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: 0,
      entity_reference: `cleanup-${now.toISOString()}`,
      action: "delete",
      new_values: {
        cleaned: result.cleaned,
        failed: result.failed,
        total_bytes_freed: result.total_bytes_freed,
        dry_run: false,
      },
    });

    revalidatePath("/dms/inbox");
    return { success: true, data: result };
  } catch (err) {
    console.error("cleanupDmsExpiredUploadSessions error", err);
    return { success: false, error: String(err) };
  }
}

// ── getCleanupPreview ─────────────────────────────────────────────────────────

export async function getDmsCleanupPreview(): Promise<ActionResult<CleanupResult>> {
  return cleanupDmsExpiredUploadSessions({ dryRun: true, limit: 200 });
}
