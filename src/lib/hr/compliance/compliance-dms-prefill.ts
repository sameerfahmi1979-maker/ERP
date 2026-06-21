/**
 * HR Compliance — shared DMS prefill types and merge helpers for non-identity sections.
 */

export type ComplianceDmsRecordKind =
  | "medical_insurance"
  | "dependent"
  | "access_card"
  | "training_certificate"
  | "medical_record";

export type ComplianceDmsPrefillMeta = {
  documentTitle: string;
  documentNo: string;
  prefillSource: string;
  warning?: string | null;
  linkedToEmployee?: boolean;
  mergedFrom?: Array<{
    documentNo: string;
    title: string;
    typeCode: string | null;
  }>;
};

export type ComplianceDmsPrefillResult = {
  dms_document_id: number;
  linkedToEmployee: boolean;
  sourceDocument: { title: string; document_no: string };
  prefillSource: "dms_metadata" | "extraction" | "extraction_and_ai" | "ai_only";
  warning?: string | null;
  fields: Record<string, string | number | boolean | null>;
  fieldConfidence?: Record<string, number>;
  mergedFrom?: Array<{
    documentId: number;
    documentNo: string;
    title: string;
    typeCode: string | null;
  }>;
};

/** Merge DMS prefill into form — fills empty fields; booleans/numbers always apply when empty/default. */
export function mergeComplianceDmsPrefill<T extends Record<string, unknown>>(
  form: T,
  prefill: ComplianceDmsPrefillResult
): T {
  const merged = { ...form, dms_document_id: prefill.dms_document_id };
  for (const [key, value] of Object.entries(prefill.fields)) {
    if (value == null || value === "") continue;
    if (!(key in merged)) continue;
    const current = merged[key as keyof T];
    const isEmptyString = current === "" || current == null;
    const isDefaultBoolean =
      typeof value === "boolean"
      && typeof current === "boolean"
      && key === "employee_covered"
      && current === true
      && value === false;
    const isDefaultDependent =
      typeof value === "boolean"
      && typeof current === "boolean"
      && key === "dependent_coverage_included"
      && current === false
      && value === true;
    if (isEmptyString || isDefaultBoolean || isDefaultDependent) {
      (merged as Record<string, unknown>)[key] = value;
    } else if (typeof value === "number" && (current == null || current === "")) {
      (merged as Record<string, unknown>)[key] = value;
    } else if (typeof value === "string" && isEmptyString) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export function prefillMetaFromResult(prefill: ComplianceDmsPrefillResult): ComplianceDmsPrefillMeta {
  return {
    documentTitle: prefill.sourceDocument.title,
    documentNo: prefill.sourceDocument.document_no,
    prefillSource: prefill.prefillSource,
    warning: prefill.warning,
    linkedToEmployee: prefill.linkedToEmployee,
    mergedFrom: prefill.mergedFrom?.map((m) => ({
      documentNo: m.documentNo,
      title: m.title,
      typeCode: m.typeCode,
    })),
  };
}
