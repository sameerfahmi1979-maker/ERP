"use server";

/**
 * DMS AI META.1 — AI-Suggested Metadata Definitions
 * (Refactored under DMS AI META.2 to use the shared ai-definition-builder utility.)
 *
 * Generates AI-suggested metadata field definitions for a given document type.
 * Suggestions are NEVER auto-saved. Admin must review and accept via the dialog.
 *
 * Rules:
 * - AI call via callCommonAiStructuredCompletion only (no direct SDK)
 * - Suggestions validated with Zod before returning to client
 * - field_code normalized + reserved codes excluded
 * - Duplicates against existing DB fields removed
 * - sort_order continues after existing max sort_order
 * - Audit log contains no prompt text, no AI response text, no field values
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import {
  aiSuggestedFieldSchema,
  buildAiDefinitionPrompt,
  deduplicateAndFilterSuggestions,
  assignSortOrders,
  formatReferenceFields,
  extractSuggestionArray,
  type AiSuggestedField,
  type AiDefinitionRefField,
} from "@/lib/dms/metadata/ai-definition-builder";
import { canApproveAiMetadataSuggestions } from "@/lib/dms/metadata/ai-suggestion-permissions";

// NOTE: Do NOT re-export types (even `export type { ... }`) from a "use server"
// file — Next.js's server actions transform can include type-only re-exports in
// the generated action reference manifest, producing a runtime
// "X is not defined" ReferenceError since the type has no runtime value.
// Import `AiSuggestedField` directly from "@/lib/dms/metadata/ai-definition-builder"
// instead.

export type SuggestMetadataDefinitionsResult =
  | {
      success: true;
      suggestions: AiSuggestedField[];
      documentTypeName: string;
      existingCount: number;
      model: string | null;
    }
  | {
      success: false;
      error: string;
      isProviderNotConfigured?: boolean;
    };

export type AiProviderAvailableResult = {
  available: boolean;
  providerName?: string;
};

// ── Main server action ────────────────────────────────────────────────────────

export async function suggestMetadataDefinitions(
  documentTypeId: number
): Promise<SuggestMetadataDefinitionsResult> {
  try {
    // Step 1: Auth — DMS AI META.2 extends this check with the dedicated
    // dms.metadata.ai_suggestions.approve permission; existing META.1 access
    // via dms.documents.manage_types / dms.admin / system_admin / group_admin
    // continues to work unchanged.
    const ctx = await getAuthContext();
    if (!canApproveAiMetadataSuggestions(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    // Step 2: Validate input
    if (!Number.isInteger(documentTypeId) || documentTypeId <= 0) {
      return { success: false, error: "Invalid document type ID" };
    }

    const supabase = await createClient();

    // Step 3: Fetch document type
    const { data: docType, error: docTypeError } = await supabase
      .from("dms_document_types")
      .select("id, type_code, name_en, description")
      .eq("id", documentTypeId)
      .single();

    if (docTypeError || !docType) {
      return { success: false, error: "Document type not found" };
    }

    // Step 4: Fetch existing definitions for this type
    const { data: existingRaw } = await supabase
      .from("dms_metadata_definitions")
      .select("field_code, field_label_en, sort_order")
      .eq("document_type_id", documentTypeId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });

    const existingFields = (existingRaw ?? []) as {
      field_code: string;
      field_label_en: string;
      sort_order: number;
    }[];

    // Step 5: Fetch few-shot reference examples
    const { data: refRaw } = await supabase
      .from("dms_metadata_definitions")
      .select(
        `field_code, field_label_en, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order,
         document_type:dms_document_types!inner(type_code, name_en)`
      )
      .in("document_type.type_code" as string, ["EMIRATES_ID", "PASSPORT_COPY"])
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    // Group reference fields by type
    const refByType = new Map<string, AiDefinitionRefField[]>();
    for (const row of (refRaw ?? []) as unknown as (AiDefinitionRefField & {
      document_type: { type_code: string; name_en: string };
    })[]) {
      const code = row.document_type?.type_code;
      if (!code) continue;
      const list = refByType.get(code) ?? [];
      list.push(row);
      refByType.set(code, list);
    }

    const emiratesIdFields = refByType.get("EMIRATES_ID") ?? [];
    const passportFields = refByType.get("PASSPORT_COPY") ?? [];

    const refExamples: string[] = [];
    if (emiratesIdFields.length > 0) {
      refExamples.push(formatReferenceFields("Emirates ID", emiratesIdFields));
    }
    if (passportFields.length > 0) {
      refExamples.push(formatReferenceFields("Passport Copy", passportFields));
    }

    // Step 6: Build prompts (shared builder)
    const { systemPrompt, userPrompt } = buildAiDefinitionPrompt({
      documentTypeName: docType.name_en,
      documentTypeCode: docType.type_code,
      documentTypeDescription: (docType as { description?: string | null }).description ?? null,
      existingFieldCodes: existingFields.map((f) => f.field_code),
      referenceExamples: refExamples,
    });

    // Step 7: Call AI
    const aiOutcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0,
    });

    if (!aiOutcome.success) {
      return {
        success: false,
        error: aiOutcome.isProviderNotConfigured
          ? "AI provider is not configured. Please configure an AI provider in Administration → Settings → AI Settings."
          : `AI provider call failed. Please try again.`,
        isProviderNotConfigured: aiOutcome.isProviderNotConfigured,
      };
    }

    // Step 8: Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(aiOutcome.rawJson);
    } catch {
      return { success: false, error: "AI returned an invalid response. Please try again." };
    }

    const suggestionArray = extractSuggestionArray(parsed);
    if (!suggestionArray) {
      return { success: false, error: "AI returned an unexpected format. Please try again." };
    }

    // Step 9: Zod validate each item (keep valid items, drop invalid)
    const validatedItems: AiSuggestedField[] = [];
    let droppedCount = 0;

    for (const item of suggestionArray) {
      const result = aiSuggestedFieldSchema.safeParse(item);
      if (result.success) {
        validatedItems.push(result.data as AiSuggestedField);
      } else {
        droppedCount++;
      }
    }

    // Step 10: Normalize field_code + remove reserved + deduplicate (shared logic)
    const existingCodes = new Set(existingFields.map((f) => f.field_code));
    const { safe, droppedCount: dedupDropped } = deduplicateAndFilterSuggestions(
      validatedItems,
      existingCodes
    );
    droppedCount += dedupDropped;

    // Step 11: Assign sort_order (ignore AI's sort_order values) — shared logic
    const maxExistingOrder =
      existingFields.length > 0 ? Math.max(...existingFields.map((f) => f.sort_order ?? 0)) : -1;
    assignSortOrders(safe, maxExistingOrder);

    // Step 12: Audit log (safe payload only — no prompt, no AI response, no field values)
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_definitions",
      entity_id: documentTypeId,
      entity_reference: docType.type_code,
      action: "DMS_AI_METADATA_SUGGESTION_GENERATED",
      new_values: {
        document_type_id: documentTypeId,
        document_type_code: docType.type_code,
        suggestions_returned: safe.length,
        existing_definitions: existingFields.length,
        ai_suggestions_dropped: droppedCount,
        model: aiOutcome.model,
      },
    });

    return {
      success: true,
      suggestions: safe,
      documentTypeName: docType.name_en,
      existingCount: existingFields.length,
      model: aiOutcome.model,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Provider availability check ───────────────────────────────────────────────

export async function checkDmsAiProviderAvailable(): Promise<AiProviderAvailableResult> {
  try {
    const { provider } = await getDmsAiProvider();
    return {
      available: provider.isConfigured(),
      providerName: provider.providerName,
    };
  } catch {
    return { available: false };
  }
}
