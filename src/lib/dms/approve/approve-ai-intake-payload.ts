/**
 * DMS AI Phase 4 — Approve RPC Payload Builder
 *
 * Constructs the JSONB payload for the approve_dms_ai_intake() Postgres RPC.
 * Only IDs, counts, and safe metadata are included — no raw OCR text, prompts,
 * or sensitive extracted field values.
 */

// ── Reminder days ─────────────────────────────────────────────────────────────

export const APPROVE_REMINDER_DAYS = [90, 60, 30, 14, 7, 1] as const;

// ── Metadata value helper ─────────────────────────────────────────────────────

export type MetadataValueInput = {
  definitionId: number;
  fieldType: string;
  rawValue: string;
};

export type MetadataValuePayload = {
  definition_id: number;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_datetime?: string | null;
  value_boolean?: boolean | null;
  value_json?: unknown;
};

export function resolveMetadataPayloadColumns(
  fieldType: string,
  rawValue: string
): Omit<MetadataValuePayload, "definition_id"> {
  switch (fieldType) {
    case "number":
    case "decimal": {
      const num = parseFloat(rawValue);
      return { value_number: isNaN(num) ? null : num };
    }
    case "date":
      return { value_date: rawValue || null };
    case "datetime":
      return { value_datetime: rawValue || null };
    case "boolean":
      return { value_boolean: rawValue === "true" || rawValue === "1" };
    case "json":
      try {
        return { value_json: JSON.parse(rawValue) };
      } catch {
        return { value_json: rawValue };
      }
    default:
      return { value_text: rawValue || null };
  }
}

export function buildMetadataValuePayloads(
  values: MetadataValueInput[]
): MetadataValuePayload[] {
  return values
    .filter((v) => v.rawValue !== null && v.rawValue !== undefined && v.rawValue !== "")
    .map((v) => ({
      definition_id: v.definitionId,
      ...resolveMetadataPayloadColumns(v.fieldType, v.rawValue),
    }));
}

// ── Reminder payload ──────────────────────────────────────────────────────────

export type ReminderPayload = {
  reminder_days_before: number;
  reminder_date: string;
  status: string;
};

export function buildReminderPayloads(expiryDate: string | null): ReminderPayload[] {
  if (!expiryDate) return [];
  const expiry = new Date(expiryDate);
  const now = new Date();
  return APPROVE_REMINDER_DAYS.map((daysBefore) => {
    const reminderDate = new Date(expiry);
    reminderDate.setDate(reminderDate.getDate() - daysBefore);
    return {
      reminder_days_before: daysBefore,
      reminder_date: reminderDate.toISOString().split("T")[0],
      status: reminderDate < now ? "pending" : "pending",
    };
  });
}

// ── Link payload ──────────────────────────────────────────────────────────────

export type LinkInput = {
  entityType: string;
  entityId: number;
  linkRole?: string;
  isPrimary?: boolean;
};

export type LinkPayload = {
  entity_type: string;
  entity_id: number;
  link_role: string;
  is_primary: boolean;
};

export function buildLinkPayloads(links: LinkInput[]): LinkPayload[] {
  return links.map((l) => ({
    entity_type: l.entityType,
    entity_id: l.entityId,
    link_role: l.linkRole ?? "related",
    is_primary: l.isPrimary ?? false,
  }));
}

// ── RPC payload builder ───────────────────────────────────────────────────────

export type ApproveRpcPayload = {
  mode: "single_file_new_document" | "existing_batch_draft";
  upload_session_id: number;
  approve_run_id: number | null;
  ai_result_id: number | null;
  document_id: number;
  document_no: string;
  title: string;
  description: string | null;
  document_type_id: number;
  category_id: number;
  confidentiality_level: string;
  owner_user_id?: number;
  owning_company_id: number | null;
  owning_branch_id: number | null;
  party_id: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  create_file_version: boolean;
  final_storage_bucket: string | null;
  final_storage_path: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string | null;
  version_number: number;
  version_label: string;
  change_notes: string;
  metadata_values: MetadataValuePayload[];
  tag_ids: number[];
  links: LinkPayload[];
  reminders: ReminderPayload[];
};

export function buildApproveRpcPayload(params: {
  mode: "single_file_new_document" | "existing_batch_draft";
  uploadSessionId: number;
  approveRunId: number | null;
  aiResultId: number | null;
  documentId: number;
  documentNo: string;
  title: string;
  description: string | null;
  documentTypeId: number;
  categoryId: number;
  confidentialityLevel: string;
  owningCompanyId: number | null;
  owningBranchId: number | null;
  partyId: number | null;
  issueDate: string | null;
  expiryDate: string | null;
  createFileVersion: boolean;
  finalStorageBucket: string | null;
  finalStoragePath: string | null;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Hash: string | null;
  versionNumber: number;
  metadataValues: MetadataValueInput[];
  tagIds: number[];
  links: LinkInput[];
}): ApproveRpcPayload {
  return {
    mode: params.mode,
    upload_session_id: params.uploadSessionId,
    approve_run_id: params.approveRunId,
    ai_result_id: params.aiResultId,
    document_id: params.documentId,
    document_no: params.documentNo,
    title: params.title,
    description: params.description,
    document_type_id: params.documentTypeId,
    category_id: params.categoryId,
    confidentiality_level: params.confidentialityLevel,
    owning_company_id: params.owningCompanyId,
    owning_branch_id: params.owningBranchId,
    party_id: params.partyId,
    issue_date: params.issueDate,
    expiry_date: params.expiryDate,
    create_file_version: params.createFileVersion,
    final_storage_bucket: params.finalStorageBucket,
    final_storage_path: params.finalStoragePath,
    file_name: params.fileName,
    mime_type: params.mimeType,
    file_size_bytes: params.fileSizeBytes,
    sha256_hash: params.sha256Hash,
    version_number: params.versionNumber,
    version_label: `v${params.versionNumber}`,
    change_notes:
      params.mode === "existing_batch_draft"
        ? "Created from AI batch intake"
        : "Created from AI intake",
    metadata_values: buildMetadataValuePayloads(params.metadataValues),
    tag_ids: params.tagIds,
    links: buildLinkPayloads(params.links),
    reminders: buildReminderPayloads(params.expiryDate),
  };
}
