"use server";

/**
 * ERP DMS AI Phase 8 — ERP Mapping Registry Server Actions
 *
 * Provides CRUD for dms_metadata_erp_mappings (admin-only write) and
 * getDmsErpMappingPreview (read-only diff preview — no ERP writes).
 *
 * Phase 8 rules:
 *  - No writes to ERP target tables (employee_identity_documents, party_licenses, etc.)
 *  - All target_table / target_field validated against ERP_MAPPING_TARGET_REGISTRY
 *  - Admin-only create/update/delete
 *  - getDmsErpMappingPreview requires dms.documents.view or higher
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import {
  validateErpMappingTarget,
  getErpMappingTargetConfig,
  listErpMappingTargets,
  listErpMappingFields,
  type ErpMappingTargetConfig,
} from "@/lib/dms/erp-mapping/erp-mapping-targets";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsErpMappingRow = {
  id: number;
  metadata_definition_id: number;
  document_type_id: number;
  target_module: string;
  target_entity: string;
  target_table: string;
  target_field: string;
  target_relation_field: string;
  target_record_strategy: string;
  mapping_direction: string;
  mapping_priority: number;
  is_active: boolean;
  allow_apply_to_existing: boolean;
  requires_confirmation: boolean;
  requires_target_permission: string;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined
  field_code?: string;
  field_label_en?: string;
  document_type_name?: string;
};

export type DmsErpMappingPreviewRow = {
  mappingId: number;
  metadataDefinitionId: number;
  fieldCode: string;
  fieldLabelEn: string;
  dmsValue: string | null;
  targetModule: string;
  targetEntity: string;
  targetTable: string;
  targetField: string;
  targetFieldLabel: string;
  targetRecordId: number | null;
  targetRecordLabel: string | null;
  targetValue: string | null;
  diffStatus: "same" | "new" | "changed" | "no_dms_value" | "no_target" | "no_link" | "ambiguous";
  requiredPermission: string;
  warning: string | null;
};

// ── Validation schemas ─────────────────────────────────────────────────────────

const ALLOWED_RECORD_STRATEGIES = ["link_exact", "link_parent"] as const;

const createMappingSchema = z.object({
  metadata_definition_id: z.number().int().positive(),
  document_type_id: z.number().int().positive(),
  target_module: z.string().min(1).max(50),
  target_entity: z.string().min(1).max(100),
  target_table: z.string().min(1).max(100),
  target_field: z.string().min(1).max(100),
  target_relation_field: z.string().min(1).max(100),
  target_record_strategy: z.enum(ALLOWED_RECORD_STRATEGIES).default("link_exact"),
  mapping_priority: z.number().int().min(1).max(999).default(10),
  is_active: z.boolean().default(true),
  requires_confirmation: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

const updateMappingSchema = createMappingSchema.partial().extend({
  id: z.number().int().positive(),
});

// ── Permission helpers ─────────────────────────────────────────────────────────

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.admin") ||
    hasPermission(ctx, "dms.documents.manage_types") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin") ||
    false
  );
}

function canViewMappings(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.documents.ai.view") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin") ||
    hasPermission(ctx, "dms.documents.manage_types") ||
    ctx.roleCodes?.includes("system_admin") ||
    ctx.roleCodes?.includes("group_admin") ||
    false
  );
}

// ── Mapping row mapper ────────────────────────────────────────────────────────

function mapMappingRow(raw: Record<string, unknown>): DmsErpMappingRow {
  return {
    id: raw["id"] as number,
    metadata_definition_id: raw["metadata_definition_id"] as number,
    document_type_id: raw["document_type_id"] as number,
    target_module: raw["target_module"] as string,
    target_entity: raw["target_entity"] as string,
    target_table: raw["target_table"] as string,
    target_field: raw["target_field"] as string,
    target_relation_field: raw["target_relation_field"] as string,
    target_record_strategy: raw["target_record_strategy"] as string,
    mapping_direction: raw["mapping_direction"] as string,
    mapping_priority: raw["mapping_priority"] as number,
    is_active: raw["is_active"] as boolean,
    allow_apply_to_existing: raw["allow_apply_to_existing"] as boolean,
    requires_confirmation: raw["requires_confirmation"] as boolean,
    requires_target_permission: raw["requires_target_permission"] as string,
    notes: (raw["notes"] as string | null) ?? null,
    created_by: (raw["created_by"] as number | null) ?? null,
    created_at: raw["created_at"] as string,
    updated_at: raw["updated_at"] as string,
    deleted_at: (raw["deleted_at"] as string | null) ?? null,
    // Joined fields (may not always be present)
    field_code: (raw["field_code"] as string | undefined) ?? undefined,
    field_label_en: (raw["field_label_en"] as string | undefined) ?? undefined,
    document_type_name: (raw["document_type_name"] as string | undefined) ?? undefined,
  };
}

// ── CRUD — Get for a definition ───────────────────────────────────────────────

export async function getDmsErpMappingsForDefinition(
  definitionId: number
): Promise<ActionResult<DmsErpMappingRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewMappings(ctx)) return { success: false, error: "Insufficient permissions to view ERP mappings" };

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("dms_metadata_erp_mappings")
      .select("*")
      .eq("metadata_definition_id", definitionId)
      .is("deleted_at", null)
      .order("mapping_priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };
    const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(mapMappingRow);
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── CRUD — Get for a document type ────────────────────────────────────────────

export async function getDmsErpMappingsForDocumentType(
  documentTypeId: number
): Promise<ActionResult<DmsErpMappingRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewMappings(ctx)) return { success: false, error: "Insufficient permissions" };

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("dms_metadata_erp_mappings")
      .select("*")
      .eq("document_type_id", documentTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("mapping_priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };
    const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(mapMappingRow);
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── CRUD — Create ─────────────────────────────────────────────────────────────

export async function createDmsErpMapping(
  input: z.infer<typeof createMappingSchema>
): Promise<ActionResult<{ id: number }>> {
  try {
    const parsed = createMappingSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }

    const ctx = await getAuthContext();
    if (!isAdminUser(ctx)) {
      return { success: false, error: "Only DMS admins can create ERP mapping rules" };
    }

    // Validate target against allowlist
    const validation = validateErpMappingTarget(
      parsed.data.target_module,
      parsed.data.target_table,
      parsed.data.target_field
    );
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Derive required_permission and relation_field from the registry
    const config = validation.config;
    const requiredPermission = config.permission;
    const relationField = config.relationField;

    // Validate that supplied relation_field matches registry
    if (parsed.data.target_relation_field !== relationField) {
      return {
        success: false,
        error: `target_relation_field must be "${relationField}" for table "${parsed.data.target_table}"`,
      };
    }

    // Validate mapping_direction is only dms_to_erp
    // (future-proofing: reject other values)

    const adminClient = createAdminClient();

    // Verify metadata_definition belongs to the document_type_id
    const { data: def, error: defErr } = await adminClient
      .from("dms_metadata_definitions")
      .select("id, document_type_id, field_code, field_label_en")
      .eq("id", parsed.data.metadata_definition_id)
      .single();

    if (defErr || !def) {
      return { success: false, error: "Metadata definition not found" };
    }
    if ((def as Record<string, unknown>)["document_type_id"] !== parsed.data.document_type_id) {
      return { success: false, error: "Metadata definition does not belong to the specified document type" };
    }

    const { data, error } = await adminClient
      .from("dms_metadata_erp_mappings")
      .insert({
        metadata_definition_id: parsed.data.metadata_definition_id,
        document_type_id: parsed.data.document_type_id,
        target_module: parsed.data.target_module,
        target_entity: parsed.data.target_entity,
        target_table: parsed.data.target_table,
        target_field: parsed.data.target_field,
        target_relation_field: relationField,
        target_record_strategy: parsed.data.target_record_strategy,
        mapping_direction: "dms_to_erp",
        mapping_priority: parsed.data.mapping_priority,
        is_active: parsed.data.is_active,
        allow_apply_to_existing: false, // Phase 8: always false
        requires_confirmation: parsed.data.requires_confirmation,
        requires_target_permission: requiredPermission,
        notes: parsed.data.notes ?? null,
        created_by: ctx.profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    const row = data as unknown as Record<string, unknown>;

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_erp_mappings",
      entity_id: row["id"] as number,
      entity_reference: `${parsed.data.target_table}.${parsed.data.target_field}`,
      action: "create",
      new_values: { target_table: parsed.data.target_table, target_field: parsed.data.target_field },
    });

    return { success: true, data: { id: row["id"] as number } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── CRUD — Update ─────────────────────────────────────────────────────────────

export async function updateDmsErpMapping(
  id: number,
  input: Omit<z.infer<typeof updateMappingSchema>, "id">
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isAdminUser(ctx)) {
      return { success: false, error: "Only DMS admins can update ERP mapping rules" };
    }

    const adminClient = createAdminClient();

    // Fetch existing row
    const { data: existing, error: fetchErr } = await adminClient
      .from("dms_metadata_erp_mappings")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !existing) return { success: false, error: "Mapping not found" };
    const existingRow = existing as unknown as Record<string, unknown>;

    // Resolve final target values (use input if provided, else keep existing)
    const targetModule = (input.target_module ?? existingRow["target_module"]) as string;
    const targetTable  = (input.target_table  ?? existingRow["target_table"])  as string;
    const targetField  = (input.target_field  ?? existingRow["target_field"])  as string;

    const validation = validateErpMappingTarget(targetModule, targetTable, targetField);
    if (!validation.valid) return { success: false, error: validation.reason };

    const config = validation.config;
    const relationField = config.relationField;
    const requiredPermission = config.permission;

    const updatePayload: Record<string, unknown> = {
      target_module: targetModule,
      target_entity: input.target_entity ?? existingRow["target_entity"],
      target_table: targetTable,
      target_field: targetField,
      target_relation_field: relationField,
      target_record_strategy: input.target_record_strategy ?? existingRow["target_record_strategy"],
      mapping_direction: "dms_to_erp",
      mapping_priority: input.mapping_priority ?? existingRow["mapping_priority"],
      is_active: input.is_active ?? existingRow["is_active"],
      allow_apply_to_existing: false, // Phase 8: always false
      requires_confirmation: input.requires_confirmation ?? existingRow["requires_confirmation"],
      requires_target_permission: requiredPermission,
      notes: input.notes !== undefined ? input.notes : existingRow["notes"],
      updated_at: new Date().toISOString(),
    };

    const { error } = await adminClient
      .from("dms_metadata_erp_mappings")
      .update(updatePayload)
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_erp_mappings",
      entity_id: id,
      entity_reference: `${targetTable}.${targetField}`,
      action: "update",
      new_values: { target_table: targetTable, target_field: targetField },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── CRUD — Soft delete ────────────────────────────────────────────────────────

export async function deleteDmsErpMapping(id: number): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!isAdminUser(ctx)) {
      return { success: false, error: "Only DMS admins can delete ERP mapping rules" };
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("dms_metadata_erp_mappings")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_erp_mappings",
      entity_id: id,
      entity_reference: String(id),
      action: "delete",
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Registry info (for admin UI dropdowns) ────────────────────────────────────

export async function getDmsErpMappingTargetRegistry(): Promise<
  ActionResult<ReturnType<typeof listErpMappingTargets>>
> {
  try {
    const ctx = await getAuthContext();
    if (!canViewMappings(ctx)) return { success: false, error: "Insufficient permissions" };
    return { success: true, data: listErpMappingTargets() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Preview action ────────────────────────────────────────────────────────────

/**
 * Read-only ERP mapping preview for a document.
 *
 * Returns a list of DmsErpMappingPreviewRow — one per active mapping rule
 * that applies to this document's type. Each row shows the DMS approved
 * metadata value vs the current ERP field value, and a diff status.
 *
 * Phase 8: read-only, no writes to ERP target records.
 */
export async function getDmsErpMappingPreview(
  documentId: number
): Promise<ActionResult<DmsErpMappingPreviewRow[]>> {
  try {
    // ── 1. Validate + auth ──────────────────────────────────────────────────
    const id = z.number().int().positive().safeParse(documentId);
    if (!id.success) return { success: false, error: "Invalid document ID" };

    const ctx = await getAuthContext();
    if (!canViewMappings(ctx)) {
      return { success: false, error: "Insufficient permissions to view ERP mapping preview" };
    }

    const supabase  = await createClient();
    const adminClient = createAdminClient();

    // ── 2. Load document ────────────────────────────────────────────────────
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_type_id, is_confidential")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found or access denied" };
    const docRow = doc as unknown as Record<string, unknown>;

    // Confidentiality gate — consistent with AI Analysis
    if (docRow["is_confidential"] === true) {
      if (
        !hasPermission(ctx, "dms.admin") &&
        !ctx.roleCodes?.includes("system_admin") &&
        !ctx.roleCodes?.includes("group_admin")
      ) {
        return { success: false, error: "Access denied: document is confidential" };
      }
    }

    const documentTypeId = docRow["document_type_id"] as number | null;
    if (!documentTypeId) {
      return { success: true, data: [] }; // No document type → no mappings possible
    }

    // ── 3. Load active ERP mappings for document type ──────────────────────
    const { data: mappingData, error: mappingErr } = await adminClient
      .from("dms_metadata_erp_mappings")
      .select("*")
      .eq("document_type_id", documentTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("mapping_priority", { ascending: true });

    if (mappingErr) return { success: false, error: mappingErr.message };
    const mappings = ((mappingData ?? []) as unknown as Array<Record<string, unknown>>).map(mapMappingRow);

    if (mappings.length === 0) {
      return { success: true, data: [] };
    }

    // ── 4. Load approved DMS metadata values ──────────────────────────────
    const { data: metaData, error: metaErr } = await supabase
      .from("dms_document_metadata_values")
      .select("definition_id, value_text, value_number, value_date, value_boolean, value_json")
      .eq("document_id", documentId);

    if (metaErr) return { success: false, error: metaErr.message };
    const metaByDef = new Map<number, Record<string, unknown>>();
    for (const mv of (metaData ?? []) as unknown as Array<Record<string, unknown>>) {
      metaByDef.set(mv["definition_id"] as number, mv);
    }

    // ── 5. Load DMS document links ─────────────────────────────────────────
    const { data: linkData, error: linkErr } = await supabase
      .from("dms_document_links")
      .select("id, entity_type, entity_id, is_primary")
      .eq("document_id", documentId)
      .order("is_primary", { ascending: false });

    if (linkErr) return { success: false, error: linkErr.message };
    const links = (linkData ?? []) as unknown as Array<{
      id: number;
      entity_type: string;
      entity_id: number;
      is_primary: boolean;
    }>;

    // ── 6. Load definition labels ──────────────────────────────────────────
    const definitionIds = [...new Set(mappings.map((m) => m.metadata_definition_id))];
    const { data: defData } = await adminClient
      .from("dms_metadata_definitions")
      .select("id, field_code, field_label_en")
      .in("id", definitionIds)
      .is("deleted_at", null);

    const defMap = new Map<number, { field_code: string; field_label_en: string }>();
    for (const d of (defData ?? []) as unknown as Array<Record<string, unknown>>) {
      defMap.set(d["id"] as number, {
        field_code: d["field_code"] as string,
        field_label_en: d["field_label_en"] as string,
      });
    }

    // ── 7. Build preview rows ─────────────────────────────────────────────
    const previewRows: DmsErpMappingPreviewRow[] = [];

    for (const mapping of mappings) {
      const def = defMap.get(mapping.metadata_definition_id);
      const fieldCode  = def?.field_code  ?? `field_${mapping.metadata_definition_id}`;
      const fieldLabel = def?.field_label_en ?? fieldCode;

      // Get DMS approved metadata value
      const metaVal = metaByDef.get(mapping.metadata_definition_id);
      const dmsValue = extractMetadataValueAsString(metaVal);

      // Get target field config
      const fieldMeta = listErpMappingFields(mapping.target_module, mapping.target_table)
        .find((f) => f.column === mapping.target_field);
      const targetFieldLabel = fieldMeta?.label ?? mapping.target_field;

      // Resolve target record via document links
      const linkResult = resolveTargetRecord(
        links,
        mapping.target_record_strategy,
        mapping.target_table,
        mapping.target_relation_field,
        mapping.target_module,
        getErpMappingTargetConfig(mapping.target_module, mapping.target_table)
      );

      if (linkResult.status === "no_link") {
        previewRows.push({
          mappingId: mapping.id,
          metadataDefinitionId: mapping.metadata_definition_id,
          fieldCode,
          fieldLabelEn: fieldLabel,
          dmsValue,
          targetModule: mapping.target_module,
          targetEntity: mapping.target_entity,
          targetTable: mapping.target_table,
          targetField: mapping.target_field,
          targetFieldLabel,
          targetRecordId: null,
          targetRecordLabel: null,
          targetValue: null,
          diffStatus: "no_link",
          requiredPermission: mapping.requires_target_permission,
          warning: "Document is not linked to a matching entity. Link it first to see ERP comparison.",
        });
        continue;
      }

      if (linkResult.status === "ambiguous") {
        previewRows.push({
          mappingId: mapping.id,
          metadataDefinitionId: mapping.metadata_definition_id,
          fieldCode,
          fieldLabelEn: fieldLabel,
          dmsValue,
          targetModule: mapping.target_module,
          targetEntity: mapping.target_entity,
          targetTable: mapping.target_table,
          targetField: mapping.target_field,
          targetFieldLabel,
          targetRecordId: null,
          targetRecordLabel: null,
          targetValue: null,
          diffStatus: "ambiguous",
          requiredPermission: mapping.requires_target_permission,
          warning: `${linkResult.count} matching records found. Phase 9 will require explicit selection.`,
        });
        continue;
      }

      const targetEntityId = linkResult.entityId;

      // Fetch target ERP record value (read-only)
      const erpValueResult = await fetchErpFieldValue(
        adminClient,
        mapping.target_table,
        mapping.target_field,
        mapping.target_record_strategy,
        targetEntityId,
        mapping.target_relation_field
      );

      if (erpValueResult.status === "not_found") {
        previewRows.push({
          mappingId: mapping.id,
          metadataDefinitionId: mapping.metadata_definition_id,
          fieldCode,
          fieldLabelEn: fieldLabel,
          dmsValue,
          targetModule: mapping.target_module,
          targetEntity: mapping.target_entity,
          targetTable: mapping.target_table,
          targetField: mapping.target_field,
          targetFieldLabel,
          targetRecordId: targetEntityId,
          targetRecordLabel: `#${targetEntityId}`,
          targetValue: null,
          diffStatus: "no_target",
          requiredPermission: mapping.requires_target_permission,
          warning: "Target record not found or was deleted.",
        });
        continue;
      }

      const erpValue = erpValueResult.value;
      const targetRecordId = erpValueResult.recordId ?? targetEntityId;

      // Compute diff status
      const diffStatus = computeDiffStatus(dmsValue, erpValue);

      previewRows.push({
        mappingId: mapping.id,
        metadataDefinitionId: mapping.metadata_definition_id,
        fieldCode,
        fieldLabelEn: fieldLabel,
        dmsValue,
        targetModule: mapping.target_module,
        targetEntity: mapping.target_entity,
        targetTable: mapping.target_table,
        targetField: mapping.target_field,
        targetFieldLabel,
        targetRecordId,
        targetRecordLabel: `${mapping.target_table} #${targetRecordId}`,
        targetValue: erpValue,
        diffStatus,
        requiredPermission: mapping.requires_target_permission,
        warning: null,
      });
    }

    return { success: true, data: previewRows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract a string representation from a DMS metadata value row. */
function extractMetadataValueAsString(
  mv: Record<string, unknown> | undefined
): string | null {
  if (!mv) return null;
  if (mv["value_text"] != null && mv["value_text"] !== "") return String(mv["value_text"]);
  if (mv["value_date"] != null) return String(mv["value_date"]);
  if (mv["value_number"] != null) return String(mv["value_number"]);
  if (mv["value_boolean"] != null) return String(mv["value_boolean"]);
  if (mv["value_json"] != null) {
    try { return JSON.stringify(mv["value_json"]).slice(0, 100); } catch { return null; }
  }
  return null;
}

/** Determine the diff status comparing DMS value vs ERP value. */
function computeDiffStatus(
  dmsValue: string | null,
  erpValue: string | null
): DmsErpMappingPreviewRow["diffStatus"] {
  if (dmsValue == null || dmsValue === "") return "no_dms_value";
  if (erpValue == null || erpValue === "") return "new";
  const normalizedDms = dmsValue.trim().toLowerCase();
  const normalizedErp = erpValue.trim().toLowerCase();
  if (normalizedDms === normalizedErp) return "same";
  return "changed";
}

/** Resolve target record entity ID from document links. */
type LinkResolveResult =
  | { status: "found"; entityId: number }
  | { status: "no_link" }
  | { status: "ambiguous"; count: number };

function resolveTargetRecord(
  links: Array<{ id: number; entity_type: string; entity_id: number; is_primary: boolean }>,
  strategy: string,
  targetTable: string,
  _relationField: string,
  targetModule: string,
  config: ErpMappingTargetConfig | null
): LinkResolveResult {
  if (!config) return { status: "no_link" };

  if (strategy === "link_exact") {
    // Look for a link whose entity_type is in config.directEntityTypes
    const matching = links.filter((l) =>
      (config.directEntityTypes as readonly string[]).includes(l.entity_type)
    );
    if (matching.length === 0) return { status: "no_link" };
    if (matching.length === 1) return { status: "found", entityId: matching[0]!.entity_id };
    // Multiple exact links — prefer primary
    const primary = matching.find((l) => l.is_primary);
    if (primary) return { status: "found", entityId: primary.entity_id };
    return { status: "ambiguous", count: matching.length };
  }

  if (strategy === "link_parent") {
    // Look for a link to the parent entity type
    const matching = links.filter((l) => l.entity_type === config.parentEntityType);
    if (matching.length === 0) return { status: "no_link" };
    // With link_parent the entity_id is the parent; we'll fetch child records in fetchErpFieldValue
    const primary = matching.find((l) => l.is_primary) ?? matching[0]!;
    return { status: "found", entityId: primary.entity_id };
  }

  return { status: "no_link" };
}

/** Fetch current value of a specific field from the ERP target table. */
type ErpFetchResult =
  | { status: "found"; value: string | null; recordId: number }
  | { status: "not_found" };

async function fetchErpFieldValue(
  adminClient: ReturnType<typeof createAdminClient>,
  targetTable: string,
  targetField: string,
  strategy: string,
  entityId: number,
  relationField: string
): Promise<ErpFetchResult> {
  try {
    // Safety: only query tables in the allowlist
    const allowedTables = [
      "employee_identity_documents",
      "employee_medical_insurances",
      "party_licenses",
      "party_tax_registrations",
    ];
    if (!allowedTables.includes(targetTable)) {
      return { status: "not_found" };
    }

    if (strategy === "link_exact") {
      // entity_id IS the record id
      const { data, error } = await adminClient
        .from(targetTable as "employee_identity_documents")
        .select(`id, ${targetField}`)
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error || !data) return { status: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      const value = row[targetField];
      return {
        status: "found",
        value: value != null ? String(value) : null,
        recordId: row["id"] as number,
      };
    }

    if (strategy === "link_parent") {
      // entity_id is the parent; find child records
      const { data, error } = await adminClient
        .from(targetTable as "employee_identity_documents")
        .select(`id, ${targetField}`)
        .eq(relationField, entityId)
        .is("deleted_at", null)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return { status: "not_found" };
      const row = data as unknown as Record<string, unknown>;
      const value = row[targetField];
      return {
        status: "found",
        value: value != null ? String(value) : null,
        recordId: row["id"] as number,
      };
    }

    return { status: "not_found" };
  } catch {
    return { status: "not_found" };
  }
}
