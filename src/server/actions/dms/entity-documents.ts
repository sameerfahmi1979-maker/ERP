"use server";
import {readLegacyEntityDocuments} from "@/server/reads/dms-entity-documents";

import {
  DMS_ENTITY_TYPE_CODES,
  isValidDmsEntityType
} from "@/lib/dms/dms-entity-types";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  missingRequiredDocuments: number | null;
  openComplianceFindings: number | null;
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

export async function getDmsDocumentsByEntity(entityType:string,entityId:number):Promise<ActionResult<DmsEntityDocumentRow[]>> {
  const r=await readLegacyEntityDocuments({operation:"list",entityType:entityType as import("@/lib/dms/dms-entity-types").DmsEntityTypeValue,entityId,offset:0,limit:100});
  return r.collection?.kind==="list"?{success:true,data:r.collection.rows}:{success:false,error:r.error};
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

function canLinkDocumentToEntity(ctx: Awaited<ReturnType<typeof getAuthContext>>, entityType: string): boolean {
  if (hasPermission(ctx, "dms.documents.edit") || hasPermission(ctx, "dms.admin")) return true;
  if (
    entityType === "employee"
    && (hasPermission(ctx, "hr.compliance.manage") || hasPermission(ctx, "hr.admin"))
  ) {
    return true;
  }
  return false;
}

/**
 * Idempotent link — returns success if already linked or after creating the link.
 * HR compliance managers may link to employee without dms.documents.edit.
 */
export async function ensureDmsDocumentLinkedToEntity(
  documentId: number,
  entityType: string,
  entityId: number,
  options?: { is_primary?: boolean; link_role?: string | null; notes?: string | null }
): Promise<ActionResult<{ id: number; created: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated" };
    if (!canLinkDocumentToEntity(ctx, entityType)) {
      return { success: false, error: "Permission denied" };
    }

    if (!isValidDmsEntityType(entityType)) {
      return { success: false, error: `Unknown entity type: ${entityType}` };
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

    const admin = createAdminClient();

    const { data: doc } = await admin
      .from("dms_documents")
      .select("id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!doc) return { success: false, error: "DMS document not found" };

    const { data: existing } = await admin
      .from("dms_document_links")
      .select("id")
      .eq("document_id", documentId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      return { success: true, data: { id: existing.id as number, created: false } };
    }

    const { data, error } = await admin
      .from("dms_document_links")
      .insert({
        document_id: documentId,
        entity_type: parsed.data.entity_type,
        entity_id: parsed.data.entity_id,
        is_primary: parsed.data.is_primary,
        link_role: parsed.data.link_role ?? null,
        notes: parsed.data.notes ?? null,
        linked_by: ctx.profile.id,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await admin.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "party_document_link_created",
      description: `Linked to ${entityType} #${entityId}`,
      performed_by: ctx.profile.id,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_links",
      entity_id: documentId,
      entity_reference: String(documentId),
      action: "create",
      new_values: { entity_type: entityType, entity_id: entityId, auto_linked: true },
    });

    revalidatePath("/dms/documents");
    revalidatePath(`/dms/documents/record/${documentId}`);

    return { success: true, data: { id: data.id as number, created: true } };
  } catch (err) {
    logger.error("ensureDmsDocumentLinkedToEntity error", err);
    return { success: false, error: "Failed to link document to entity" };
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

export async function getDmsEntityDocumentComplianceSummary(entityType:string,entityId:number):Promise<ActionResult<DmsEntityDocumentComplianceSummary>> {
  const r=await readLegacyEntityDocuments({operation:"summary",entityType:entityType as import("@/lib/dms/dms-entity-types").DmsEntityTypeValue,entityId});
  return r.collection?.kind==="summary"?{success:true,data:r.collection.summary}:{success:false,error:r.error};
}

// ── getAvailableDmsDocumentsForLink ────────────────────────────────────────────

export type AvailableDmsDocumentOption = {
  id: number;
  document_no: string;
  title: string;
  document_type_name: string | null;
  document_type_code: string | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  has_extraction: boolean | null;
  has_ocr: boolean | null;
  extracted_person_name: string | null;
};

export async function getAvailableDmsDocumentsForLink(entityType:string,entityId:number,search?:string):Promise<ActionResult<AvailableDmsDocumentOption[]>> {
  const r=await readLegacyEntityDocuments({operation:"attach",entityType:entityType as import("@/lib/dms/dms-entity-types").DmsEntityTypeValue,entityId,search:search??"",offset:0,limit:100});
  return r.collection?.kind==="attach"?{success:true,data:r.collection.rows}:{success:false,error:r.error};
}
