"use server";
import {readAllDmsDocuments} from "@/server/reads/dms-documents";
import { traceRequest } from "@/lib/performance/request";

import { dmsDocumentCreateSchema as documentCreateSchema, dmsCreationContractSchema,dmsCreationOriginSchema, type DmsCreationReceipt } from "@/lib/dms/numbered-document-create";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import { createNumberedDmsDocument } from "@/server/numbered-dms-create";
import { changeDocumentArchive } from "@/server/dms-archive-transition";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/actions/audit";
import {
  generateDmsExpiryRemindersForDocument,
  rebuildDmsExpiryReminders,
} from "@/server/actions/dms/expiry-reminders";
import { getDmsNotificationSettingsForScheduler } from "@/server/actions/dms/notification-settings";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  uncertain?: boolean;
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type DmsDocumentRow = {
  id: number;
  document_no: string;
  legacy_document_code: string | null;
  title: string;
  description: string | null;
  document_type_id: number;
  category_id: number;
  status: string;
  approval_status?: string | null;
  current_version_id?: number | null;
  confidentiality_level: string;
  owner_user_id: number | null;
  owning_company_id: number | null;
  owning_branch_id: number | null;
  party_id: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  reminder_policy_id: number | null;
  ocr_status: string;
  ai_status: string;
  review_status: string;
  is_archived: boolean;
  archived_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_by: number | null;
  updated_at: string;
  deleted_at: string | null;
  // DMS 12.1 — full-text search vector (server-side only; not exposed to UI)
  content_tsv?: unknown;
  // DMS 12.1 — AI summary placeholder (populated in Phase 12.2)
  ai_summary?: string | null;
  ai_summary_status?: string | null;
  ai_summary_updated_at?: string | null;
  ai_summary_model?: string | null;
  // DMS 12.1 — completeness/risk placeholders (populated in Phase 12.3)
  completeness_score?: number | null;
  missing_fields_json?: unknown;
  ai_warnings_json?: unknown;
  ai_risk_score?: number | null;
  ai_risk_level?: string | null;
  ai_risk_reasons_json?: unknown;
  ai_risk_updated_at?: string | null;
  // DMS RENEWAL.2 — links the old document to the replacement document once superseded
  superseded_by_document_id?: number | null;
  // joined
  document_type?: { type_code: string; name_en: string; requires_expiry_tracking: boolean; default_confidentiality: string; is_renewable?: boolean } | null;
  category?: { category_code: string; name_en: string } | null;
  tags?: { tag_id: number; tag?: { tag_name: string; color_hex: string | null } }[];
  files_count?: number;
  superseded_by?: { id: number; document_no: string; title: string } | null;
};

/** DMS 12.3 — search mode selector */
export type DmsSearchMode = "quick" | "safe_fts" | "content";

export type DmsDocumentFilters = {
  search?: string;
  /** DMS 12.3 — controls how search is applied. Default: auto (quick for short, safe_fts for long). */
  searchMode?: DmsSearchMode;
  document_type_id?: number;
  category_id?: number;
  status?: string;
  confidentiality?: string;
  is_archived?: boolean;
  /**
   * DMS ARCHIVE.1 — when true, archived and superseded documents are excluded
   * from results. Defaults to false so callers opt-in explicitly.
   * The "All Documents" page sets this to true; the Archive page never sets it.
   */
  excludeArchived?: boolean;
  has_files?: boolean;
  expiry_from?: string;
  expiry_to?: string;
  expiring_soon?: boolean;
  expired?: boolean;
  // DMS 12.3 — intelligence filters
  riskLevel?: string;
  completenessMin?: number;
  completenessMax?: number;
  hasMissingFields?: boolean;
  hasAiSummary?: boolean;
  hasExtractedText?: boolean;
  expiryState?: "expired" | "expiring_soon" | "valid" | "missing_expiry";
};

// ── Validation schemas ─────────────────────────────────────────────────────────

const documentUpdateSchema = documentCreateSchema.partial().extend({
  id: z.number().int().positive(),
});

export type CreateDmsDocumentInput = z.infer<typeof documentCreateSchema>;
export type UpdateDmsDocumentInput = z.infer<typeof documentUpdateSchema>;

// ── Path revalidation ─────────────────────────────────────────────────────────

function revalidateDmsDocuments(id?: number) {
  revalidatePath("/dms");
  revalidatePath("/dms/documents");
  if (id) {
    revalidatePath(`/dms/documents/record/${id}`);
  }
}

// ── Confidentiality access helpers ────────────────────────────────────────────

/**
 * Levels that require a matching per-level permission beyond `dms.documents.view`.
 * `internal` and `company` are accessible to anyone with the base view permission.
 */
const SENSITIVE_LEVELS = ["hr", "finance", "legal", "executive"] as const;

/**
 * Returns true if the user can access a document with the given confidentiality_level.
 * Admin/system_admin: always allowed.
 * Owner (owner_user_id) or creator (created_by): always allowed for their own docs.
 * Otherwise: user must have the matching per-level permission.
 */
function canAccessDocumentByConfidentiality(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  confidentialityLevel: string,
  ownerUserId: number | null,
  createdBy: number | null
): boolean {
  const isAdmin =
    hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
  if (isAdmin) return true;

  const profileId = ctx.profile?.id ?? null;
  if (profileId && (ownerUserId === profileId || createdBy === profileId)) return true;

  if (!SENSITIVE_LEVELS.includes(confidentialityLevel as (typeof SENSITIVE_LEVELS)[number])) {
    // internal or company — base view permission (already checked by callers) is sufficient
    return true;
  }

  return hasPermission(ctx, `dms.documents.view.${confidentialityLevel}`);
}

// ── Insert event helper ────────────────────────────────────────────────────────

async function insertDmsEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: number,
  eventType: string,
  performedBy: number | null,
  description?: string,
  metadataJson?: Record<string, unknown>
) {
  await supabase.from("dms_document_events").insert({
    document_id: documentId,
    event_type: eventType,
    description: description ?? null,
    performed_by: performedBy,
    metadata_json: metadataJson ?? null,
  });
}

// ── getDmsDocuments ────────────────────────────────────────────────────────────

export async function getDmsDocuments(
  filters?: DmsDocumentFilters
): Promise<ActionResult<DmsDocumentRow[]>> {
  return traceRequest("documents.list", () => getDmsDocumentsImpl(filters));
}

async function getDmsDocumentsImpl(filters?:DmsDocumentFilters):Promise<ActionResult<DmsDocumentRow[]>> {
  return readAllDmsDocuments(filters);
}

// ── getDmsDocument ────────────────────────────────────────────────────────────

export async function getDmsDocument(
  id: number
): Promise<ActionResult<DmsDocumentRow>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_documents")
      .select(`
        *,
        document_type:dms_document_types(type_code, name_en, requires_expiry_tracking, default_confidentiality),
        category:dms_document_categories(category_code, name_en),
        tags:dms_document_tags(tag_id, tag:dms_tags(tag_name, color_hex))
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Document not found" };

    const doc = data as DmsDocumentRow;

    // DMS.3C — enforce confidentiality access
    if (!canAccessDocumentByConfidentiality(ctx, doc.confidentiality_level, doc.owner_user_id ?? null, doc.created_by ?? null)) {
      return { success: false, error: "Document access is restricted." };
    }

    return { success: true, data: doc };
  } catch (err) {
    logger.error("getDmsDocument error", err);
    return { success: false, error: "Failed to load document" };
  }
}

// ── getDmsDocumentRecordData ──────────────────────────────────────────────────

export type DmsDocumentRecordData = DmsDocumentRow & {
  metadata_values?: Array<{
    id: number;
    definition_id: number;
    value_text: string | null;
    value_number: number | null;
    value_date: string | null;
    value_datetime: string | null;
    value_boolean: boolean | null;
    value_json: unknown;
    definition?: {
      id: number;
      field_code: string;
      field_label_en: string;
      field_type: string;
      is_required: boolean;
      sort_order: number;
      options_json: unknown;
    } | null;
  }>;
  links?: Array<{
    id: number;
    entity_type: string;
    entity_id: number;
    link_role: string | null;
    is_primary: boolean;
    notes: string | null;
    linked_at: string;
  }>;
  versions?: Array<{
    id: number;
    version_number: number;
    version_label: string | null;
    change_notes: string | null;
    is_current: boolean;
    created_at: string;
  }>;
  files?: Array<{
    id: number;
    file_name: string;
    mime_type: string;
    file_size_bytes: number;
    file_role: string;
    created_at: string;
  }>;
};

export async function getDmsDocumentRecordData(
  id: number
): Promise<ActionResult<DmsDocumentRecordData>> {
  if(!Number.isSafeInteger(id)||id<=0)return {success:false,error:"Invalid document identifier"};
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    // Sections fetch their own counted/protected data lazily. Do not fetch four
    // unbounded child arrays here or replace their failures with empty values.
    const docResult=await supabase.from("dms_documents").select(`
      *, document_type:dms_document_types(type_code,name_en,requires_expiry_tracking,default_confidentiality,is_renewable),
      category:dms_document_categories(category_code,name_en), tags:dms_document_tags(tag_id,tag:dms_tags(tag_name,color_hex))
    `).eq("id",id).is("deleted_at",null).single();

    if (docResult.error || !docResult.data) {
      return { success: false, error: "Document record is unavailable or outside your access. Please retry." };
    }

    const docRow = docResult.data as DmsDocumentRow;

    // DMS.3C — enforce confidentiality access on full record
    if (!canAccessDocumentByConfidentiality(ctx, docRow.confidentiality_level, docRow.owner_user_id ?? null, docRow.created_by ?? null)) {
      return { success: false, error: "Document access is restricted." };
    }

    let replacement:DmsDocumentRow["superseded_by"]=null;
    if(docRow.superseded_by_document_id){
      const linked=await supabase.from("dms_documents").select("id,document_no,title").eq("id",docRow.superseded_by_document_id).is("deleted_at",null).maybeSingle();
      if(linked.error)return {success:false,error:"Document replacement could not be verified. Please retry."};
      if(linked.data){
        const safe=z.object({id:z.number().int().positive().refine(Number.isSafeInteger),document_no:z.string(),title:z.string()}).safeParse(linked.data);
        if(!safe.success||safe.data.id!==docRow.superseded_by_document_id)return {success:false,error:"Document replacement could not be verified. Please retry."};
        replacement=safe.data;
      }
    }
    const record:DmsDocumentRecordData={...docRow,superseded_by:replacement};

    return { success: true, data: record };
  } catch (err) {
    logger.error("getDmsDocumentRecordData error", err);
    return { success: false, error: "Failed to load document record" };
  }
}

// ── getDmsNewDocumentDefaults ─────────────────────────────────────────────────

export async function getDmsNewDocumentDefaults(): Promise<
  ActionResult<{ categories: { id: number; name_en: string; category_code: string }[]; documentTypes: { id: number; name_en: string; type_code: string; category_id: number | null; requires_expiry_tracking: boolean; is_renewable: boolean; default_confidentiality: string }[] }>
> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const [catResult, typeResult] = await Promise.all([
      supabase
        .from("dms_document_categories")
        .select("id, name_en, category_code")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("dms_document_types")
        .select("id, name_en, type_code, category_id, requires_expiry_tracking, is_renewable, default_confidentiality")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order"),
    ]);

    return {
      success: true,
      data: {
        categories: catResult.data ?? [],
        documentTypes: typeResult.data ?? [],
      },
    };
  } catch (err) {
    logger.error("getDmsNewDocumentDefaults error", err);
    return { success: false, error: "Failed to load defaults" };
  }
}

// ── createDmsDocument ─────────────────────────────────────────────────────────

export async function prepareDmsManualOrigin(input:unknown):Promise<ActionResult<{company:number|null;branch:number|null}>>{
 try{
  const p=dmsCreationOriginSchema.safeParse(input);if(!p.success)return {success:false,error:'Invalid original document subject'};
  const client=await createClient(),r=await client.rpc('f07_prepare_manual_origin',{p_context:p.data});
  const scope=z.object({company:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),branch:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()}).strict().safeParse(r.data);
  if(r.error||!scope.success)return {success:false,error:'The original document subject is unavailable or outside your current access. No unlinked document was substituted.'};
  return {success:true,data:scope.data};
 }catch{return {success:false,error:'The original document subject could not be verified. No unlinked document was substituted.'};}
}

export async function createDmsDocument(
  input: CreateDmsDocumentInput,
  contract: WorkspaceSaveContract
): Promise<ActionResult<DmsCreationReceipt>> {
  let committedReceipt: DmsCreationReceipt | undefined;
  try {
    if (!dmsCreationContractSchema.safeParse(contract).success) {
      return { success: false, error: "Reopen this form before saving. Its creation request identity is missing." };
    }
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.upload") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = documentCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }
    const data = parsed.data;

    if (data.expiry_date && data.issue_date && data.expiry_date < data.issue_date) {
      return { success: false, error: "Expiry date must be on or after issue date" };
    }

    // DMS.3C — creating a sensitive-level document requires matching per-level permission
    if (SENSITIVE_LEVELS.includes(data.confidentiality_level as (typeof SENSITIVE_LEVELS)[number])) {
      const isAdminCreate = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
      if (!isAdminCreate && !hasPermission(ctx, `dms.documents.view.${data.confidentiality_level}`)) {
        return {
          success: false,
          error: `Permission denied: creating a ${data.confidentiality_level}-level document requires dms.documents.view.${data.confidentiality_level}`,
        };
      }
    }

    const result = await createNumberedDmsDocument(data, contract);
    if (!result.success || !result.data) return result;
    const doc = result.data;
    committedReceipt = doc;
    // The transaction already committed. A refresh failure is not a failed save.
    try { revalidateDmsDocuments(); }
    catch { logger.warn("Document creation committed; view refresh is temporarily unavailable."); }

    // Auto-generate expiry reminders if expiry_date is set
    if (data.expiry_date) {
      try {
        const settings = await getDmsNotificationSettingsForScheduler();
        const reminderDays = settings?.reminder_days_before?.length
          ? settings.reminder_days_before
          : undefined;
        await generateDmsExpiryRemindersForDocument(doc.id, { reminderDays });
      } catch {
        // Non-fatal: reminder generation failure should not block document creation
      }
    }

    return result;
  } catch (err) {
    if (committedReceipt) return { success: true, data: committedReceipt };
    logger.error("createDmsDocument error", err);
    return { success: false, error: "Failed to create document" };
  }
}

// ── updateDmsDocument ─────────────────────────────────────────────────────────

export async function updateDmsDocument(
  input: UpdateDmsDocumentInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const { id, ...rest } = input;
    if (!id) return { success: false, error: "Document ID required" };

    const parsed = documentCreateSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }
    const data = parsed.data;
    if(data.originContext)return {success:false,error:'The original creation context cannot be reassigned through a document update.'};

    if (data.expiry_date && data.issue_date && data.expiry_date < data.issue_date) {
      return { success: false, error: "Expiry date must be on or after issue date" };
    }

    // DMS.3C — updating confidentiality to a sensitive level requires matching permission
    if (
      data.confidentiality_level &&
      SENSITIVE_LEVELS.includes(data.confidentiality_level as (typeof SENSITIVE_LEVELS)[number])
    ) {
      const isAdminUpdate = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");
      if (!isAdminUpdate && !hasPermission(ctx, `dms.documents.view.${data.confidentiality_level}`)) {
        return {
          success: false,
          error: `Permission denied: setting ${data.confidentiality_level} confidentiality requires dms.documents.view.${data.confidentiality_level}`,
        };
      }
    }

    const supabase = await createClient();

    const { data: updated, error } = await supabase
      .from("dms_documents")
      .update({
        ...data,
        updated_by: ctx.profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!updated) return { success: false, error: "Document unavailable or access denied" };

    await insertDmsEvent(supabase, id, "document_updated", ctx.profile?.id ?? null, "Document metadata updated");

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
      new_values: data,
    });

    revalidateDmsDocuments(id);

    // Rebuild expiry reminders if expiry_date was changed
    if (data.expiry_date !== undefined) {
      try {
        const settings = await getDmsNotificationSettingsForScheduler();
        const reminderDays = settings?.reminder_days_before?.length
          ? settings.reminder_days_before
          : undefined;
        await rebuildDmsExpiryReminders(id, { reminderDays });
      } catch {
        // Non-fatal: reminder rebuild failure should not block the update
      }
    }

    return { success: true, data: { id } };
  } catch (err) {
    logger.error("updateDmsDocument error", err);
    return { success: false, error: "Failed to update document" };
  }
}

// ── archiveDmsDocument ────────────────────────────────────────────────────────

export async function archiveDmsDocument(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.archive") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const result=await changeDocumentArchive(supabase,id,true);
    if(result.success){try{revalidateDmsDocuments(id);}catch{/* A cache failure cannot undo the confirmed transaction. */}}
    return result;
  } catch (err) {
    logger.error("archiveDmsDocument error", err);
    return { success: false, error: "Failed to archive document" };
  }
}

// ── unarchiveDmsDocument ──────────────────────────────────────────────────────

export async function unarchiveDmsDocument(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.archive") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const result=await changeDocumentArchive(supabase,id,false);
    if(result.success){try{revalidateDmsDocuments(id);}catch{/* Confirmed receipt wins. */}}
    return result;
  } catch (err) {
    logger.error("unarchiveDmsDocument error", err);
    return { success: false, error: "Failed to unarchive document" };
  }
}

// ── getArchivedDocuments ──────────────────────────────────────────────────────
//
// DMS ARCHIVE.1 — returns all documents with status "archived" OR "superseded"
// (i.e. every document that has been removed from the main All Documents list).
// Superseded documents include a join to their replacement.

export type ArchivedDocumentRow = DmsDocumentRow & {
  reason: "archived" | "renewed";
  superseded_by?: { id: number; document_no: string; title: string } | null;
};

export async function getArchivedDocuments(): Promise<ActionResult<ArchivedDocumentRow[]>> {
  const {readAllDmsArchive}=await import("@/server/reads/dms-archive");
  return readAllDmsArchive();
}

/** Retired unsafe purge. Archive is the supported routine operation. */
export async function deleteDmsDocument(_id: number): Promise<ActionResult> {
  if(!Number.isSafeInteger(_id)||_id<=0)return {success:false,error:"Invalid document identifier"};
  return {success:false,error:"Permanent disposal is unavailable here. It requires a separately approved retention/legal-hold process; use Archive for routine work."};
}
