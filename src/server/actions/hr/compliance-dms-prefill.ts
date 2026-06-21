"use server";

/**
 * HR Compliance — AI-enriched prefill for non-identity compliance records from DMS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { isHrAiMasterEnabled, isHrAiFeatureEnabled } from "@/lib/hr/ai/feature-flags";
import { HR_AI_FEATURE_FLAGS, HrMedicalInsurancePrefillOutputSchema, HrDependentPrefillOutputSchema } from "@/lib/hr/ai/types";
import type {
  ComplianceDmsPrefillResult,
  ComplianceDmsRecordKind,
} from "@/lib/hr/compliance/compliance-dms-prefill";
import {
  pickStringField,
  normalizeDateValue,
} from "@/lib/hr/compliance/dms-to-identity-map";
import {
  isInternalDmsDocumentNumber,
  loadDmsOcrSnippet,
  loadLatestDmsExtraction,
} from "@/lib/hr/compliance/compliance-dms-ocr";
import {
  extractMedicalInsuranceHintsFromOcr,
  mapExtractionToMedicalInsuranceFields,
  mapMetadataToMedicalInsuranceFields,
  mergeMedicalInsuranceFields,
  normalizeMedicalInsuranceAiFields,
  type MedicalInsurancePrefillFields,
} from "@/lib/hr/compliance/medical-insurance-dms-map";
import {
  DEPENDENT_DMS_TYPE_CODES,
  EMPTY_DEPENDENT_PREFILL,
  dependentPrefillToFormFields,
  extractPersonNameFromDependentFields,
  mapFieldsToDependentByTypeCode,
  mergeDependentFields,
  type DependentPrefillFields,
} from "@/lib/hr/compliance/dependent-dms-map";
import { resolveNationalityIdFromName } from "@/lib/hr/compliance/compliance-geography-resolve";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

function firstOrSelf<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

function mapMetadataFields(
  kind: ComplianceDmsRecordKind,
  doc: { title: string | null; document_no: string | null; issue_date: string | null; expiry_date: string | null }
): Record<string, string | number | boolean | null> {
  const issueDate = normalizeDateValue(doc.issue_date);
  const expiryDate = normalizeDateValue(doc.expiry_date);
  const docNo = doc.document_no?.trim() || null;
  const title = doc.title?.trim() || null;
  const safeDocNo = docNo && !isInternalDmsDocumentNumber(docNo) ? docNo : null;

  switch (kind) {
    case "medical_insurance":
      return mapMetadataToMedicalInsuranceFields({
        title: doc.title,
        document_no: doc.document_no,
        issue_date: doc.issue_date,
        expiry_date: doc.expiry_date,
      }) as unknown as Record<string, string | number | boolean | null>;
    case "dependent":
      return { dependent_name_en: title, passport_expiry: expiryDate };
    case "access_card":
      return { issue_date: issueDate, expiry_date: expiryDate, client_authority: title };
    case "training_certificate":
      return { issue_date: issueDate, expiry_date: expiryDate, provider: title };
    case "medical_record":
      return { examination_date: issueDate ?? expiryDate, expiry_date: expiryDate, medical_center: title };
    default:
      return {};
  }
}

function mapExtractionFieldsForKind(
  kind: ComplianceDmsRecordKind,
  extracted: Record<string, unknown>
): { fields: Record<string, string | null>; confidence: Record<string, number> } {
  const fields: Record<string, string | null> = {};
  const confidence: Record<string, number> = {};

  const set = (formKey: string, value: string | null, confKey?: string) => {
    if (!value) return;
    fields[formKey] = value;
    const c = extracted[`__conf_${formKey}`];
    void c;
  };

  switch (kind) {
    case "medical_insurance": {
      const mapped = mapExtractionToMedicalInsuranceFields(extracted, {
        issueDateSuggestion: typeof extracted.issue_date === "string" ? extracted.issue_date : null,
        expiryDateSuggestion: typeof extracted.expiry_date === "string" ? extracted.expiry_date : null,
      });
      Object.assign(fields, mapped);
      break;
    }
    case "dependent":
      set("dependent_name_en", pickStringField(extracted, ["full_name", "dependent_name", "name", "holder_name"]));
      set("passport_number", pickStringField(extracted, ["passport_number", "passport_no"]));
      set("emirates_id_number", pickStringField(extracted, ["emirates_id_number", "emirates_id", "eid_number"]));
      set("date_of_birth", normalizeDateValue(pickStringField(extracted, ["date_of_birth", "dob"])));
      set("passport_expiry", normalizeDateValue(pickStringField(extracted, ["passport_expiry", "expiry_date"])));
      set("emirates_id_expiry", normalizeDateValue(pickStringField(extracted, ["emirates_id_expiry"])));
      set("residence_visa_number", pickStringField(extracted, ["visa_number", "residence_visa_number"]));
      set("residence_visa_expiry", normalizeDateValue(pickStringField(extracted, ["visa_expiry", "residence_visa_expiry"])));
      break;
    case "access_card":
      set("card_number", pickStringField(extracted, ["card_number", "pass_number", "badge_number", "license_number"]));
      set("application_reference", pickStringField(extracted, ["application_reference", "reference_number", "file_number"]));
      set("client_authority", pickStringField(extracted, ["client_authority", "authority", "issuer", "issuing_authority"]));
      set("access_level", pickStringField(extracted, ["access_level", "level", "zone"]));
      set("issue_date", normalizeDateValue(pickStringField(extracted, ["issue_date", "date_of_issue"])));
      set("expiry_date", normalizeDateValue(pickStringField(extracted, ["expiry_date", "expiration_date"])));
      break;
    case "training_certificate":
      set("certificate_number", pickStringField(extracted, ["certificate_number", "cert_number", "license_number", "reference_number"]));
      set("provider", pickStringField(extracted, ["provider", "training_provider", "institution", "issuer"]));
      set("approval_body", pickStringField(extracted, ["approval_body", "accreditation_body", "authority"]));
      set("issue_date", normalizeDateValue(pickStringField(extracted, ["issue_date", "date_of_issue"])));
      set("expiry_date", normalizeDateValue(pickStringField(extracted, ["expiry_date", "expiration_date", "valid_until"])));
      break;
    case "medical_record":
      set("report_number", pickStringField(extracted, ["report_number", "reference_number", "certificate_number"]));
      set("medical_center", pickStringField(extracted, ["medical_center", "hospital", "clinic", "facility"]));
      set("examination_date", normalizeDateValue(pickStringField(extracted, ["examination_date", "test_date", "issue_date", "date_of_exam"])));
      set("expiry_date", normalizeDateValue(pickStringField(extracted, ["expiry_date", "valid_until"])));
      set("result", pickStringField(extracted, ["result", "fitness_result", "medical_result"]));
      break;
  }

  void confidence;
  return { fields, confidence };
}

const AI_PROMPTS: Record<ComplianceDmsRecordKind, string> = {
  medical_insurance: `Extract UAE medical / health insurance card or policy fields from the OCR text.
Common insurers: Daman, NAS, NextCare, Oman Insurance, Orient, ADNIC, Sukoon, Daman Thiqa, Saada, etc.
Common TPAs: NAS, NextCare, Mednet, Neuron, Aafiya, FMC Network.
network_class examples: Gold, Silver, Bronze, Platinum, Basic, Enhanced, VIP, Network GN/RN/CN, Category A/B/C.

CRITICAL — use these EXACT JSON field names (do not use card_number, member_id, network, plan, or category):
- insurance_card_number = member/card/membership/subscriber ID on the health card (NOT policy number; NOT Emirates ID unless labeled as member/card id)
- network_class = plan tier / network / category on the card (e.g. Gold, Silver, Category A, Network GN)

Dates must be YYYY-MM-DD. Do not use internal DMS numbers (DMS-YYYY-NNNNNN) as policy_number.
Return JSON:
{
  "fields": {
    "insurance_provider": "insurance company name or null",
    "tpa": "third party administrator or null",
    "policy_number": "group or individual policy number or null",
    "insurance_card_number": "member/card/membership ID or null",
    "network_class": "plan/network tier or null",
    "issue_date": "YYYY-MM-DD or null",
    "expiry_date": "YYYY-MM-DD or null",
    "employee_covered": true/false or null,
    "dependent_coverage_included": true/false or null,
    "dependent_count_covered": number or null,
    "notes": "member name or other useful text or null"
  },
  "field_confidence": { "insurance_card_number": 0.0-1.0, "network_class": 0.0-1.0, ... },
  "warning": "string or null"
}`,
  dependent: `Extract dependent / family member identity and compliance fields from UAE passport, Emirates ID, visa, or insurance OCR text.
Use EXACT JSON field names below. Dates must be YYYY-MM-DD. Do not use internal DMS numbers (DMS-YYYY-NNNNNN) as passport or visa numbers.

Return JSON:
{
  "fields": {
    "dependent_name_en": "full name in English or null",
    "dependent_name_ar": "full name in Arabic or null",
    "date_of_birth": "YYYY-MM-DD or null",
    "nationality_name": "nationality country name or null",
    "passport_number": "passport number or null",
    "passport_expiry": "YYYY-MM-DD or null",
    "emirates_id_number": "784-XXXX-XXXXXXX-X format or null",
    "emirates_id_expiry": "YYYY-MM-DD or null",
    "residence_visa_number": "visa file / UID / visa number or null",
    "residence_visa_expiry": "YYYY-MM-DD or null",
    "medical_insurance_provider": "insurer name or null",
    "medical_insurance_policy": "policy number or null",
    "medical_insurance_card": "member/card number or null",
    "medical_insurance_expiry": "YYYY-MM-DD or null",
    "sponsored_by": "employee or company if clearly stated, else null",
    "notes": "sponsor name or other useful text or null"
  },
  "field_confidence": { "dependent_name_en": 0.0-1.0, ... },
  "warning": "string or null"
}`,
  access_card: `Extract access card / pass fields. Return JSON: { "fields": { "card_number", "application_reference", "client_authority", "access_level", "issue_date", "expiry_date" }, "field_confidence": {}, "warning": null }`,
  training_certificate: `Extract training certificate fields. Return JSON: { "fields": { "certificate_number", "provider", "approval_body", "issue_date", "expiry_date" }, "field_confidence": {}, "warning": null }`,
  medical_record: `Extract medical examination fields. result must be one of: fit, unfit, conditionally_fit, under_review. Return JSON: { "fields": { "report_number", "medical_center", "examination_date", "expiry_date", "result" }, "field_confidence": {}, "warning": null }`,
};

async function loadDmsMetadataFieldMap(
  admin: ReturnType<typeof createAdminClient>,
  documentId: number
): Promise<Record<string, unknown>> {
  const { data: rows } = await admin
    .from("dms_document_metadata_values")
    .select(`
      value_text, value_number, value_date, value_boolean,
      definition:dms_metadata_definitions(field_code)
    `)
    .eq("document_id", documentId);

  const out: Record<string, unknown> = {};
  for (const row of rows ?? []) {
    const def = firstOrSelf(row.definition as { field_code: string } | { field_code: string }[] | null);
    const code = def?.field_code;
    if (!code) continue;
    if (row.value_text != null && String(row.value_text).trim()) {
      out[code] = row.value_text;
    } else if (row.value_date != null) {
      out[code] = row.value_date;
    } else if (row.value_number != null) {
      out[code] = row.value_number;
    } else if (row.value_boolean != null) {
      out[code] = row.value_boolean;
    }
  }
  return out;
}

type AiPrefillResult = {
  fields: Record<string, string | number | boolean | null>;
  confidence: Record<string, number>;
  warning: string | null;
};

async function runComplianceAiPrefill(
  kind: ComplianceDmsRecordKind,
  params: { dmsTypeName: string | null; documentTitle: string; ocrSnippet: string }
): Promise<AiPrefillResult | null> {
  const systemPrompt = `You are an HR compliance assistant. Extract structured fields from OCR text for a ${kind.replace(/_/g, " ")} record. Dates YYYY-MM-DD. Do not use DMS internal numbers (DMS-YYYY-NNNNNN). Return JSON only.`;
  const userPrompt = `${AI_PROMPTS[kind]}

Document type: ${params.dmsTypeName ?? "Unknown"}
Title: ${params.documentTitle}

OCR:
${params.ocrSnippet}`;

  const maxTokens = kind === "medical_insurance" || kind === "dependent" ? 2000 : 1200;
  const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
    maxTokens,
    temperature: 0,
  });
  if (!outcome.success) return null;

  try {
    const parsed = JSON.parse(outcome.rawJson) as {
      fields?: Record<string, unknown>;
      field_confidence?: Record<string, number>;
      warning?: string | null;
    };

    if (kind === "medical_insurance") {
      const normalizedRaw = normalizeMedicalInsuranceAiFields(parsed.fields);
      const validated = HrMedicalInsurancePrefillOutputSchema.safeParse({
        fields: normalizedRaw,
        field_confidence: parsed.field_confidence,
        warning: parsed.warning,
      });

      const f = validated.success
        ? validated.data.fields
        : mapExtractionToMedicalInsuranceFields(normalizedRaw);

      const normalized: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(f)) {
        if (value == null || value === "") continue;
        if (key === "issue_date" || key === "expiry_date") {
          const d = normalizeDateValue(value);
          if (d) normalized[key] = d;
        } else if (key === "policy_number" || key === "insurance_card_number") {
          const s = String(value).trim();
          if (s && !isInternalDmsDocumentNumber(s)) normalized[key] = s;
        } else {
          normalized[key] = value as string | number | boolean;
        }
      }
      return {
        fields: normalized,
        confidence: validated.success
          ? (validated.data.field_confidence ?? {})
          : (parsed.field_confidence ?? {}),
        warning: validated.success
          ? (validated.data.warning ?? null)
          : (typeof parsed.warning === "string" ? parsed.warning : null),
      };
    }

    if (kind === "dependent") {
      const validated = HrDependentPrefillOutputSchema.safeParse({
        fields: parsed.fields,
        field_confidence: parsed.field_confidence,
        warning: parsed.warning,
      });
      const normalized: Record<string, string | number | boolean | null> = {};
      const f = validated.success ? validated.data.fields : (parsed.fields ?? {});
      for (const [key, value] of Object.entries(f)) {
        if (value == null || value === "") continue;
        if (key.includes("expiry") || key === "date_of_birth") {
          const d = normalizeDateValue(value);
          if (d) normalized[key] = d;
        } else if (key.includes("number") || key.includes("_card") || key.includes("_policy")) {
          const s = String(value).trim();
          if (s && !isInternalDmsDocumentNumber(s)) normalized[key] = s;
        } else {
          normalized[key] = String(value);
        }
      }
      return {
        fields: normalized,
        confidence: validated.success
          ? (validated.data.field_confidence ?? {})
          : (parsed.field_confidence ?? {}),
        warning: validated.success
          ? (validated.data.warning ?? null)
          : (typeof parsed.warning === "string" ? parsed.warning : null),
      };
    }

    const stringFields: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(parsed.fields ?? {})) {
      if (value == null || value === "") continue;
      stringFields[key] = String(value);
    }
    return {
      fields: stringFields,
      confidence: parsed.field_confidence ?? {},
      warning: parsed.warning ?? null,
    };
  } catch {
    return null;
  }
}

function mergeFieldMaps(
  base: Record<string, string | number | boolean | null>,
  overlay: Record<string, string | number | boolean | null>,
  onlyEmpty = true
): Record<string, string | number | boolean | null> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value == null || value === "") continue;
    const current = merged[key];
    if (!onlyEmpty || current == null || current === "") {
      merged[key] = value;
    }
  }
  return merged;
}

async function prefillMedicalInsuranceFromDms(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  params: {
    employeeId: number;
    dmsDocumentId: number;
    doc: {
      title: string | null;
      document_no: string | null;
      issue_date: string | null;
      expiry_date: string | null;
    };
    docType: { type_code: string; name_en: string } | null;
    existingLink: boolean;
  }
): Promise<ActionResult<ComplianceDmsPrefillResult>> {
  const docContext = {
    documentTitle: params.doc.title,
    documentNo: params.doc.document_no,
  };

  let merged = mapMetadataToMedicalInsuranceFields({
    title: params.doc.title,
    document_no: params.doc.document_no,
    issue_date: params.doc.issue_date,
    expiry_date: params.doc.expiry_date,
  });

  let prefillSource: ComplianceDmsPrefillResult["prefillSource"] = "dms_metadata";
  let warning: string | null = null;
  let fieldConfidence: Record<string, number> = {};

  const metadataFields = await loadDmsMetadataFieldMap(admin, params.dmsDocumentId);
  if (Object.keys(metadataFields).length > 0) {
    merged = mergeMedicalInsuranceFields(
      merged,
      mapExtractionToMedicalInsuranceFields(normalizeMedicalInsuranceAiFields(metadataFields), {
        documentNo: params.doc.document_no,
      }),
      { onlyEmpty: false, context: docContext }
    );
    prefillSource = "extraction";
  }

  const extraction = await loadLatestDmsExtraction(admin, params.dmsDocumentId);
  if (extraction) {
    merged = mergeMedicalInsuranceFields(
      merged,
      mapExtractionToMedicalInsuranceFields(
        normalizeMedicalInsuranceAiFields({
          ...extraction.extracted_fields_json,
          issue_date: extraction.issue_date_suggestion ?? extraction.extracted_fields_json.issue_date,
          expiry_date: extraction.expiry_date_suggestion ?? extraction.extracted_fields_json.expiry_date,
        }),
        { documentNo: params.doc.document_no }
      ),
      { onlyEmpty: false, context: docContext }
    );
    prefillSource = "extraction";
  }

  const [masterEnabled, fillEnabled] = await Promise.all([
    isHrAiMasterEnabled(),
    isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL),
  ]);
  const canUseAi = hasPermission(ctx, "hr.ai.use") && masterEnabled && fillEnabled;

  if (canUseAi) {
    const ocrSnippet = await loadDmsOcrSnippet(admin, params.dmsDocumentId);
    if (ocrSnippet) {
      merged = mergeMedicalInsuranceFields(
        merged,
        extractMedicalInsuranceHintsFromOcr(ocrSnippet, merged),
        { onlyEmpty: true, context: docContext }
      );

      const aiResult = await runComplianceAiPrefill("medical_insurance", {
        dmsTypeName: params.docType?.name_en ?? null,
        documentTitle: params.doc.title ?? params.doc.document_no ?? "Medical Insurance",
        ocrSnippet,
      });
      if (aiResult) {
        merged = mergeMedicalInsuranceFields(
          merged,
          aiResult.fields as Partial<MedicalInsurancePrefillFields>,
          {
            onlyEmpty: true,
            allowOverrideWeak: true,
            context: docContext,
          }
        );
        fieldConfidence = { ...fieldConfidence, ...aiResult.confidence };
        prefillSource = extraction || Object.keys(metadataFields).length > 0 ? "extraction_and_ai" : "ai_only";
        warning = aiResult.warning;
      } else if (!extraction && Object.keys(metadataFields).length === 0) {
        warning = "AI prefill could not extract fields from the card. Enter details manually.";
      }

      merged = mergeMedicalInsuranceFields(
        merged,
        extractMedicalInsuranceHintsFromOcr(ocrSnippet, merged),
        { onlyEmpty: true, context: docContext }
      );
    } else if (!extraction && Object.keys(metadataFields).length === 0) {
      warning = "No OCR text available for AI prefill. Run DMS OCR on the file or enter details manually.";
    }
  } else if (!extraction && Object.keys(metadataFields).length === 0) {
    warning = "No extraction data found. Enable HR AI or enter details manually.";
  }

  if (isInternalDmsDocumentNumber(merged.policy_number)) {
    merged.policy_number = "";
  }

  if (!params.existingLink) {
    warning = [
      warning,
      "This document is not on the employee Documents tab yet — it will be linked when you save.",
    ].filter(Boolean).join(" ");
  }

  return {
    success: true,
    data: {
      dms_document_id: params.dmsDocumentId,
      linkedToEmployee: params.existingLink,
      sourceDocument: {
        title: params.doc.title ?? "",
        document_no: params.doc.document_no ?? "",
      },
      prefillSource,
      warning,
      fields: merged as unknown as Record<string, string | number | boolean | null>,
      fieldConfidence,
    },
  };
}

const PERSON_NAME_METADATA_FIELDS = [
  "full_name_en",
  "full_name",
  "visa_holder_name",
  "member_name",
  "holder_name",
  "dependent_name",
];

type RelatedDependentDoc = {
  id: number;
  document_no: string;
  title: string;
  expiry_date: string | null;
  type_code: string;
  type_name: string;
};

function nameMatchesDocument(personName: string, doc: { title: string | null; document_no: string }): boolean {
  const normalized = personName.trim().toLowerCase();
  if (normalized.length < 3) return false;
  const title = (doc.title ?? "").toLowerCase();
  if (title.includes(normalized)) return true;
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length >= 2) {
    return tokens.every((t) => title.includes(t));
  }
  return false;
}

async function searchRelatedDependentDocuments(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: number,
  personName: string,
  excludeDocumentId: number
): Promise<RelatedDependentDoc[]> {
  const searchName = personName.trim();
  if (searchName.length < 2) return [];

  const found = new Map<number, RelatedDependentDoc>();

  const { data: linkedRows } = await admin
    .from("dms_document_links")
    .select(`
      document_id,
      document:dms_documents!inner(
        id, title, document_no, expiry_date, deleted_at,
        document_type:dms_document_types(type_code, name_en)
      )
    `)
    .eq("entity_type", "employee")
    .eq("entity_id", employeeId)
    .is("deleted_at", null);

  for (const row of linkedRows ?? []) {
    type LinkedDocRow = {
      id: number;
      title: string;
      document_no: string;
      expiry_date: string | null;
      deleted_at: string | null;
      document_type: { type_code: string; name_en: string } | { type_code: string; name_en: string }[] | null;
    };
    const doc = firstOrSelf(row.document as LinkedDocRow | LinkedDocRow[] | null);
    if (!doc || doc.deleted_at) continue;
    const dt = firstOrSelf(doc.document_type);
    const typeCode = dt?.type_code ?? "";
    if (!DEPENDENT_DMS_TYPE_CODES.includes(typeCode as typeof DEPENDENT_DMS_TYPE_CODES[number])) continue;
    if (doc.id === excludeDocumentId) continue;
    if (!nameMatchesDocument(searchName, doc)) continue;
    found.set(doc.id, {
      id: doc.id,
      document_no: doc.document_no,
      title: doc.title,
      expiry_date: doc.expiry_date,
      type_code: typeCode,
      type_name: dt?.name_en ?? typeCode,
    });
  }

  const ilike = `%${searchName.replace(/[%_]/g, "")}%`;
  const { data: metaRows } = await admin
    .from("dms_document_metadata_values")
    .select(`
      document_id,
      value_text,
      definition:dms_metadata_definitions(field_code)
    `)
    .ilike("value_text", ilike)
    .is("deleted_at", null)
    .limit(60);

  const metaDocIds = new Set<number>();
  for (const row of metaRows ?? []) {
    const def = firstOrSelf(row.definition as { field_code: string } | { field_code: string }[] | null);
    if (!def || !PERSON_NAME_METADATA_FIELDS.includes(def.field_code)) continue;
    metaDocIds.add(row.document_id as number);
  }

  if (metaDocIds.size > 0) {
    const { data: metaDocs } = await admin
      .from("dms_documents")
      .select(`
        id, title, document_no, expiry_date,
        document_type:dms_document_types(type_code, name_en)
      `)
      .in("id", Array.from(metaDocIds))
      .is("deleted_at", null);

    for (const doc of metaDocs ?? []) {
      if (doc.id === excludeDocumentId) continue;
      const dt = firstOrSelf(doc.document_type as { type_code: string; name_en: string } | { type_code: string; name_en: string }[] | null);
      const typeCode = dt?.type_code ?? "";
      if (!DEPENDENT_DMS_TYPE_CODES.includes(typeCode as typeof DEPENDENT_DMS_TYPE_CODES[number])) continue;
      found.set(doc.id as number, {
        id: doc.id as number,
        document_no: doc.document_no as string,
        title: doc.title as string,
        expiry_date: doc.expiry_date as string | null,
        type_code: typeCode,
        type_name: dt?.name_en ?? typeCode,
      });
    }
  }

  const { data: dependentTypes } = await admin
    .from("dms_document_types")
    .select("id, type_code, name_en")
    .in("type_code", [...DEPENDENT_DMS_TYPE_CODES]);

  const typeIds = (dependentTypes ?? []).map((t) => t.id as number);
  const typeById = new Map(
    (dependentTypes ?? []).map((t) => [t.id as number, { type_code: t.type_code as string, name_en: t.name_en as string }])
  );

  if (typeIds.length > 0) {
    const { data: titleRows } = await admin
      .from("dms_documents")
      .select("id, title, document_no, expiry_date, document_type_id")
      .in("document_type_id", typeIds)
      .ilike("title", ilike)
      .is("deleted_at", null)
      .limit(20);

    for (const doc of titleRows ?? []) {
      if (doc.id === excludeDocumentId) continue;
      const dt = typeById.get(doc.document_type_id as number);
      if (!dt) continue;
      found.set(doc.id as number, {
        id: doc.id as number,
        document_no: doc.document_no as string,
        title: doc.title as string,
        expiry_date: doc.expiry_date as string | null,
        type_code: dt.type_code,
        type_name: dt.name_en,
      });
    }
  }

  return Array.from(found.values());
}

async function prefillSingleDependentDocument(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  params: {
    dmsDocumentId: number;
    doc: {
      title: string | null;
      document_no: string | null;
      issue_date: string | null;
      expiry_date: string | null;
    };
    docType: { type_code: string; name_en: string } | null;
    runAi: boolean;
  }
): Promise<{ fields: DependentPrefillFields; fieldConfidence: Record<string, number>; usedAi: boolean }> {
  let merged: DependentPrefillFields = { ...EMPTY_DEPENDENT_PREFILL };
  let fieldConfidence: Record<string, number> = {};
  let usedAi = false;

  const metadataFields = await loadDmsMetadataFieldMap(admin, params.dmsDocumentId);
  if (Object.keys(metadataFields).length > 0) {
    merged = mergeDependentFields(
      merged,
      mapFieldsToDependentByTypeCode(params.docType?.type_code, metadataFields, {
        title: params.doc.title,
        expiry_date: params.doc.expiry_date,
      })
    );
  }

  const extraction = await loadLatestDmsExtraction(admin, params.dmsDocumentId);
  if (extraction) {
    merged = mergeDependentFields(
      merged,
      mapFieldsToDependentByTypeCode(
        params.docType?.type_code,
        {
          ...extraction.extracted_fields_json,
          issue_date: extraction.issue_date_suggestion ?? extraction.extracted_fields_json.issue_date,
          expiry_date: extraction.expiry_date_suggestion ?? extraction.extracted_fields_json.expiry_date,
        },
        { title: params.doc.title, expiry_date: params.doc.expiry_date }
      )
    );
  }

  if (params.runAi) {
    const [masterEnabled, fillEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL),
    ]);
    const canUseAi = hasPermission(ctx, "hr.ai.use") && masterEnabled && fillEnabled;

    if (canUseAi) {
      const ocrSnippet = await loadDmsOcrSnippet(admin, params.dmsDocumentId);
      if (ocrSnippet) {
        const aiResult = await runComplianceAiPrefill("dependent", {
          dmsTypeName: params.docType?.name_en ?? null,
          documentTitle: params.doc.title ?? params.doc.document_no ?? "Dependent document",
          ocrSnippet,
        });
        if (aiResult) {
          merged = mergeDependentFields(
            merged,
            mapFieldsToDependentByTypeCode(params.docType?.type_code, aiResult.fields, {
              title: params.doc.title,
              expiry_date: params.doc.expiry_date,
            })
          );
          fieldConfidence = { ...fieldConfidence, ...aiResult.confidence };
          usedAi = true;
        }
      }
    }
  }

  return { fields: merged, fieldConfidence, usedAi };
}

async function prefillDependentFromDms(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  params: {
    employeeId: number;
    dmsDocumentId: number;
    doc: {
      title: string | null;
      document_no: string | null;
      issue_date: string | null;
      expiry_date: string | null;
    };
    docType: { type_code: string; name_en: string } | null;
    existingLink: boolean;
  }
): Promise<ActionResult<ComplianceDmsPrefillResult>> {
  const seed = await prefillSingleDependentDocument(admin, ctx, {
    dmsDocumentId: params.dmsDocumentId,
    doc: params.doc,
    docType: params.docType,
    runAi: true,
  });

  let merged = seed.fields;
  let prefillSource: ComplianceDmsPrefillResult["prefillSource"] = seed.usedAi ? "extraction_and_ai" : "extraction";
  let fieldConfidence = seed.fieldConfidence;
  const mergedFrom: NonNullable<ComplianceDmsPrefillResult["mergedFrom"]> = [];
  let warning: string | null = null;

  const personName = extractPersonNameFromDependentFields(merged);
  if (personName) {
    const related = await searchRelatedDependentDocuments(
      admin,
      params.employeeId,
      personName,
      params.dmsDocumentId
    );

    for (const relatedDoc of related) {
      const relatedPrefill = await prefillSingleDependentDocument(admin, ctx, {
        dmsDocumentId: relatedDoc.id,
        doc: {
          title: relatedDoc.title,
          document_no: relatedDoc.document_no,
          issue_date: null,
          expiry_date: relatedDoc.expiry_date,
        },
        docType: { type_code: relatedDoc.type_code, name_en: relatedDoc.type_name },
        runAi: false,
      });
      merged = mergeDependentFields(merged, relatedPrefill.fields);
      fieldConfidence = { ...fieldConfidence, ...relatedPrefill.fieldConfidence };
      mergedFrom.push({
        documentId: relatedDoc.id,
        documentNo: relatedDoc.document_no,
        title: relatedDoc.title,
        typeCode: relatedDoc.type_code,
      });
    }

    if (mergedFrom.length > 0) {
      warning = [
        warning,
        `Merged ${mergedFrom.length} related DMS document(s) for ${personName} (passport, EID, visa, insurance, etc.). Review all fields.`,
      ].filter(Boolean).join(" ");
    }
  }

  if (!merged.dependent_name_en.trim() && params.doc.title?.trim()) {
    merged.dependent_name_en = params.doc.title.trim();
  }

  if (merged.nationality_name && !merged.nationality_id) {
    merged.nationality_id = await resolveNationalityIdFromName(admin, merged.nationality_name);
  }

  if (!params.existingLink) {
    warning = [
      warning,
      "This document is not on the employee Documents tab yet — it will be linked when you save.",
    ].filter(Boolean).join(" ");
  }

  return {
    success: true,
    data: {
      dms_document_id: params.dmsDocumentId,
      linkedToEmployee: params.existingLink,
      sourceDocument: {
        title: params.doc.title ?? "",
        document_no: params.doc.document_no ?? "",
      },
      prefillSource,
      warning,
      fields: dependentPrefillToFormFields(merged),
      fieldConfidence,
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
    },
  };
}

function canPrefillKind(ctx: Awaited<ReturnType<typeof getAuthContext>>, kind: ComplianceDmsRecordKind): boolean {
  if (hasPermission(ctx, "hr.admin")) return true;
  if (kind === "medical_record") return hasPermission(ctx, "hr.medical.manage");
  return hasPermission(ctx, "hr.compliance.manage");
}

export async function prefillComplianceRecordFromDms(
  employeeId: number,
  dmsDocumentId: number,
  recordKind: ComplianceDmsRecordKind
): Promise<ActionResult<ComplianceDmsPrefillResult>> {
  try {
    const ctx = await getAuthContext();
    if (!canPrefillKind(ctx, recordKind)) {
      return { success: false, error: "Permission denied" };
    }

    const admin = createAdminClient();

    const { data: doc, error: docError } = await admin
      .from("dms_documents")
      .select(`
        id, title, document_no, issue_date, expiry_date,
        document_type:dms_document_types(type_code, name_en)
      `)
      .eq("id", dmsDocumentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (docError) return { success: false, error: docError.message };
    if (!doc) return { success: false, error: "DMS document not found" };

    const docType = firstOrSelf(doc.document_type as { type_code: string; name_en: string } | { type_code: string; name_en: string }[] | null);

    const { data: existingLink } = await admin
      .from("dms_document_links")
      .select("id")
      .eq("document_id", dmsDocumentId)
      .eq("entity_type", "employee")
      .eq("entity_id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (recordKind === "medical_insurance") {
      return prefillMedicalInsuranceFromDms(admin, ctx, {
        employeeId,
        dmsDocumentId,
        doc: {
          title: doc.title as string | null,
          document_no: doc.document_no as string | null,
          issue_date: doc.issue_date as string | null,
          expiry_date: doc.expiry_date as string | null,
        },
        docType,
        existingLink: !!existingLink,
      });
    }

    if (recordKind === "dependent") {
      return prefillDependentFromDms(admin, ctx, {
        employeeId,
        dmsDocumentId,
        doc: {
          title: doc.title as string | null,
          document_no: doc.document_no as string | null,
          issue_date: doc.issue_date as string | null,
          expiry_date: doc.expiry_date as string | null,
        },
        docType,
        existingLink: !!existingLink,
      });
    }

    const extraction = await loadLatestDmsExtraction(admin, dmsDocumentId);
    let prefillSource: ComplianceDmsPrefillResult["prefillSource"] = "dms_metadata";
    let warning: string | null = null;
    let fieldConfidence: Record<string, number> = {};

    let fields = mapMetadataFields(recordKind, {
      title: doc.title as string | null,
      document_no: doc.document_no as string | null,
      issue_date: doc.issue_date as string | null,
      expiry_date: doc.expiry_date as string | null,
    });

    if (extraction) {
      const mapped = mapExtractionFieldsForKind(recordKind, {
        ...extraction.extracted_fields_json,
        issue_date: extraction.issue_date_suggestion ?? extraction.extracted_fields_json.issue_date,
        expiry_date: extraction.expiry_date_suggestion ?? extraction.extracted_fields_json.expiry_date,
      });
      fields = mergeFieldMaps(fields, mapped.fields);
      fieldConfidence = { ...mapped.confidence };
      prefillSource = "extraction";
    }

    const [masterEnabled, fillEnabled] = await Promise.all([
      isHrAiMasterEnabled(),
      isHrAiFeatureEnabled(HR_AI_FEATURE_FLAGS.FILL),
    ]);
    const canUseAi = hasPermission(ctx, "hr.ai.use") && masterEnabled && fillEnabled;

    if (canUseAi) {
      const ocrSnippet = await loadDmsOcrSnippet(admin, dmsDocumentId);
      if (ocrSnippet) {
        const aiResult = await runComplianceAiPrefill(recordKind, {
          dmsTypeName: docType?.name_en ?? null,
          documentTitle: (doc.title as string) ?? (doc.document_no as string),
          ocrSnippet,
        });
        if (aiResult) {
          fields = mergeFieldMaps(fields, aiResult.fields);
          fieldConfidence = { ...fieldConfidence, ...aiResult.confidence };
          prefillSource = extraction ? "extraction_and_ai" : "ai_only";
          warning = aiResult.warning;
        } else if (!extraction) {
          warning = "AI prefill could not extract fields. Enter details manually.";
        }
      } else if (!extraction) {
        warning = "No OCR text available for AI prefill.";
      }
    } else if (!extraction) {
      warning = "No extraction data found. Enable HR AI or enter details manually.";
    }

    if (!existingLink) {
      warning = [
        warning,
        "This document is not on the employee Documents tab yet — it will be linked when you save.",
      ].filter(Boolean).join(" ");
    }

    return {
      success: true,
      data: {
        dms_document_id: dmsDocumentId,
        linkedToEmployee: !!existingLink,
        sourceDocument: {
          title: (doc.title as string) ?? "",
          document_no: (doc.document_no as string) ?? "",
        },
        prefillSource,
        warning,
        fields,
        fieldConfidence,
      },
    };
  } catch {
    return { success: false, error: "Failed to prefill from DMS document" };
  }
}
