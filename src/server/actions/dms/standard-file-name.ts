"use server";

/**
 * DMS.NAMING.1 — Server-side standard file name resolution + bulk retroactive rename.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import {
  dedupeFileName,
  stripFilenameExtension,
  validateStandardFileName,
} from "@/lib/dms/standard-file-name";
import {
  metadataValuesToFieldMap,
  resolveStandardFileName,
  type StandardFileNameResolveContext,
} from "@/lib/dms/resolve-standard-file-name";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function resolveOwnerNameFromEntity(
  supabase: SupabaseClient,
  entityType: string,
  entityId: number
): Promise<string | null> {
  switch (entityType) {
    case "employee":
    case "employee_compliance":
    case "employee_identity_document":
    case "employee_medical_insurance":
    case "employee_dependent":
    case "employee_access_card":
    case "employee_training_certificate":
    case "employee_medical_record":
    case "employee_contract": {
      const { data } = await supabase
        .from("employees")
        .select("full_name_en, known_name")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!data) return null;
      return (data.full_name_en as string) || (data.known_name as string) || null;
    }
    case "party":
    case "party_license":
    case "party_tax_registration": {
      const { data } = await supabase
        .from("parties")
        .select("display_name, legal_name_en, trade_name_en, short_name")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!data) return null;
      return (
        (data.display_name as string) ||
        (data.legal_name_en as string) ||
        (data.trade_name_en as string) ||
        (data.short_name as string) ||
        null
      );
    }
    case "vehicle":
    case "fleet_asset": {
      const { data } = await supabase
        .from("vehicles")
        .select("plate_number")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (data?.plate_number) return `Plate_${data.plate_number as string}`;
      return null;
    }
    default:
      return null;
  }
}

async function resolveOwnerForDocument(
  supabase: SupabaseClient,
  input: {
    partyId?: number | null;
    links?: Array<{ entityType: string; entityId: number }>;
    batchEntityType?: string | null;
    batchEntityId?: number | null;
  }
): Promise<string | null> {
  if (input.batchEntityType && input.batchEntityId) {
    const fromBatch = await resolveOwnerNameFromEntity(
      supabase,
      input.batchEntityType,
      input.batchEntityId
    );
    if (fromBatch) return fromBatch;
  }

  const employeeLink = input.links?.find((l) => l.entityType === "employee");
  if (employeeLink) {
    const name = await resolveOwnerNameFromEntity(supabase, "employee", employeeLink.entityId);
    if (name) return name;
  }

  const partyLink = input.links?.find((l) => l.entityType === "party");
  if (partyLink) {
    const name = await resolveOwnerNameFromEntity(supabase, "party", partyLink.entityId);
    if (name) return name;
  }

  if (input.partyId) {
    const name = await resolveOwnerNameFromEntity(supabase, "party", input.partyId);
    if (name) return name;
  }

  const vehicleLink = input.links?.find((l) =>
    ["vehicle", "fleet_asset"].includes(l.entityType)
  );
  if (vehicleLink) {
    const name = await resolveOwnerNameFromEntity(
      supabase,
      vehicleLink.entityType,
      vehicleLink.entityId
    );
    if (name) return name;
  }

  return null;
}

export type ResolveStandardFileNameParams = {
  typeCode: string;
  requiresExpiryTracking?: boolean;
  expiryDate?: string | null;
  documentNo?: string | null;
  originalFilename: string;
  extractedFields?: Record<string, unknown> | null;
  metadataValues?: Array<{ definitionId: number; rawValue: string }>;
  metadataDefinitions?: Array<{ id: number; field_code: string }>;
  partyId?: number | null;
  links?: Array<{ entityType: string; entityId: number }>;
  uploadSessionId?: number;
  standardFileNameOverride?: string | null;
  suggestedDescription?: string | null;
  suggestedTitle?: string | null;
};

export async function resolveDmsStandardFileNameForContext(
  params: ResolveStandardFileNameParams
): Promise<string> {
  const supabase = await createClient();

  let batchEntityType: string | null = null;
  let batchEntityId: number | null = null;

  if (params.uploadSessionId) {
    const { data: session } = await supabase
      .from("dms_upload_sessions")
      .select("batch_id")
      .eq("id", params.uploadSessionId)
      .maybeSingle();

    const batchId = session?.batch_id as number | null;
    if (batchId) {
      const { data: batch } = await supabase
        .from("dms_upload_batches")
        .select("entity_type, entity_id")
        .eq("id", batchId)
        .maybeSingle();
      batchEntityType = (batch?.entity_type as string | null) ?? null;
      batchEntityId = (batch?.entity_id as number | null) ?? null;
    }
  }

  const metadataFieldMap =
    params.metadataValues && params.metadataDefinitions
      ? metadataValuesToFieldMap(params.metadataValues, params.metadataDefinitions)
      : {};

  const ownerName = await resolveOwnerForDocument(supabase, {
    partyId: params.partyId,
    links: params.links,
    batchEntityType,
    batchEntityId,
  });

  const ctx: StandardFileNameResolveContext = {
    typeCode: params.typeCode,
    requiresExpiryTracking: params.requiresExpiryTracking,
    expiryDate: params.expiryDate,
    documentNo: params.documentNo,
    originalFilename: params.originalFilename,
    extractedFields: { ...(params.extractedFields ?? {}), ...metadataFieldMap },
    metadataValues: metadataFieldMap,
    ownerName,
    entityType: batchEntityType,
    entityId: batchEntityId,
    standardFileNameOverride: params.standardFileNameOverride,
    aiOwnerHints: {
      suggestedDescription: params.suggestedDescription ?? null,
      suggestedTitle: params.suggestedTitle ?? null,
    },
  };

  return resolveStandardFileName(ctx);
}

const PreviewSchema = z.object({
  typeCode: z.string().min(1),
  requiresExpiryTracking: z.boolean().optional(),
  expiryDate: z.string().nullable().optional(),
  originalFilename: z.string().min(1),
  extractedFields: z.record(z.string(), z.unknown()).nullable().optional(),
  metadataValues: z
    .array(z.object({ definitionId: z.number().int().positive(), rawValue: z.string() }))
    .optional(),
  metadataDefinitions: z
    .array(z.object({ id: z.number().int().positive(), field_code: z.string() }))
    .optional(),
  partyId: z.number().int().positive().nullable().optional(),
  links: z
    .array(z.object({ entityType: z.string(), entityId: z.number().int().positive() }))
    .optional(),
  uploadSessionId: z.number().int().positive().optional(),
  standardFileNameOverride: z.string().nullable().optional(),
  suggestedDescription: z.string().nullable().optional(),
  suggestedTitle: z.string().nullable().optional(),
});

export async function previewDmsStandardFileName(
  input: z.input<typeof PreviewSchema>
): Promise<ActionResult<{ fileName: string; validation: ReturnType<typeof validateStandardFileName> }>> {
  try {
    const parsed = PreviewSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const fileName = await resolveDmsStandardFileNameForContext(parsed.data);
    const validation = validateStandardFileName(fileName, {
      requiresExpiryTracking: parsed.data.requiresExpiryTracking,
    });

    return { success: true, data: { fileName, validation } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

const BulkRenameSchema = z.object({
  limit: z.number().int().min(1).max(500).optional().default(100),
  dryRun: z.boolean().optional().default(false),
});

export type BulkRenameResult = {
  processed: number;
  updated: number;
  skipped: number;
  qualitySkipped: number;
  errors: string[];
  samples: Array<{
    documentId: number;
    oldName: string;
    newName: string;
    qualityIssue?: string;
  }>;
};

export async function bulkRenameDocumentsToStandardFileNames(
  input: z.input<typeof BulkRenameSchema> = {}
): Promise<ActionResult<BulkRenameResult>> {
  try {
    const parsed = BulkRenameSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const admin = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: requires dms.admin" };
    }

    const { limit, dryRun } = parsed.data;

    const { data: files, error } = await admin
      .from("dms_document_files")
      .select(
        `id, file_name, document_id, file_role,
         document:dms_documents!document_id(
           id, document_no, title, expiry_date, party_id,
           document_type:dms_document_types!document_type_id(type_code, requires_expiry_tracking)
         )`
      )
      .eq("file_role", "original")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const result: BulkRenameResult = {
      processed: 0,
      updated: 0,
      skipped: 0,
      qualitySkipped: 0,
      errors: [],
      samples: [],
    };

    const usedNames = new Set<string>();

    for (const row of files ?? []) {
      result.processed++;
      const fileId = row.id as number;
      const oldName = row.file_name as string;
      const doc = row.document as unknown as Record<string, unknown> | null;
      if (!doc) {
        result.skipped++;
        continue;
      }

      const documentId = doc.id as number;
      const docTypeRaw = doc.document_type;
      const docType = (Array.isArray(docTypeRaw) ? docTypeRaw[0] : docTypeRaw) as {
        type_code: string;
        requires_expiry_tracking: boolean;
      } | null;
      if (!docType?.type_code) {
        result.skipped++;
        continue;
      }

      const [{ data: metaRows }, { data: linkRows }, { data: aiRows }] = await Promise.all([
        admin
          .from("dms_document_metadata_values")
          .select("value_text, definition:dms_metadata_definitions(field_code)")
          .eq("document_id", documentId),
        admin
          .from("dms_document_links")
          .select("entity_type, entity_id")
          .eq("document_id", documentId),
        // Fetch the most recent AI extraction result — gives owner/docno from document content
        admin
          .from("dms_ai_extraction_results")
          .select("extracted_fields_json, suggested_description, suggested_title")
          .eq("document_id", documentId)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const aiResult = aiRows?.[0] ?? null;
      const aiExtractedFields =
        (aiResult?.extracted_fields_json as Record<string, unknown> | null) ?? {};

      const metadataFieldMap: Record<string, unknown> = {};
      for (const m of metaRows ?? []) {
        const defRaw = m.definition;
        const def = (Array.isArray(defRaw) ? defRaw[0] : defRaw) as { field_code: string } | null;
        const val = (m.value_text as string | null) ?? "";
        if (def?.field_code && val.trim()) metadataFieldMap[def.field_code] = val.trim();
      }

      // Merge: metadata values (saved by human) take priority over raw AI extraction
      const mergedFields: Record<string, unknown> = { ...aiExtractedFields, ...metadataFieldMap };

      const links = (linkRows ?? []).map((l) => ({
        entityType: l.entity_type as string,
        entityId: l.entity_id as number,
      }));

      let newName: string;
      try {
        newName = await resolveDmsStandardFileNameForContext({
          typeCode: docType.type_code,
          requiresExpiryTracking: docType.requires_expiry_tracking,
          expiryDate: (doc.expiry_date as string | null) ?? null,
          documentNo: doc.document_no as string,
          originalFilename: oldName,
          extractedFields: mergedFields,
          suggestedDescription: (aiResult?.suggested_description as string | null) ?? null,
          suggestedTitle: (aiResult?.suggested_title as string | null) ?? null,
          partyId: (doc.party_id as number | null) ?? null,
          links,
        });
      } catch (e) {
        result.errors.push(`Document ${documentId}: ${String(e)}`);
        result.skipped++;
        continue;
      }

      // Quality gate: never write a name that degrades existing data.
      // If the old name does NOT have Unknown_owner/DMS-Unknown but the new one would,
      // skip this document — it is better to leave it unchanged.
      const oldLower = oldName.toLowerCase();
      const newLower = newName.toLowerCase();
      const oldHasRealOwner = !oldLower.includes("unknown_owner") && !oldLower.includes("unknown owner");
      const oldHasRealDocNo = !oldLower.includes("dms-unknown") && !oldLower.includes("dms_unknown");
      const newHasUnknownOwner = newLower.includes("unknown_owner");
      const newHasDmsUnknown = newLower.includes("dms-unknown");

      if ((oldHasRealOwner && newHasUnknownOwner) || (oldHasRealDocNo && newHasDmsUnknown)) {
        const issue = [
          oldHasRealOwner && newHasUnknownOwner ? "owner lost" : "",
          oldHasRealDocNo && newHasDmsUnknown ? "doc-no lost" : "",
        ]
          .filter(Boolean)
          .join(", ");

        result.qualitySkipped++;
        result.skipped++;
        // Always record quality-blocked renames so they appear in the preview table
        if (result.samples.length < 50) {
          result.samples.push({ documentId, oldName, newName, qualityIssue: issue });
        }
        continue;
      }

      newName = dedupeFileName(newName, usedNames);
      usedNames.add(newName);

      if (oldName === newName) {
        result.skipped++;
        continue;
      }

      if (result.samples.length < 50) {
        result.samples.push({ documentId, oldName, newName });
      }

      if (!dryRun) {
        const { error: updErr } = await admin
          .from("dms_document_files")
          .update({ file_name: newName })
          .eq("id", fileId);

        if (updErr) {
          result.errors.push(`File ${fileId}: ${updErr.message}`);
          continue;
        }

        const titleBase = stripFilenameExtension(newName);
        await admin
          .from("dms_documents")
          .update({
            title: titleBase,
            updated_by: ctx.profile.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId);
      }

      result.updated++;
    }

    if (!dryRun && result.updated > 0) {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_document_files",
        entity_id: 0,
        entity_reference: "bulk_standard_rename",
        action: "update",
        new_values: {
          event: "dms_bulk_standard_file_rename",
          processed: result.processed,
          updated: result.updated,
          skipped: result.skipped,
        },
      });
      revalidatePath("/dms/documents");
      revalidatePath("/admin/dms");
    }

    logger.info("[dms-naming] bulk rename complete", {
      dryRun,
      processed: result.processed,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errors.length,
    });

    return { success: true, data: result };
  } catch (e) {
    logger.error("bulkRenameDocumentsToStandardFileNames error", e);
    return { success: false, error: String(e) };
  }
}

export async function resolveStandardFileNameForIntakeApprove(input: {
  uploadSessionId: number;
  documentTypeId: number;
  expiryDate?: string | null;
  documentNo?: string | null;
  partyId?: number | null;
  links?: Array<{ entityType: string; entityId: number }>;
  metadataValues?: Array<{ definitionId: number; fieldType: string; rawValue: string }>;
  standardFileName?: string | null;
  originalFilename: string;
  aiResultId?: number | null;
  description?: string | null;
  title?: string | null;
}): Promise<string> {
  const supabase = await createClient();

  const { data: docType } = await supabase
    .from("dms_document_types")
    .select("type_code, requires_expiry_tracking")
    .eq("id", input.documentTypeId)
    .single();

  if (!docType) return input.originalFilename;

  let extractedFields: Record<string, unknown> | null = null;
  let suggestedDescription: string | null = input.description ?? null;
  let suggestedTitle: string | null = input.title ?? null;
  if (input.aiResultId) {
    const { data: aiRow } = await supabase
      .from("dms_ai_extraction_results")
      .select("extracted_fields_json, suggested_description, suggested_title")
      .eq("id", input.aiResultId)
      .maybeSingle();
    extractedFields = (aiRow?.extracted_fields_json as Record<string, unknown> | null) ?? null;
    if (!suggestedDescription) {
      suggestedDescription = (aiRow?.suggested_description as string | null) ?? null;
    }
    if (!suggestedTitle) {
      suggestedTitle = (aiRow?.suggested_title as string | null) ?? null;
    }
  }

  const { data: metaDefs } = await supabase
    .from("dms_metadata_definitions")
    .select("id, field_code")
    .eq("document_type_id", input.documentTypeId)
    .eq("is_active", true);

  return resolveDmsStandardFileNameForContext({
    typeCode: docType.type_code as string,
    requiresExpiryTracking: docType.requires_expiry_tracking as boolean,
    expiryDate: input.expiryDate,
    documentNo: input.documentNo,
    originalFilename: input.originalFilename,
    extractedFields,
    metadataValues: input.metadataValues?.map((m) => ({
      definitionId: m.definitionId,
      rawValue: m.rawValue,
    })),
    metadataDefinitions: (metaDefs ?? []) as Array<{ id: number; field_code: string }>,
    partyId: input.partyId,
    links: input.links?.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
    uploadSessionId: input.uploadSessionId,
    standardFileNameOverride: input.standardFileName,
    suggestedDescription,
    suggestedTitle,
  });
}

export async function resolveStandardFileNameForDocumentCreate(input: {
  documentTypeId: number;
  expiryDate?: string | null;
  documentNo: string;
  partyId?: number | null;
  originalFilename: string;
  standardFileName?: string | null;
}): Promise<string> {
  const supabase = await createClient();

  const { data: docType } = await supabase
    .from("dms_document_types")
    .select("type_code, requires_expiry_tracking")
    .eq("id", input.documentTypeId)
    .single();

  if (!docType) return input.originalFilename;

  return resolveDmsStandardFileNameForContext({
    typeCode: docType.type_code as string,
    requiresExpiryTracking: docType.requires_expiry_tracking as boolean,
    expiryDate: input.expiryDate,
    documentNo: input.documentNo,
    originalFilename: input.originalFilename,
    partyId: input.partyId,
    standardFileNameOverride: input.standardFileName,
  });
}

export async function resolveStandardFileNameForExistingDocument(input: {
  documentId: number;
  originalFilename: string;
  standardFileName?: string | null;
}): Promise<string> {
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("dms_documents")
    .select(
      `id, document_no, expiry_date, party_id,
       document_type:dms_document_types!document_type_id(type_code, requires_expiry_tracking)`
    )
    .eq("id", input.documentId)
    .single();

  if (!doc) return input.originalFilename;

  const docTypeRaw = doc.document_type;
  const docType = (Array.isArray(docTypeRaw) ? docTypeRaw[0] : docTypeRaw) as {
    type_code: string;
    requires_expiry_tracking: boolean;
  } | null;
  if (!docType) return input.originalFilename;

  const [{ data: metaRows }, { data: linkRows }] = await Promise.all([
    supabase
      .from("dms_document_metadata_values")
      .select("value_text, definition:dms_metadata_definitions(field_code)")
      .eq("document_id", input.documentId),
    supabase
      .from("dms_document_links")
      .select("entity_type, entity_id")
      .eq("document_id", input.documentId),
  ]);

  const metadataFieldMap: Record<string, unknown> = {};
  for (const m of metaRows ?? []) {
    const defRaw = m.definition;
    const def = (Array.isArray(defRaw) ? defRaw[0] : defRaw) as { field_code: string } | null;
    const val = (m.value_text as string | null) ?? "";
    if (def?.field_code && val.trim()) metadataFieldMap[def.field_code] = val.trim();
  }

  const links = (linkRows ?? []).map((l) => ({
    entityType: l.entity_type as string,
    entityId: l.entity_id as number,
  }));

  return resolveDmsStandardFileNameForContext({
    typeCode: docType.type_code,
    requiresExpiryTracking: docType.requires_expiry_tracking,
    expiryDate: (doc.expiry_date as string | null) ?? null,
    documentNo: doc.document_no as string,
    originalFilename: input.originalFilename,
    extractedFields: metadataFieldMap,
    partyId: (doc.party_id as number | null) ?? null,
    links,
    standardFileNameOverride: input.standardFileName,
  });
}
