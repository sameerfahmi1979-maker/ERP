/**
 * Resolves standard DMS file name inputs from intake / document context.
 * Pure resolution — no Supabase; server actions supply DB lookups.
 */

import {
  buildDmsStandardFileName,
  formatOwnerSegment,
  formatVehicleOwnerSegment,
  getExtensionFromFilename,
  resolveDocNoFromDescription,
  resolveDocNoFromFields,
  resolveOwnerFromAiContext,
  sanitizeStandardFileName,
  type AiOwnerHints,
  type BuildDmsStandardFileNameInput,
} from "@/lib/dms/standard-file-name";

export type StandardFileNameResolveContext = {
  typeCode: string;
  requiresExpiryTracking?: boolean;
  expiryDate?: string | null;
  documentNo?: string | null;
  originalFilename: string;
  extractedFields?: Record<string, unknown> | null;
  metadataValues?: Record<string, unknown>;
  ownerName?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  plateNumber?: string | null;
  standardFileNameOverride?: string | null;
  aiOwnerHints?: AiOwnerHints;
};

function mergeFieldMaps(
  extracted?: Record<string, unknown> | null,
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  return { ...(extracted ?? {}), ...(metadata ?? {}) };
}

/** Build metadata field_code map from approve-form metadata array. */
export function metadataValuesToFieldMap(
  metadataValues: Array<{ definitionId: number; rawValue: string }>,
  definitions: Array<{ id: number; field_code: string }>
): Record<string, unknown> {
  const defById = new Map(definitions.map((d) => [d.id, d.field_code]));
  const out: Record<string, unknown> = {};
  for (const v of metadataValues) {
    const code = defById.get(v.definitionId);
    if (code && v.rawValue?.trim()) out[code] = v.rawValue.trim();
  }
  return out;
}

export function resolveStandardFileNameInput(
  ctx: StandardFileNameResolveContext
): BuildDmsStandardFileNameInput {
  const fields = mergeFieldMaps(ctx.extractedFields, ctx.metadataValues);
  const extension = getExtensionFromFilename(ctx.originalFilename);

  let ownerName =
    ctx.ownerName?.trim() ||
    resolveOwnerFromAiContext(fields, ctx.aiOwnerHints) ||
    "Unknown_Owner";

  if (
    !ctx.ownerName &&
    (ctx.entityType === "vehicle" || ctx.entityType === "fleet_asset") &&
    ctx.plateNumber
  ) {
    ownerName = formatVehicleOwnerSegment(ctx.plateNumber);
  } else {
    ownerName = formatOwnerSegment(ownerName);
  }

  let docNo = resolveDocNoFromFields(ctx.typeCode, fields, ctx.documentNo ?? null);
  if (docNo === "DMS-Unknown") {
    const fromDesc = resolveDocNoFromDescription(ctx.aiOwnerHints?.suggestedDescription);
    if (fromDesc) docNo = fromDesc;
  }

  return {
    typeCode: ctx.typeCode,
    ownerName,
    docNo,
    expiryDate: ctx.expiryDate ?? null,
    extension,
    requiresExpiryTracking: ctx.requiresExpiryTracking,
    documentNo: ctx.documentNo ?? null,
  };
}

export function resolveStandardFileName(ctx: StandardFileNameResolveContext): string {
  if (ctx.standardFileNameOverride?.trim()) {
    return sanitizeStandardFileName(ctx.standardFileNameOverride.trim());
  }
  return buildDmsStandardFileName(resolveStandardFileNameInput(ctx));
}
