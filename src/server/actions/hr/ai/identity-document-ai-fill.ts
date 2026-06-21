"use server";

/**
 * HR Compliance — Prefill legal/identity document fields from a linked DMS document.
 *
 * Uses DMS AI extraction results first; optional HR AI structured completion as fallback.
 * Does not save — caller must confirm and call createEmployeeIdentityDocument.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import {
  HR_AI_FEATURE_FLAGS,
  HrIdentityDocumentPrefillOutputSchema,
  type HrAiActionResult,
  type IdentityDocumentPrefillResult,
} from "@/lib/hr/ai/types";
import { createEmptyIdentityDocumentForm } from "@/lib/hr/compliance/identity-document-form";
import {
  mapDmsTypeCodeToHrIdentityCode,
  mapExtractionToIdentityForm,
  normalizeDateValue,
} from "@/lib/hr/compliance/dms-to-identity-map";

const OCR_SNIPPET_MAX = 6000;

function firstOrSelf<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

async function loadOcrSnippet(db: ReturnType<typeof createAdminClient>, documentId: number): Promise<string | null> {
  const { data: files } = await db
    .from("dms_document_files")
    .select("ocr_text")
    .eq("document_id", documentId)
    .eq("ocr_status", "complete")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(3);

  const parts = (files ?? [])
    .map((f) => (f.ocr_text as string | null)?.trim())
    .filter(Boolean) as string[];

  if (parts.length === 0) {
    const { data: result } = await db
      .from("dms_ai_extraction_results")
      .select("raw_ocr_text")
      .eq("document_id", documentId)
      .neq("ai_status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = (result?.raw_ocr_text as string | null)?.trim();
    if (raw) parts.push(raw);
  }

  if (parts.length === 0) {
    const { data: content } = await db
      .from("dms_document_content")
      .select("content_text")
      .eq("document_id", documentId)
      .maybeSingle();
    const text = (content?.content_text as string | null)?.trim();
    if (text) parts.push(text);
  }

  const combined = parts.join("\n\n");
  return combined ? combined.slice(0, OCR_SNIPPET_MAX) : null;
}

async function runAiIdentityPrefill(params: {
  dmsTypeCode: string | null;
  dmsTypeName: string | null;
  documentTitle: string;
  ocrSnippet: string;
}): Promise<{ fields: Record<string, string | null>; confidence: Record<string, number>; warning: string | null } | null> {
  const systemPrompt = `You are an HR compliance assistant extracting identity document fields from OCR text.
Return JSON only. Dates must be YYYY-MM-DD. document_type_code must be one of: EMIRATES_ID, PASSPORT, RESIDENCE_VISA, LABOUR_CARD, WORK_PERMIT, or null if unknown.
Do not invent values not supported by the text.`;

  const userPrompt = `Document type hint: ${params.dmsTypeName ?? params.dmsTypeCode ?? "Unknown"}
Document title: ${params.documentTitle}

OCR text (truncated):
${params.ocrSnippet}

Return JSON:
{
  "fields": {
    "document_type_code": "string or null",
    "document_number": "string or null",
    "issue_date": "YYYY-MM-DD or null",
    "expiry_date": "YYYY-MM-DD or null",
    "issuing_authority": "string or null",
    "place_of_issue": "string or null",
    "emirates_id_application_no": "string or null",
    "visa_file_number": "string or null",
    "uid_number": "string or null",
    "labour_card_number": "string or null",
    "work_permit_number": "string or null",
    "mohre_person_code": "string or null",
    "profession_on_document": "string or null"
  },
  "field_confidence": { "document_number": 0.0-1.0, ... },
  "warning": "string or null"
}`;

  const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
    maxTokens: 1500,
    temperature: 0,
  });

  if (!outcome.success) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.rawJson);
  } catch {
    return null;
  }

  const validated = HrIdentityDocumentPrefillOutputSchema.safeParse(parsed);
  if (!validated.success) return null;

  const f = validated.data.fields;
  return {
    fields: {
      document_type_code: f.document_type_code ?? null,
      document_number: f.document_number ?? null,
      issue_date: f.issue_date ?? null,
      expiry_date: f.expiry_date ?? null,
      issuing_authority: f.issuing_authority ?? null,
      place_of_issue: f.place_of_issue ?? null,
      emirates_id_application_no: f.emirates_id_application_no ?? null,
      visa_file_number: f.visa_file_number ?? null,
      uid_number: f.uid_number ?? null,
      labour_card_number: f.labour_card_number ?? null,
      work_permit_number: f.work_permit_number ?? null,
      mohre_person_code: f.mohre_person_code ?? null,
      profession_on_document: f.profession_on_document ?? null,
    },
    confidence: validated.data.field_confidence ?? {},
    warning: validated.data.warning ?? null,
  };
}

export async function prefillIdentityDocumentFromDms(
  employeeId: number,
  dmsDocumentId: number
): Promise<HrAiActionResult<IdentityDocumentPrefillResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) return { success: false, error: "Not authenticated." };
    if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin")) {
      return { success: false, error: "Permission denied: hr.compliance.manage required." };
    }
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: dms.documents.view required." };
    }

    const db = createAdminClient();

    const { data: entityLink } = await db
      .from("dms_document_links")
      .select("id")
      .eq("entity_type", "employee")
      .eq("entity_id", employeeId)
      .eq("document_id", dmsDocumentId)
      .is("deleted_at", null)
      .maybeSingle();

    const linkedToEmployee = !!entityLink;

    const { data: doc } = await db
      .from("dms_documents")
      .select(`
        id, document_no, title, issue_date, expiry_date,
        document_type:dms_document_types(type_code, name_en)
      `)
      .eq("id", dmsDocumentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { success: false, error: "DMS document not found." };

    const docType = firstOrSelf(doc.document_type as { type_code: string; name_en: string } | { type_code: string; name_en: string }[] | null);
    const dmsTypeCode = docType?.type_code ?? null;
    const dmsTypeName = docType?.name_en ?? null;

    const { data: existingLink } = await db
      .from("employee_identity_documents")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("dms_document_id", dmsDocumentId)
      .is("deleted_at", null)
      .maybeSingle();

    const { data: hrTypes } = await db
      .from("hr_identity_document_types")
      .select("id, code")
      .eq("is_active", true);

    const hrIdentityTypes = (hrTypes ?? []) as { id: number; code: string }[];

    const { data: extractionRows } = await db
      .from("dms_ai_extraction_results")
      .select(`
        extracted_fields_json, field_confidence_json,
        issue_date_suggestion, expiry_date_suggestion
      `)
      .eq("document_id", dmsDocumentId)
      .neq("ai_status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1);

    const extraction = extractionRows?.[0] ?? null;
    const extractedFields = (extraction?.extracted_fields_json as Record<string, unknown>) ?? {};
    const fieldConfidenceJson = (extraction?.field_confidence_json as Record<string, unknown>) ?? {};

    const mapped = mapExtractionToIdentityForm({
      extractedFields,
      fieldConfidence: fieldConfidenceJson,
      issueDateSuggestion: (extraction?.issue_date_suggestion as string | null) ?? null,
      expiryDateSuggestion: (extraction?.expiry_date_suggestion as string | null) ?? null,
      dmsTypeCode,
      documentIssueDate: (doc.issue_date as string | null) ?? null,
      documentExpiryDate: (doc.expiry_date as string | null) ?? null,
      documentNo: (doc.document_no as string) ?? null,
      hrIdentityTypes,
    });

    let prefillSource: IdentityDocumentPrefillResult["prefillSource"] = extraction
      ? "extraction"
      : "document_metadata";
    let warning: string | null = null;
    const mergedConfidence = { ...mapped.fieldConfidence };

    const base = createEmptyIdentityDocumentForm();
    const merged = { ...base, ...mapped.form, dms_document_id: dmsDocumentId };

    const needsAi =
      !merged.document_number.trim()
      || !merged.document_type_id;

    if (needsAi) {
      const [masterEnabled, fillEnabled] = await Promise.all([
        isHrAiMasterEnabled(),
        isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL),
      ]);
      const canUseAi = hasPermission(ctx, "hr.ai.use") && masterEnabled && fillEnabled;

      if (canUseAi) {
        const ocrSnippet = await loadOcrSnippet(db, dmsDocumentId);
        if (ocrSnippet) {
          const aiResult = await runAiIdentityPrefill({
            dmsTypeCode,
            dmsTypeName,
            documentTitle: (doc.title as string) ?? (doc.document_no as string),
            ocrSnippet,
          });

          if (aiResult) {
            prefillSource = extraction ? "extraction_and_ai" : "ai_only";
            warning = aiResult.warning;

            if (!merged.document_number && aiResult.fields.document_number) {
              merged.document_number = aiResult.fields.document_number;
              if (aiResult.confidence.document_number != null) {
                mergedConfidence.document_number = aiResult.confidence.document_number;
              }
            }

            if (!merged.document_type_id && aiResult.fields.document_type_code) {
              const code = mapDmsTypeCodeToHrIdentityCode(aiResult.fields.document_type_code)
                ?? aiResult.fields.document_type_code.toUpperCase();
              const match = hrIdentityTypes.find((t) => t.code === code);
              if (match) merged.document_type_id = match.id;
            }

            for (const key of [
              "issue_date", "expiry_date",
              "emirates_id_application_no", "visa_file_number", "uid_number",
              "labour_card_number", "work_permit_number", "mohre_person_code", "profession_on_document",
            ] as const) {
              const current = merged[key];
              const aiVal = aiResult.fields[key];
              if ((!current || (typeof current === "string" && !current.trim())) && aiVal) {
                const normalized = key.includes("date") ? normalizeDateValue(aiVal) : aiVal;
                if (normalized) {
                  merged[key] = normalized;
                  if (aiResult.confidence[key] != null) mergedConfidence[key] = aiResult.confidence[key]!;
                }
              }
            }
          } else if (!extraction) {
            warning = "AI prefill could not extract fields. Enter details manually.";
          }
        } else if (!extraction) {
          warning = "No AI extraction or OCR text available. Enter details manually.";
        }
      } else if (!extraction) {
        warning = "No AI extraction found. Enable HR AI or enter details manually.";
      }
    }

    if (!merged.document_type_id && dmsTypeCode) {
      const hrCode = mapDmsTypeCodeToHrIdentityCode(dmsTypeCode);
      if (hrCode) {
        const match = hrIdentityTypes.find((t) => t.code === hrCode);
        if (match) merged.document_type_id = match.id;
      }
    }

    if (existingLink) {
      warning = [
        warning,
        "A legal document record already references this DMS document. Saving will create a second record.",
      ].filter(Boolean).join(" ");
    }

    if (!linkedToEmployee) {
      warning = [
        warning,
        "This document is not on the employee Documents tab yet. It will be linked automatically when you save.",
      ].filter(Boolean).join(" ");
    }

    return {
      success: true,
      data: {
        form: merged,
        fieldConfidence: mergedConfidence,
        sourceDocument: {
          id: dmsDocumentId,
          title: (doc.title as string) ?? "",
          document_no: (doc.document_no as string) ?? "",
          document_type_code: dmsTypeCode,
          document_type_name: dmsTypeName,
        },
        prefillSource,
        warning,
        alreadyLinked: !!existingLink,
        linkedToEmployee,
      },
    };
  } catch {
    return { success: false, error: "Failed to prefill from DMS document." };
  }
}
