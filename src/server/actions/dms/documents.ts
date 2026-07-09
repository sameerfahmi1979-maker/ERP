"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { zNullableDateString } from "@/lib/dms/date-validators";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
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

const documentCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().nullable().optional(),
  document_type_id: z.number().int().positive("Document type is required"),
  category_id: z.number().int().positive("Category is required"),
  status: z
    .enum(["draft", "pending_review", "approved", "rejected", "active", "expired", "archived", "superseded"])
    .default("draft"),
  confidentiality_level: z
    .enum(["internal", "company", "hr", "finance", "legal", "executive"])
    .default("internal"),
  owner_user_id: z.number().int().positive().nullable().optional(),
  owning_company_id: z.number().int().positive().nullable().optional(),
  owning_branch_id: z.number().int().positive().nullable().optional(),
  party_id: z.number().int().positive().nullable().optional(),
  issue_date: zNullableDateString,
  expiry_date: zNullableDateString,
  reminder_policy_id: z.number().int().positive().nullable().optional(),
  legacy_document_code: z.string().nullable().optional(),
});

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
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const isAdmin = hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin");

    let query = supabase
      .from("dms_documents")
      .select(`
        *,
        document_type:dms_document_types(type_code, name_en, requires_expiry_tracking, default_confidentiality),
        category:dms_document_categories(category_code, name_en),
        tags:dms_document_tags(tag_id, tag:dms_tags(tag_name, color_hex))
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    // ── Search ───────────────────────────────────────────────────────────────────
    if (filters?.search) {
      const searchTerm = filters.search.trim();
      const mode = filters.searchMode;

      if (mode === "quick") {
        // Explicit quick mode — always ILIKE
        const s = `%${searchTerm}%`;
        query = query.or(`document_no.ilike.${s},title.ilike.${s},description.ilike.${s},legacy_document_code.ilike.${s}`);
      } else if (mode === "safe_fts") {
        // Explicit safe FTS — uses content_tsv (doc_no, title, description, ai_summary)
        query = query.textSearch("content_tsv", searchTerm, { type: "plain", config: "simple" });
      } else if (mode === "content") {
        // DMS 12.3 — content search: find document IDs from dms_document_content that match,
        // then filter dms_documents. Never returns content_text.
        const { data: contentMatches } = await supabase
          .from("dms_document_content")
          .select("document_id")
          .textSearch("content_text", searchTerm, { type: "plain", config: "simple" });

        const matchedIds = (contentMatches ?? [])
          .map((r) => (r as Record<string, unknown>).document_id as number)
          .filter(Boolean);

        if (matchedIds.length === 0) {
          // No content matches — return empty safely
          return { success: true, data: [] };
        }

        // For non-admin users, exclude confidential documents from content search results
        if (!isAdmin) {
          query = query
            .in("id", matchedIds)
            .not("confidentiality_level", "in", `(hr,legal,executive)`);
        } else {
          query = query.in("id", matchedIds);
        }
      } else {
        // Auto mode (no explicit mode): short query → ILIKE, long → safe_fts
        const wordCount = searchTerm.split(/\s+/).filter(Boolean).length;
        const hasDigits = /\d{4,}/.test(searchTerm);
        const isShortQuery = wordCount <= 3 || hasDigits;

        if (isShortQuery) {
          const s = `%${searchTerm}%`;
          query = query.or(`document_no.ilike.${s},title.ilike.${s},description.ilike.${s},legacy_document_code.ilike.${s}`);
        } else {
          query = query.textSearch("content_tsv", searchTerm, { type: "plain", config: "simple" });
        }
      }
    }

    // ── Standard filters ──────────────────────────────────────────────────────
    if (filters?.document_type_id) {
      query = query.eq("document_type_id", filters.document_type_id);
    }
    if (filters?.category_id) {
      query = query.eq("category_id", filters.category_id);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.confidentiality) {
      query = query.eq("confidentiality_level", filters.confidentiality);
    }
    if (filters?.is_archived !== undefined) {
      query = query.eq("is_archived", filters.is_archived);
    }
    if (filters?.expiry_from) {
      query = query.gte("expiry_date", filters.expiry_from);
    }
    if (filters?.expiry_to) {
      query = query.lte("expiry_date", filters.expiry_to);
    }
    if (filters?.expired) {
      const today = new Date().toISOString().split("T")[0];
      query = query.lt("expiry_date", today).not("expiry_date", "is", null);
    }
    if (filters?.expiring_soon) {
      const today = new Date().toISOString().split("T")[0];
      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      query = query.gte("expiry_date", today).lte("expiry_date", in30);
    }

    // ── DMS 12.3 — Intelligence filters ──────────────────────────────────────
    if (filters?.riskLevel) {
      query = query.eq("ai_risk_level", filters.riskLevel);
    }
    if (filters?.completenessMin !== undefined) {
      query = query.gte("completeness_score", filters.completenessMin);
    }
    if (filters?.completenessMax !== undefined) {
      query = query.lte("completeness_score", filters.completenessMax);
    }
    if (filters?.hasMissingFields === true) {
      query = query.not("missing_fields_json", "is", null);
    }
    if (filters?.hasAiSummary === true) {
      query = query.eq("ai_summary_status", "complete").not("ai_summary", "is", null);
    }
    if (filters?.hasAiSummary === false) {
      query = query.or("ai_summary.is.null,ai_summary_status.neq.complete");
    }
    if (filters?.expiryState) {
      const today = new Date().toISOString().split("T")[0];
      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      if (filters.expiryState === "expired") {
        query = query.lt("expiry_date", today).not("expiry_date", "is", null);
      } else if (filters.expiryState === "expiring_soon") {
        query = query.gte("expiry_date", today).lte("expiry_date", in30);
      } else if (filters.expiryState === "valid") {
        query = query.gt("expiry_date", in30);
      } else if (filters.expiryState === "missing_expiry") {
        query = query.is("expiry_date", null);
      }
    }
    // hasExtractedText filter — joins via subquery
    if (filters?.hasExtractedText === true) {
      const { data: contentIds } = await supabase
        .from("dms_document_content")
        .select("document_id")
        .not("content_text", "is", null);
      const ids = (contentIds ?? []).map((r) => (r as Record<string, unknown>).document_id as number);
      if (ids.length === 0) return { success: true, data: [] };
      query = query.in("id", ids);
    }
    if (filters?.hasExtractedText === false) {
      const { data: contentIds } = await supabase
        .from("dms_document_content")
        .select("document_id");
      const ids = (contentIds ?? []).map((r) => (r as Record<string, unknown>).document_id as number);
      if (ids.length > 0) query = query.not("id", "in", `(${ids.join(",")})`);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    // Redact ai_summary for confidential documents when user is not admin
    const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];

    const processed = (data ?? []).map((doc) => {
      const d = doc as DmsDocumentRow;
      if (!isAdmin && CONFIDENTIAL_LEVELS.includes(d.confidentiality_level) && d.ai_summary) {
        return { ...d, ai_summary: "[Summary restricted — confidential document]" };
      }
      return d;
    });

    return { success: true, data: processed };
  } catch (err) {
    logger.error("getDmsDocuments error", err);
    return { success: false, error: "Failed to load documents" };
  }
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

    return { success: true, data: data as DmsDocumentRow };
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
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const [docResult, metaResult, linksResult, versionsResult, filesResult] = await Promise.all([
      supabase
        .from("dms_documents")
        .select(`
          *,
          document_type:dms_document_types(type_code, name_en, requires_expiry_tracking, default_confidentiality, is_renewable),
          category:dms_document_categories(category_code, name_en),
          tags:dms_document_tags(tag_id, tag:dms_tags(tag_name, color_hex)),
          superseded_by:dms_documents!superseded_by_document_id(id, document_no, title)
        `)
        .eq("id", id)
        .is("deleted_at", null)
        .single(),

      supabase
        .from("dms_document_metadata_values")
        .select(`
          id, definition_id, value_text, value_number, value_date, value_datetime, value_boolean, value_json,
          definition:dms_metadata_definitions(id, field_code, field_label_en, field_type, is_required, sort_order, options_json)
        `)
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("definition_id"),

      supabase
        .from("dms_document_links")
        .select("id, entity_type, entity_id, link_role, is_primary, notes, linked_at")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("linked_at"),

      supabase
        .from("dms_document_versions")
        .select("id, version_number, version_label, change_notes, is_current, created_at")
        .eq("document_id", id)
        .order("version_number", { ascending: false }),

      supabase
        .from("dms_document_files")
        .select("id, file_name, mime_type, file_size_bytes, file_role, created_at")
        .eq("document_id", id)
        .is("deleted_at", null)
        .order("created_at"),
    ]);

    if (docResult.error || !docResult.data) {
      return { success: false, error: docResult.error?.message ?? "Document not found" };
    }

    const record: DmsDocumentRecordData = {
      ...(docResult.data as DmsDocumentRow),
      metadata_values: (metaResult.data ?? []) as unknown as DmsDocumentRecordData["metadata_values"],
      links: (linksResult.data ?? []) as unknown as DmsDocumentRecordData["links"],
      versions: (versionsResult.data ?? []) as unknown as DmsDocumentRecordData["versions"],
      files: (filesResult.data ?? []) as unknown as DmsDocumentRecordData["files"],
    };

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

export async function createDmsDocument(
  input: CreateDmsDocumentInput
): Promise<ActionResult<{ id: number; document_no: string }>> {
  try {
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

    const supabase = await createClient();

    // Generate document number via numbering RPC
    const { data: numData, error: numError } = await supabase.rpc(
      "generate_next_reference_number",
      {
        p_rule_code: "MASTER_DMS_DOCUMENT",
        p_document_type_code: null,
        p_target_table_name: "dms_documents",
        p_target_record_id: null,
        p_generation_reason: "DMS document created",
        p_generated_by: ctx.profile?.id ?? null,
      }
    );

    if (numError || !numData || numData.length === 0) {
      return { success: false, error: "Failed to generate document number" };
    }

    const documentNo: string = numData[0].generated_reference_number;

    const { data: doc, error } = await supabase
      .from("dms_documents")
      .insert({
        document_no: documentNo,
        title: data.title,
        description: data.description ?? null,
        document_type_id: data.document_type_id,
        category_id: data.category_id,
        status: data.status,
        confidentiality_level: data.confidentiality_level,
        owner_user_id: data.owner_user_id ?? null,
        owning_company_id: data.owning_company_id ?? null,
        owning_branch_id: data.owning_branch_id ?? null,
        party_id: data.party_id ?? null,
        issue_date: data.issue_date ?? null,
        expiry_date: data.expiry_date ?? null,
        reminder_policy_id: data.reminder_policy_id ?? null,
        legacy_document_code: data.legacy_document_code ?? null,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, document_no")
      .single();

    if (error) return { success: false, error: error.message };

    // Insert document_created event
    await insertDmsEvent(supabase, doc.id, "document_created", ctx.profile?.id ?? null, `Document ${documentNo} created`);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: doc.id,
      entity_reference: documentNo,
      action: "create",
      new_values: { title: data.title, document_no: documentNo },
    });

    revalidateDmsDocuments();

    return { success: true, data: { id: doc.id, document_no: documentNo } };
  } catch (err) {
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

    if (data.expiry_date && data.issue_date && data.expiry_date < data.issue_date) {
      return { success: false, error: "Expiry date must be on or after issue date" };
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("dms_documents")
      .update({
        ...data,
        updated_by: ctx.profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

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
    const { error } = await supabase
      .from("dms_documents")
      .update({ is_archived: true, archived_at: new Date().toISOString(), status: "archived", updated_by: ctx.profile?.id ?? null })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await insertDmsEvent(supabase, id, "archived", ctx.profile?.id ?? null, "Document archived");
    await logAudit({ module_code: "DMS", entity_name: "dms_documents", entity_id: id, entity_reference: String(id), action: "archive" });
    revalidateDmsDocuments(id);

    return { success: true };
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
    const { error } = await supabase
      .from("dms_documents")
      .update({ is_archived: false, archived_at: null, status: "active", updated_by: ctx.profile?.id ?? null })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await insertDmsEvent(supabase, id, "unarchived", ctx.profile?.id ?? null, "Document unarchived");
    await logAudit({ module_code: "DMS", entity_name: "dms_documents", entity_id: id, entity_reference: String(id), action: "unarchive" });
    revalidateDmsDocuments(id);

    return { success: true };
  } catch (err) {
    logger.error("unarchiveDmsDocument error", err);
    return { success: false, error: "Failed to unarchive document" };
  }
}

// ── deleteDmsDocument ─────────────────────────────────────────────────────────
//
// Performs a HARD DELETE via the purge_dms_document() PostgreSQL RPC.
//
// The RPC (SECURITY DEFINER) atomically:
//   - Collects file metadata for storage purge
//   - Hard-deletes the dms_documents row
//   - Postgres CASCADE removes all DMS-owned child rows automatically
//   - Postgres SET NULL nullifies cross-module FK references (employee, party, HR)
//
// After the RPC returns, this action purges physical files from Storage buckets.
// Storage purge errors are non-fatal (document data is already removed from DB).

export async function deleteDmsDocument(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    // Hard delete is system_admin only — no exceptions.
    if (!ctx.roleCodes.includes("system_admin")) {
      return { success: false, error: "Permission denied — only system administrators may permanently delete documents" };
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // ── 1. Call purge_dms_document() RPC — atomic hard-delete ────────────────
    // The RPC handles pre-delete cleanup (sessions, indirect review queue items)
    // and then hard-deletes the document. DB CASCADE removes all DMS child rows.
    const { data: rpcRows, error: rpcError } = await supabase
      .rpc("purge_dms_document", { p_id: id });

    if (rpcError) {
      if (rpcError.message?.includes("not found")) {
        return { success: false, error: "Document not found" };
      }
      return { success: false, error: rpcError.message };
    }

    // ── 2. Purge physical files from Supabase Storage ─────────────────────────
    const rpcResult = (rpcRows as { out_storage_files: unknown; out_files_found: number }[] | null)?.[0];
    const storageFiles = rpcResult?.out_storage_files as
      { bucket: string; path: string }[] | null ?? [];
    const fileCount = rpcResult?.out_files_found ?? 0;

    const byBucket = new Map<string, string[]>();
    for (const f of storageFiles) {
      if (!f.bucket || !f.path) continue;
      const paths = byBucket.get(f.bucket) ?? [];
      paths.push(f.path);
      byBucket.set(f.bucket, paths);
    }

    for (const [bucket, paths] of byBucket.entries()) {
      try {
        await adminClient.storage.from(bucket).remove(paths);
      } catch (storageErr) {
        // Non-fatal: document is already removed from DB.
        logger.warn(`[DMS delete] Storage purge failed for bucket "${bucket}":`, String(storageErr));
      }
    }

    // ── 3. Audit log ──────────────────────────────────────────────────────────
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: id,
      entity_reference: String(id),
      action: "delete",
      new_values: { storage_files_purged: fileCount },
    });

    revalidateDmsDocuments();
    return { success: true };
  } catch (err) {
    logger.error("deleteDmsDocument error", err);
    return { success: false, error: "Failed to delete document" };
  }
}

