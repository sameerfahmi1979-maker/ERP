"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import {
  DMS_ENTITY_TYPE_CODES,
  isValidDmsEntityType,
  getDmsEntityTypeLabel,
} from "@/lib/dms/dms-entity-types";
import {
  countMissingRequiredDocuments,
  loadLinkedDocuments,
  loadRulesForEntityType,
} from "@/lib/ai/common/compliance-checker";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ──────────────────────────────────────────────────────────────────────

export type DmsEntityDocumentRow = {
  link_id: number;
  link_is_primary: boolean;
  link_role: string | null;
  linked_at: string;
  document_id: number;
  document_no: string;
  legacy_document_code: string | null;
  title: string;
  description: string | null;
  status: string;
  confidentiality_level: string;
  issue_date: string | null;
  expiry_date: string | null;
  migrated_from_table: string | null;
  document_type_name: string | null;
  document_type_code: string | null;
  has_files: boolean;
  files_count: number;
  // DMS.15 — AI-era fields (added in DMS.12.x)
  ai_summary: string | null;
  ai_risk_level: string | null;
  ai_risk_score: number | null;
  completeness_score: number | null;
  created_at: string;
  updated_at: string;
};

export type DmsEntityDocumentComplianceSummary = {
  totalDocuments: number;
  expiredDocuments: number;
  expiringSoonDocuments: number;
  missingRequiredDocuments: number;
  openComplianceFindings: number;
  highRiskDocuments: number;
  criticalRiskDocuments: number;
  latestExpiryDate: string | null;
};

// ── Validation ─────────────────────────────────────────────────────────────────

const linkSchema = z.object({
  entity_type: z.enum(DMS_ENTITY_TYPE_CODES),
  entity_id: z.number().int().positive(),
  is_primary: z.boolean().default(false),
  link_role: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// ── getDmsDocumentsByEntity ────────────────────────────────────────────────────

export async function getDmsDocumentsByEntity(
  entityType: string,
  entityId: number
): Promise<ActionResult<DmsEntityDocumentRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("dms_document_links")
      .select(`
        id,
        is_primary,
        link_role,
        linked_at,
        document_id,
        document:dms_documents(
          id,
          document_no,
          legacy_document_code,
          title,
          description,
          status,
          confidentiality_level,
          issue_date,
          expiry_date,
          migrated_from_table,
          ai_summary,
          ai_risk_level,
          ai_risk_score,
          completeness_score,
          created_at,
          updated_at,
          document_type:dms_document_types(type_code, name_en)
        )
      `)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .order("linked_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const isAdmin = hasPermission(ctx, "dms.admin");
    const CONFIDENTIAL_LEVELS = ["hr", "legal", "executive"];

    const rows: DmsEntityDocumentRow[] = [];
    for (const link of data ?? []) {
      const doc = link.document as unknown as Record<string, unknown> | null;
      if (!doc) continue;

      const docType = doc.document_type as { type_code?: string; name_en?: string } | null;
      const confidentiality = doc.confidentiality_level as string;
      const isConfidential = CONFIDENTIAL_LEVELS.includes(confidentiality);

      // Fetch file count
      const { count: filesCount } = await supabase
        .from("dms_document_files")
        .select("id", { count: "exact", head: true })
        .eq("document_id", link.document_id)
        .is("deleted_at", null);

      rows.push({
        link_id: link.id,
        link_is_primary: link.is_primary,
        link_role: link.link_role,
        linked_at: link.linked_at,
        document_id: link.document_id,
        document_no: doc.document_no as string,
        legacy_document_code: doc.legacy_document_code as string | null,
        title: doc.title as string,
        description: doc.description as string | null,
        status: doc.status as string,
        confidentiality_level: confidentiality,
        issue_date: doc.issue_date as string | null,
        expiry_date: doc.expiry_date as string | null,
        migrated_from_table: doc.migrated_from_table as string | null,
        document_type_name: docType?.name_en ?? null,
        document_type_code: docType?.type_code ?? null,
        has_files: (filesCount ?? 0) > 0,
        files_count: filesCount ?? 0,
        // Redact AI summary for restricted documents unless user is admin
        ai_summary:
          isConfidential && !isAdmin
            ? null
            : (doc.ai_summary as string | null),
        ai_risk_level: doc.ai_risk_level as string | null,
        ai_risk_score:
          doc.ai_risk_score != null ? Number(doc.ai_risk_score) : null,
        completeness_score:
          doc.completeness_score != null
            ? Number(doc.completeness_score)
            : null,
        created_at: doc.created_at as string,
        updated_at: doc.updated_at as string,
      });
    }

    return { success: true, data: rows };
  } catch (err) {
    logger.error("getDmsDocumentsByEntity error", err);
    return { success: false, error: "Failed to load entity documents" };
  }
}

// ── linkDmsDocumentToEntity ────────────────────────────────────────────────────

export async function linkDmsDocumentToEntity(
  documentId: number,
  entityType: string,
  entityId: number,
  options?: { is_primary?: boolean; link_role?: string | null; notes?: string | null }
): Promise<ActionResult<{ id: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = linkSchema.safeParse({
      entity_type: entityType,
      entity_id: entityId,
      is_primary: options?.is_primary ?? false,
      link_role: options?.link_role ?? null,
      notes: options?.notes ?? null,
    });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    const supabase = await createClient();

    // Prevent duplicate active link
    const { data: existing } = await supabase
      .from("dms_document_links")
      .select("id")
      .eq("document_id", documentId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "This document is already linked to this entity" };
    }

    const { data, error } = await supabase
      .from("dms_document_links")
      .insert({
        document_id: documentId,
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        is_primary: parsed.data.is_primary,
        link_role: parsed.data.link_role ?? null,
        notes: parsed.data.notes ?? null,
        linked_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "party_document_link_created",
      description: `Linked to ${entityType} #${entityId}`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_links",
      entity_id: documentId,
      entity_reference: String(documentId),
      action: "create",
      new_values: { entity_type: entityType, entity_id: entityId },
    });

    revalidatePath("/dms/documents");
    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true, data: { id: data.id } };
  } catch (err) {
    logger.error("linkDmsDocumentToEntity error", err);
    return { success: false, error: "Failed to create document link" };
  }
}

// ── unlinkDmsDocumentFromEntity ────────────────────────────────────────────────

export async function unlinkDmsDocumentFromEntity(
  linkId: number,
  documentId: number,
  entityType: string,
  entityId: number
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("dms_document_links")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", linkId)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "party_document_link_removed",
      description: `Unlinked from ${entityType} #${entityId}`,
      performed_by: ctx.profile?.id ?? null,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_links",
      entity_id: linkId,
      entity_reference: String(linkId),
      action: "delete",
      new_values: { entity_type: entityType, entity_id: entityId },
    });

    revalidatePath("/dms/documents");
    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (err) {
    logger.error("unlinkDmsDocumentFromEntity error", err);
    return { success: false, error: "Failed to unlink document" };
  }
}

// ── getDmsEntityDocumentComplianceSummary ──────────────────────────────────────

export async function getDmsEntityDocumentComplianceSummary(
  entityType: string,
  entityId: number
): Promise<ActionResult<DmsEntityDocumentComplianceSummary>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    if (!isValidDmsEntityType(entityType)) {
      return { success: false, error: `Unknown entity type: ${entityType}` };
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data, error } = await supabase
      .from("dms_document_links")
      .select(`
        document_id,
        document:dms_documents(
          expiry_date,
          ai_risk_level
        )
      `)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    const rules = await loadRulesForEntityType(admin, entityType);
    const linkedDocuments = await loadLinkedDocuments(admin, entityType, entityId);
    const missingRequiredDocuments = countMissingRequiredDocuments({
      entityType,
      rules,
      linkedDocuments,
    });

    let openComplianceFindings = 0;
    if (
      hasPermission(ctx, "ai.compliance.view") ||
      hasPermission(ctx, "ai.common.admin") ||
      ctx.roleCodes.includes("system_admin")
    ) {
      const { count } = await supabase
        .from("erp_ai_compliance_findings")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("status", "open")
        .is("deleted_at", null);
      openComplianceFindings = count ?? 0;
    }

    const now = new Date();
    const soonThreshold = new Date(now);
    soonThreshold.setDate(soonThreshold.getDate() + 30);

    let expiredDocuments = 0;
    let expiringSoonDocuments = 0;
    let highRiskDocuments = 0;
    let criticalRiskDocuments = 0;
    let latestExpiryDate: string | null = null;

    for (const link of data ?? []) {
      const doc = link.document as unknown as {
        expiry_date?: string | null;
        ai_risk_level?: string | null;
      } | null;
      if (!doc) continue;

      if (doc.expiry_date) {
        const expiry = new Date(doc.expiry_date);
        if (expiry < now) {
          expiredDocuments++;
        } else if (expiry <= soonThreshold) {
          expiringSoonDocuments++;
        }
        if (!latestExpiryDate || doc.expiry_date > latestExpiryDate) {
          latestExpiryDate = doc.expiry_date;
        }
      }

      if (doc.ai_risk_level === "critical") criticalRiskDocuments++;
      else if (doc.ai_risk_level === "high") highRiskDocuments++;
    }

    return {
      success: true,
      data: {
        totalDocuments: (data ?? []).length,
        expiredDocuments,
        expiringSoonDocuments,
        missingRequiredDocuments,
        openComplianceFindings,
        highRiskDocuments,
        criticalRiskDocuments,
        latestExpiryDate,
      },
    };
  } catch (err) {
    logger.error("getDmsEntityDocumentComplianceSummary error", err);
    return { success: false, error: "Failed to load compliance summary" };
  }
}

// ── getAvailableDmsDocumentsForLink ────────────────────────────────────────────

export type AvailableDmsDocumentOption = {
  id: number;
  document_no: string;
  title: string;
  document_type_name: string | null;
  status: string;
};

export async function getAvailableDmsDocumentsForLink(
  entityType: string,
  entityId: number,
  search?: string
): Promise<ActionResult<AvailableDmsDocumentOption[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();

    // Get already-linked document IDs to exclude
    const { data: existing } = await supabase
      .from("dms_document_links")
      .select("document_id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null);

    const excludeIds = (existing ?? []).map((r: { document_id: number }) => r.document_id);

    let query = supabase
      .from("dms_documents")
      .select("id, document_no, title, document_type:dms_document_types(name_en)")
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(50);

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`document_no.ilike.${s},title.ilike.${s}`);
    }

    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as number,
      document_no: d.document_no as string,
      title: d.title as string,
      document_type_name: (d.document_type as { name_en?: string } | null)?.name_en ?? null,
      status: d.status as string,
    }));

    return { success: true, data: rows };
  } catch (err) {
    logger.error("getAvailableDmsDocumentsForLink error", err);
    return { success: false, error: "Failed to load available documents" };
  }
}
