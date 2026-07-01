"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rebuildDmsExpiryReminders } from "./expiry-reminders";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type DmsRenewalRequestRow = {
  id: number;
  document_id: number;
  renewal_no: string | null;
  status: string;
  priority: string;
  requested_by: number | null;
  assigned_to: number | null;
  requested_at: string;
  target_renewal_date: string | null;
  old_expiry_date: string | null;
  new_expiry_date: string | null;
  replacement_document_id: number | null;
  replacement_version_id: number | null;
  notes: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  // joined
  document?: { id: number; document_no: string; title: string; expiry_date: string | null; document_type_id: number } | null;
  requester?: { full_name: string | null } | null;
  assignee?: { full_name: string | null } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function canViewRenewals(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.renewals.view") ||
    hasPermission(ctx, "dms.renewals.manage") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canManageRenewals(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.renewals.manage") || hasPermission(ctx, "dms.admin");
}

const RENEWAL_SELECT = `
  id, document_id, renewal_no, status, priority, requested_by, assigned_to,
  requested_at, target_renewal_date, old_expiry_date, new_expiry_date,
  replacement_document_id, replacement_version_id, notes,
  completed_at, cancelled_at, created_by, created_at, updated_at,
  document:dms_documents!document_id(id, document_no, title, expiry_date, document_type_id),
  requester:user_profiles!requested_by(full_name),
  assignee:user_profiles!assigned_to(full_name)
`;

// ── getDmsRenewalRequests ─────────────────────────────────────────────────────

export type RenewalRequestsFilter = {
  documentId?: number;
  status?: string;
  assignedToMe?: boolean;
  includeCompleted?: boolean;
};

export async function getDmsRenewalRequests(
  filter: RenewalRequestsFilter = {}
): Promise<ActionResult<DmsRenewalRequestRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewRenewals(ctx)) return { success: false, error: "Permission denied" };

    let query = supabase
      .from("dms_renewal_requests")
      .select(RENEWAL_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter.documentId) query = query.eq("document_id", filter.documentId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.assignedToMe && ctx.profile?.id) query = query.eq("assigned_to", ctx.profile.id);
    if (!filter.includeCompleted) {
      query = query.not("status", "in", '("renewed","cancelled","rejected")');
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as DmsRenewalRequestRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── createDmsRenewalRequest ───────────────────────────────────────────────────

const CreateRenewalSchema = z.object({
  document_id: z.number().int().positive(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  assigned_to: z.number().int().positive().optional(),
  target_renewal_date: z.string().optional(),
  notes: z.string().max(4000).optional(),
});

export type CreateRenewalInput = z.infer<typeof CreateRenewalSchema>;

export async function createDmsRenewalRequest(
  input: CreateRenewalInput
): Promise<ActionResult<{ id: number; renewal_no: string }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageRenewals(ctx)) return { success: false, error: "Permission denied" };

    const parsed = CreateRenewalSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { document_id, priority, assigned_to, target_renewal_date, notes } = parsed.data;

    const { data: doc, error: docError } = await supabase
      .from("dms_documents")
      .select("id, document_no, expiry_date, document_type:dms_document_types!document_type_id(is_renewable, name_en)")
      .eq("id", document_id)
      .is("deleted_at", null)
      .single();

    if (docError || !doc) return { success: false, error: "Document not found" };

    const d = doc as Record<string, unknown>;
    const docType = d.document_type as { is_renewable?: boolean; name_en?: string } | null;
    if (docType && docType.is_renewable === false) {
      return {
        success: false,
        error: `${docType.name_en ?? "This document type"} does not support renewal requests — it is a one-time document. Upload a new document instead.`,
      };
    }

    const renewalNo = `RNW-${(d.document_no as string).replace("DMSD-", "")}-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();

    const { data: newReq, error: insertError } = await supabase
      .from("dms_renewal_requests")
      .insert({
        document_id,
        renewal_no: renewalNo,
        status: "requested",
        priority,
        requested_by: ctx.profile.id,
        assigned_to: assigned_to ?? null,
        old_expiry_date: d.expiry_date as string | null,
        target_renewal_date: target_renewal_date ?? null,
        notes: notes ?? null,
        created_by: ctx.profile.id,
        created_at: now,
        updated_at: now,
      })
      .select("id, renewal_no")
      .single();

    if (insertError) return { success: false, error: insertError.message };

    const req = newReq as Record<string, unknown>;

    await supabase.from("dms_document_events").insert({
      document_id,
      event_type: "renewal_request_created",
      description: `Renewal request created: ${renewalNo}`,
      performed_by: ctx.profile.id,
      metadata_json: { renewal_id: req.id, renewal_no: renewalNo, priority },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_renewal_requests",
      entity_id: req.id as number,
      entity_reference: renewalNo,
      action: "create",
      new_values: { document_id, status: "requested", priority },
    });

    revalidatePath("/dms/renewals");
    revalidatePath("/dms/expiring");
    revalidatePath(`/dms/documents/record/${document_id}`);

    return { success: true, data: { id: req.id as number, renewal_no: renewalNo } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── updateDmsRenewalRequest ───────────────────────────────────────────────────

const UpdateRenewalSchema = z.object({
  status: z.enum(["draft", "requested", "in_progress", "waiting_for_document"]).optional(),
  priority: z.enum(["normal", "high", "urgent"]).optional(),
  assigned_to: z.number().int().positive().nullable().optional(),
  target_renewal_date: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export type UpdateRenewalInput = z.infer<typeof UpdateRenewalSchema>;

export async function updateDmsRenewalRequest(
  id: number,
  input: UpdateRenewalInput
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageRenewals(ctx)) return { success: false, error: "Permission denied" };

    const parsed = UpdateRenewalSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("dms_renewal_requests")
      .update({ ...parsed.data, updated_by: ctx.profile.id, updated_at: now })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dms/renewals");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── completeDmsRenewalRequest ─────────────────────────────────────────────────

const CompleteRenewalSchema = z.object({
  new_expiry_date: z.string().optional(),
  // DMS RENEWAL.2 — required: the document the user already uploaded to replace the expiring one.
  replacement_document_id: z.number().int().positive("Select the replacement document"),
  replacement_version_id: z.number().int().positive().optional(),
  notes: z.string().max(4000).optional(),
});

export type CompleteRenewalInput = z.infer<typeof CompleteRenewalSchema>;

export async function completeDmsRenewalRequest(
  id: number,
  input: CompleteRenewalInput
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageRenewals(ctx)) return { success: false, error: "Permission denied" };

    const parsed = CompleteRenewalSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { data: renewalReq, error: fetchErr } = await supabase
      .from("dms_renewal_requests")
      .select("id, document_id, renewal_no, status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !renewalReq) return { success: false, error: "Renewal request not found" };

    const req = renewalReq as Record<string, unknown>;
    const documentId = req.document_id as number;
    const replacementDocumentId = parsed.data.replacement_document_id;

    if (replacementDocumentId === documentId) {
      return { success: false, error: "The replacement document cannot be the same as the original document" };
    }

    // Validate the picked replacement document: exists, not deleted, same type, not deleted,
    // and not already claimed by another completed renewal.
    const [{ data: originalDoc }, { data: replacementDoc }, { data: conflictingRenewal }] = await Promise.all([
      supabase.from("dms_documents").select("id, document_type_id, expiry_date").eq("id", documentId).is("deleted_at", null).single(),
      supabase.from("dms_documents").select("id, document_no, document_type_id, expiry_date, status").eq("id", replacementDocumentId).is("deleted_at", null).single(),
      supabase.from("dms_renewal_requests").select("id, renewal_no").eq("replacement_document_id", replacementDocumentId).eq("status", "renewed").maybeSingle(),
    ]);

    if (!originalDoc) return { success: false, error: "Original document not found" };
    if (!replacementDoc) return { success: false, error: "Replacement document not found or has been deleted" };
    if (conflictingRenewal) {
      return {
        success: false,
        error: `Document ${replacementDoc.document_no} is already linked as the replacement for renewal ${conflictingRenewal.renewal_no ?? `#${conflictingRenewal.id}`}`,
      };
    }
    if (replacementDoc.document_type_id !== originalDoc.document_type_id) {
      return { success: false, error: "The replacement document must be of the same document type as the original" };
    }

    const newExpiryDate = parsed.data.new_expiry_date || replacementDoc.expiry_date || null;
    const now = new Date().toISOString();

    // Update renewal request to completed
    await supabase
      .from("dms_renewal_requests")
      .update({
        status: "renewed",
        new_expiry_date: newExpiryDate,
        replacement_document_id: replacementDocumentId,
        replacement_version_id: parsed.data.replacement_version_id ?? null,
        notes: parsed.data.notes ?? (req.notes as string | null),
        completed_at: now,
        updated_by: ctx.profile.id,
        updated_at: now,
      })
      .eq("id", id);

    // Update the OLD document: mark superseded and link to the replacement.
    await supabase
      .from("dms_documents")
      .update({
        status: "superseded",
        superseded_by_document_id: replacementDocumentId,
        updated_by: ctx.profile.id,
        updated_at: now,
      })
      .eq("id", documentId);

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "document_superseded",
      description: `Document superseded by ${replacementDoc.document_no} via renewal ${req.renewal_no}`,
      performed_by: ctx.profile.id,
      metadata_json: { renewal_id: id, replacement_document_id: replacementDocumentId },
    });

    // Update document expiry_date if provided/derived, so old-document expiry history stays accurate.
    if (newExpiryDate) {
      await supabase.from("dms_document_events").insert({
        document_id: documentId,
        event_type: "expiry_date_updated",
        description: `Expiry date updated to ${newExpiryDate} via renewal ${req.renewal_no}`,
        performed_by: ctx.profile.id,
        metadata_json: { new_expiry_date: newExpiryDate, renewal_id: id },
      });
    }

    // Dismiss old pending reminders — the superseded document no longer needs its own reminders.
    await supabase
      .from("dms_expiry_reminders")
      .update({ status: "dismissed", dismissed_by: ctx.profile.id, dismissed_at: now, dismissal_reason: `Renewal completed: ${req.renewal_no}`, updated_at: now })
      .eq("document_id", documentId)
      .eq("status", "pending");

    // Ensure the new replacement document has its own reminder schedule if it has an expiry date.
    if (replacementDoc.expiry_date) {
      await rebuildDmsExpiryReminders(replacementDocumentId);
    }

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "document_renewed",
      description: `Document renewed via ${req.renewal_no} — replaced by ${replacementDoc.document_no}`,
      performed_by: ctx.profile.id,
      metadata_json: { renewal_id: id, renewal_no: req.renewal_no, new_expiry_date: newExpiryDate, replacement_document_id: replacementDocumentId },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_renewal_requests",
      entity_id: id,
      entity_reference: req.renewal_no as string,
      action: "update",
      new_values: { status: "renewed", new_expiry_date: newExpiryDate, replacement_document_id: replacementDocumentId },
    });

    revalidatePath("/dms/renewals");
    revalidatePath("/dms/expiring");
    revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath(`/dms/documents/record/${replacementDocumentId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── searchDmsDocumentsForRenewalReplacement ───────────────────────────────────

export type RenewalReplacementCandidate = {
  id: number;
  document_no: string;
  title: string;
  expiry_date: string | null;
  status: string;
};

/**
 * DMS RENEWAL.2 — Search for a document to link as the replacement for a
 * renewal completion. Scoped to the same document type as the original
 * document, excludes the original document itself, excludes documents
 * already deleted, and excludes documents already linked as someone else's
 * replacement (prevents double-linking the same new doc to two renewals).
 */
export async function searchDmsDocumentsForRenewalReplacement(
  documentTypeId: number,
  excludeDocumentId: number,
  query?: string
): Promise<ActionResult<RenewalReplacementCandidate[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageRenewals(ctx)) return { success: false, error: "Permission denied" };

    if (!documentTypeId) return { success: true, data: [] };

    // Documents already claimed as a replacement on a completed renewal must be excluded.
    const { data: alreadyLinked } = await supabase
      .from("dms_renewal_requests")
      .select("replacement_document_id")
      .eq("status", "renewed")
      .not("replacement_document_id", "is", null);

    const excludedIds = new Set<number>([excludeDocumentId]);
    for (const r of alreadyLinked ?? []) {
      const rid = (r as Record<string, unknown>).replacement_document_id as number | null;
      if (rid) excludedIds.add(rid);
    }

    let q = supabase
      .from("dms_documents")
      .select("id, document_no, title, expiry_date, status")
      .eq("document_type_id", documentTypeId)
      .is("deleted_at", null)
      .not("id", "in", `(${Array.from(excludedIds).join(",")})`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (query?.trim()) {
      const term = query.trim();
      q = q.or(`document_no.ilike.%${term}%,title.ilike.%${term}%`);
    }

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };

    return { success: true, data: (data as unknown as RenewalReplacementCandidate[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── cancelDmsRenewalRequest ───────────────────────────────────────────────────

export async function cancelDmsRenewalRequest(
  id: number,
  reason?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageRenewals(ctx)) return { success: false, error: "Permission denied" };

    const { data: renewalReq, error: fetchErr } = await supabase
      .from("dms_renewal_requests")
      .select("id, document_id, renewal_no")
      .eq("id", id)
      .single();

    if (fetchErr || !renewalReq) return { success: false, error: "Renewal request not found" };
    const req = renewalReq as Record<string, unknown>;
    const now = new Date().toISOString();

    await supabase
      .from("dms_renewal_requests")
      .update({ status: "cancelled", cancelled_at: now, notes: reason ?? null, updated_by: ctx.profile.id, updated_at: now })
      .eq("id", id);

    await supabase.from("dms_document_events").insert({
      document_id: req.document_id,
      event_type: "renewal_cancelled",
      description: `Renewal ${req.renewal_no} cancelled${reason ? `: ${reason}` : ""}`,
      performed_by: ctx.profile.id,
      metadata_json: { renewal_id: id, reason },
    });

    revalidatePath("/dms/renewals");
    revalidatePath("/dms/expiring");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
