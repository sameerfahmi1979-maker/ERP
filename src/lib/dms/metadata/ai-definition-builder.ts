/**
 * DMS AI META.2 — Shared AI Metadata Definition Suggestion Builder
 *
 * Extracted from META.1 `src/server/actions/dms/ai-metadata-suggestions.ts` so the
 * same suggestion-generation logic can be reused by:
 *   - META.1 manual "Suggest Fields with AI" (Metadata Definitions admin screen)
 *   - META.2 intake review "Suggest Fields with AI" (Flow A)
 *   - META.2 background suggestion queue job (Flow B)
 *
 * Governance rule: AI suggests. Human chooses. System saves only approved items.
 * This module NEVER writes to the database and NEVER calls createDmsMetadataDefinition.
 * It only builds prompts and sanitizes/normalizes AI output into safe suggestion objects.
 */

import { z } from "zod";

// ── Public types ──────────────────────────────────────────────────────────────

export type AiSuggestedField = {
  field_code: string;
  field_label_en: string;
  field_type: "text" | "date" | "number" | "boolean" | "currency";
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string;
  ai_example_values: string[];
  sort_order: number;
  reasoning: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const AI_ALLOWED_FIELD_TYPES = ["text", "date", "number", "boolean", "currency"] as const;

export const RESERVED_FIELD_CODES = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "deleted_at",
  "status",
  "file_path",
  "storage_path",
  "tenant_id",
  "owner_company_id",
  "branch_id",
  "document_type_id",
  "category_id",
  "metadata_json",
  "extracted_text",
  "ai_result",
  "document_no",
  "document_id",
  "sort_order",
  "is_active",
  "is_required",
  "is_ai_extractable",
  "metadata_version",
]);

// ── Zod schema for AI response ────────────────────────────────────────────────

export const aiSuggestedFieldSchema = z.object({
  field_code: z.string().min(1).max(100),
  field_label_en: z.string().min(1).max(255),
  field_type: z.enum(AI_ALLOWED_FIELD_TYPES),
  is_required: z.boolean(),
  is_ai_extractable: z.boolean(),
  ai_field_hint: z.string().max(500).default(""),
  ai_example_values: z.array(z.string().max(200)).max(10).default([]),
  sort_order: z.number().int().min(0).default(0),
  reasoning: z.string().max(500).default(""),
});

export const aiSuggestionResponseSchema = z.array(aiSuggestedFieldSchema).max(30);

// ── Field code normalizers ────────────────────────────────────────────────────

export function splitCamelCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
}

export function normalizeFieldCode(raw: string): string {
  return splitCamelCase(raw)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

// ── Reference example formatter ───────────────────────────────────────────────

export type AiDefinitionRefField = {
  field_code: string;
  field_label_en: string;
  field_type: string;
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string | null;
};

export function formatReferenceFields(typeName: string, fields: AiDefinitionRefField[]): string {
  if (fields.length === 0) return "";
  const rows = fields
    .slice(0, 8)
    .map(
      (f) =>
        `  - ${f.field_code} | "${f.field_label_en}" | ${f.field_type} | required:${f.is_required} | ai:${f.is_ai_extractable}${f.ai_field_hint ? ` | hint: ${f.ai_field_hint.slice(0, 80)}` : ""}`
    )
    .join("\n");
  return `${typeName}:\n${rows}`;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildAiDefinitionPrompt(params: {
  documentTypeName: string;
  documentTypeCode: string;
  documentTypeDescription?: string | null;
  existingFieldCodes: string[];
  referenceExamples: string[];
}): { systemPrompt: string; userPrompt: string } {
  const { documentTypeName, documentTypeCode, documentTypeDescription, existingFieldCodes, referenceExamples } =
    params;

  const systemPrompt = `You are a document management metadata expert for an enterprise ERP system.
Your task is to suggest structured metadata fields for a document type.
Metadata fields describe the key data points that can be tracked, searched, and extracted from documents of this type.

Rules:
- Return ONLY a valid JSON object of the exact shape { "fields": [ ... ] }. No explanation, no markdown, no text before or after the object.
- The "fields" array must contain 6 to 15 metadata field objects.
- Use ONLY these field_type values: text, date, number, boolean, currency
- field_code must be snake_case (lowercase letters, numbers, underscores only)
- Focus on fields that are visible on the physical or digital document
- Do NOT suggest internal/system fields

Reserved field codes you must NEVER suggest:
id, created_at, updated_at, created_by, updated_by, deleted_at, status,
file_path, storage_path, tenant_id, owner_company_id, branch_id, document_type_id,
category_id, metadata_json, extracted_text, ai_result, document_no, document_id,
sort_order, is_active, is_required, is_ai_extractable, metadata_version`;

  const existingCodesList = existingFieldCodes.length > 0 ? existingFieldCodes.join(", ") : "none";

  const refSection =
    referenceExamples.length > 0
      ? `Reference examples from well-defined document types:\n${referenceExamples.join("\n\n")}`
      : "No reference examples available.";

  const userPrompt = `Suggest metadata fields for this document type.

Document Type: ${documentTypeName}
Code: ${documentTypeCode}${documentTypeDescription ? `\nDescription: ${documentTypeDescription}` : ""}

This document type already has these fields — do NOT suggest them:
${existingCodesList}

${refSection}

Suggest 6–15 important metadata fields focused on:
1. Identifiers and reference numbers
2. Issue/expiry/start/end dates
3. Parties, holder names, and issuing authorities
4. Financial amounts (if this is a financial document)
5. Status and classification fields visible on the document

Allowed field_type values: text, date, number, boolean, currency

Return ONLY a valid JSON object with this exact structure:
{
  "fields": [
    {
      "field_code": "holder_name",
      "field_label_en": "Holder Name",
      "field_type": "text",
      "is_required": true,
      "is_ai_extractable": true,
      "ai_field_hint": "Extract the full name of the document holder",
      "ai_example_values": ["John Smith", "Ahmed Al Rashid"],
      "sort_order": 0,
      "reasoning": "Primary identifier for the person the document belongs to"
    }
  ]
}`;

  return { systemPrompt, userPrompt };
}

// ── AI response array extraction ──────────────────────────────────────────────

/**
 * The shared AI provider adapter always calls the OpenAI-compatible chat
 * completions API with `response_format: { type: "json_object" }`, which
 * requires the model to return a JSON *object* at the root — it cannot return
 * a bare JSON array. The prompt above asks for `{ "fields": [...] }`, but this
 * helper stays defensive and also accepts a few other common wrapper keys (or
 * a bare array, in case a future/alternate provider adapter ever supports
 * array-mode responses) so suggestion generation never fails purely due to a
 * harmless shape variation from the model.
 */
export function extractSuggestionArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const knownKeys = ["fields", "suggestions", "metadata_fields", "items", "data"];
    for (const key of knownKeys) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // Fallback: a single-key object whose only value is an array.
    const keys = Object.keys(obj);
    if (keys.length === 1 && Array.isArray(obj[keys[0]])) {
      return obj[keys[0]] as unknown[];
    }
  }

  return null;
}

// ── Dedup + filter ────────────────────────────────────────────────────────────

/**
 * Normalizes field_code for every candidate, then drops:
 *   - items whose normalized code is empty or invalid
 *   - reserved system field codes
 *   - codes that already exist on the document type
 *   - intra-batch duplicate codes (keeps first occurrence)
 *
 * Never mutates the input array.
 */
export function deduplicateAndFilterSuggestions(
  items: AiSuggestedField[],
  existingCodes: Set<string>
): { safe: AiSuggestedField[]; droppedCount: number } {
  const seenCodes = new Set<string>();
  const safe: AiSuggestedField[] = [];
  let droppedCount = 0;

  for (const item of items) {
    const normalized = normalizeFieldCode(item.field_code);

    if (!normalized || !/^[a-z0-9_]+$/.test(normalized)) {
      droppedCount++;
      continue;
    }
    if (RESERVED_FIELD_CODES.has(normalized)) {
      droppedCount++;
      continue;
    }
    if (existingCodes.has(normalized)) {
      droppedCount++;
      continue;
    }
    if (seenCodes.has(normalized)) {
      droppedCount++;
      continue;
    }

    seenCodes.add(normalized);
    safe.push({ ...item, field_code: normalized });
  }

  return { safe, droppedCount };
}

// ── Sort order assignment ─────────────────────────────────────────────────────

/**
 * Reassigns sort_order on the given array (mutates in place), ignoring
 * whatever sort_order the AI returned. Continues numbering after the
 * highest existing sort_order for the document type, in steps of 10.
 */
export function assignSortOrders(items: AiSuggestedField[], maxExistingOrder: number): void {
  const base = maxExistingOrder < 0 ? 0 : Math.ceil((maxExistingOrder + 10) / 10) * 10;
  items.forEach((s, idx) => {
    s.sort_order = base + idx * 10;
  });
}
