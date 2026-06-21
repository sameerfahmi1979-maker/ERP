"use server";

/**
 * HR Compliance — Prefill legal/identity document fields from a linked DMS document.
 *
 * Uses DMS AI extraction results first; HR AI structured completion as fallback/enrichment.
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
  extractGeographyAndAuthorityHints,
} from "@/lib/hr/compliance/dms-to-identity-map";
import {
  isInternalDmsDocumentNumber,
  loadDmsOcrSnippet,
  loadLatestDmsExtraction,
} from "@/lib/hr/compliance/compliance-dms-ocr";
import { resolveGeographyFromPlaceNames } from "@/lib/hr/compliance/compliance-geography-resolve";
import { resolveIssuingAuthorityPartyId } from "@/lib/hr/compliance/compliance-party-resolve";

function firstOrSelf<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

function needsAiEnrichment(form: ReturnType<typeof createEmptyIdentityDocumentForm>): boolean {
  if (!form.document_type_id) return true;
  if (!form.document_number.trim()) return true;
  if (isInternalDmsDocumentNumber(form.document_number)) return true;
  if (!form.issue_country_id && !form.issuing_emirate_id) return true;
  return false;
}

async function applyGeographyAndAuthority(
  db: ReturnType<typeof createAdminClient>,
  merged: ReturnType<typeof createEmptyIdentityDocumentForm>,
  hints: {
    placeOfIssue?: string | null;
    countryName?: string | null;
    emirateName?: string | null;
    cityName?: string | null;
    issuingAuthority?: string | null;
  }
): Promise<void> {
  if (!merged.issue_country_id || !merged.issuing_emirate_id || !merged.issue_city_id) {
    const geo = await resolveGeographyFromPlaceNames(db, {
      countryName: hints.countryName,
      emirateName: hints.emirateName,
      cityName: hints.cityName,
      placeOfIssue: hints.placeOfIssue,
    });
    if (!merged.issue_country_id && geo.issue_country_id) merged.issue_country_id = geo.issue_country_id;
    if (!merged.issuing_emirate_id && geo.issuing_emirate_id) merged.issuing_emirate_id = geo.issuing_emirate_id;
    if (!merged.issue_city_id && geo.issue_city_id) merged.issue_city_id = geo.issue_city_id;
  }

  if (!merged.issuing_authority_party_id && hints.issuingAuthority) {
    const partyId = await resolveIssuingAuthorityPartyId(db, hints.issuingAuthority);
    if (partyId) merged.issuing_authority_party_id = partyId;
  }
}

async function runAiIdentityPrefill(params: {
  dmsTypeCode: string | null;
  dmsTypeName: string | null;
  documentTitle: string;
  ocrSnippet: string;
}): Promise<{ fields: Record<string, string | null>; confidence: Record<string, number>; warning: string | null } | null> {
  const systemPrompt = `You are an HR compliance assistant extracting identity document fields from OCR text.
Return JSON only. Dates must be YYYY-MM-DD.
document_type_code must be one of: EMIRATES_ID, PASSPORT, RESIDENCE_VISA, LABOUR_CARD, WORK_PERMIT, DRIVING_LICENSE, CICPA_PASS, HEALTH_CARD, EMPLOYMENT_CONTRACT, or null if unknown.
Do not invent values not supported by the text. Do not use internal DMS reference numbers (DMS-YYYY-NNNNNN) as document_number.`;

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
    "country_name": "string or null",
    "emirate_name": "string or null",
    "city_name": "string or null",
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
    maxTokens: 1800,
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
      country_name: f.country_name ?? null,
      emirate_name: f.emirate_name ?? null,
      city_name: f.city_name ?? null,
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

    const extraction = await loadLatestDmsExtraction(db, dmsDocumentId);
    const extractedFields = extraction?.extracted_fields_json ?? {};
    const fieldConfidenceJson = extraction?.field_confidence_json ?? {};

    const mapped = mapExtractionToIdentityForm({
      extractedFields,
      fieldConfidence: fieldConfidenceJson,
      issueDateSuggestion: extraction?.issue_date_suggestion ?? null,
      expiryDateSuggestion: extraction?.expiry_date_suggestion ?? null,
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

    const geoHints = extractGeographyAndAuthorityHints(extractedFields);
    await applyGeographyAndAuthority(db, merged, geoHints);

    const shouldRunAi = needsAiEnrichment(merged);

    if (shouldRunAi) {
      const [masterEnabled, fillEnabled] = await Promise.all([
        isHrAiMasterEnabled(),
        isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL),
      ]);
      const canUseAi = hasPermission(ctx, "hr.ai.use") && masterEnabled && fillEnabled;

      if (canUseAi) {
        const ocrSnippet = await loadDmsOcrSnippet(db, dmsDocumentId);
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

            const aiDocNo = aiResult.fields.document_number;
            if (
              aiDocNo
              && (!merged.document_number.trim() || isInternalDmsDocumentNumber(merged.document_number))
            ) {
              merged.document_number = aiDocNo;
              if (aiResult.confidence.document_number != null) {
                mergedConfidence.document_number = aiResult.confidence.document_number;
              }
            }

            if (!merged.document_type_id && aiResult.fields.document_type_code) {
              const code = mapDmsTypeCodeToHrIdentityCode(aiResult.fields.document_type_code, hrIdentityTypes)
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

            await applyGeographyAndAuthority(db, merged, {
              placeOfIssue: aiResult.fields.place_of_issue,
              countryName: aiResult.fields.country_name,
              emirateName: aiResult.fields.emirate_name,
              cityName: aiResult.fields.city_name,
              issuingAuthority: aiResult.fields.issuing_authority,
            });
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
      const hrCode = mapDmsTypeCodeToHrIdentityCode(dmsTypeCode, hrIdentityTypes);
      if (hrCode) {
        const match = hrIdentityTypes.find((t) => t.code === hrCode);
        if (match) merged.document_type_id = match.id;
      }
    }

    if (isInternalDmsDocumentNumber(merged.document_number)) {
      merged.document_number = "";
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
