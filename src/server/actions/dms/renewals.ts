"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {completeRenewalSchema, dmsLifecycleId, renewalCompletionReceiptSchema, renewalCompletionFailure} from "@/lib/dms/renewal-completion";
import {
  RENEWAL_REPLACEMENT_PAGE_SIZE,
  renewalReplacementPageSchema,
  renewalReplacementSearchSchema,
  type RenewalReplacementPage,
} from "@/lib/dms/renewal-completion";
import { readAllPages } from "@/server/reads/all-pages";
import { renewalFilterSchema } from "@/server/reads/dms-renewal-contract";
import { renewalBaseSelect, renewalBaseRowsSchema, hydrateRenewalReferences } from "@/server/reads/dms-renewal-references";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  uncertain?: boolean;
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
  const parsed = renewalFilterSchema.safeParse(filter);
  if (!parsed.success) return { success: false, error: "Invalid renewal criteria" };
  filter = parsed.data;
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!ctx.isAccountActive || ctx.profile.must_change_password || !canViewRenewals(ctx)) return { success: false, error: "Permission denied" };
    const supabase = await createClient();

    const data = await readAllPages(async (from, to) => {
    let query = supabase
      .from("dms_renewal_requests")
      .select(renewalBaseSelect, { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }).range(from, to);

    if (filter.documentId) query = query.eq("document_id", filter.documentId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.assignedToMe && ctx.profile?.id) query = query.eq("assigned_to", ctx.profile.id);
    if (!filter.includeCompleted) {
      query = query.not("status", "in", '("renewed","cancelled","rejected")');
    }

    const result = await query;
    return { ...result, data: renewalBaseRowsSchema.parse(result.data) };
    }, { identity: row => row.id, maxRows: 10000 });
    return { success: true, data: await hydrateRenewalReferences(supabase, data) };
  } catch {
    return { success: false, error: "Renewal requests could not be completely loaded. Refine the filters or retry." };
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

export type CompleteRenewalInput = z.infer<typeof completeRenewalSchema>;

export async function completeDmsRenewalRequest(id: number,input: CompleteRenewalInput): Promise<ActionResult> {
  let dispatched=false;
  try {
    const ctx=await getAuthContext();
    if(!ctx.profile||!canManageRenewals(ctx))return {success:false,error:"Permission denied"};
    const identity=dmsLifecycleId.safeParse(id),parsed=completeRenewalSchema.safeParse(input);
    if(!identity.success||!parsed.success)return {success:false,error:"Review the renewal, selected document, version and dates."};
    const client=await createClient();
    dispatched=true;
    const response=await client.rpc("f07_complete_document_renewal",{
      p_request:identity.data,p_replacement:parsed.data.replacement_document_id,
      p_version:parsed.data.replacement_version_id??null,p_expiry:parsed.data.new_expiry_date||null,p_notes:parsed.data.notes??null,
    });
    if(response.error)return renewalCompletionFailure(response.error.code);
    const result=renewalCompletionReceiptSchema.safeParse(response.data);
    if(!result.success||result.data.renewalId!==id||result.data.replacementDocumentId!==parsed.data.replacement_document_id)return renewalCompletionFailure();
    // Audit/events/reminder intent are part of the confirmed DB transaction.
    // Cache failure must not turn completion into another business write.
    try {
      for(const path of ["/dms/renewals","/dms/expiring","/dms/documents","/dms/archive",`/dms/documents/record/${result.data.documentId}`,`/dms/documents/record/${result.data.replacementDocumentId}`])revalidatePath(path);
    }catch { /* durable receipt wins */ }
    return {success:true,data:result.data};
  }catch {
    return dispatched?renewalCompletionFailure():{success:false,error:"The renewal could not be prepared. Refresh and check your access."};
  }
}

// ── searchDmsDocumentsForRenewalReplacement ───────────────────────────────────

export async function searchDmsDocumentsForRenewalReplacement(
  renewalId: number,
  query = "",
  before: number | null = null,
): Promise<ActionResult<RenewalReplacementPage>> {
  const loadError = { success: false, error: "Could not load replacement documents." };
  const criteria = renewalReplacementSearchSchema.safeParse({ renewalId, query, before });
  if (!criteria.success) return loadError;
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageRenewals(ctx)) return { success: false, error: "Permission denied" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fa08_renewal_replacement_page", {
      p_request: criteria.data.renewalId,
      p_query: criteria.data.query,
      p_before: criteria.data.before,
      p_limit: RENEWAL_REPLACEMENT_PAGE_SIZE,
    });
    if (error) return loadError;
    const parsed = renewalReplacementPageSchema.safeParse(data);
    return parsed.success ? { success: true, data: parsed.data } : loadError;
  } catch {
    return loadError;
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
