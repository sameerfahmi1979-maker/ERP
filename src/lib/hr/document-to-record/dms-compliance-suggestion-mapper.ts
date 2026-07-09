/**
 * HR.14A — Compliance Suggestion Mapper
 *
 * Maps DMS extraction results to HrComplianceRecordSuggestion[] for review.
 * Only identity documents and medical insurance are handled in HR.14A.
 */

import { nanoid } from "nanoid";
import type {
  HrComplianceRecordSuggestion,
  HrDmsDocumentSelection,
} from "./types";
import {
  classifyDmsDocument,
  classificationLabel,
  classificationToComplianceKind,
} from "./document-classifier";

type DocWithExtraction = {
  doc: HrDmsDocumentSelection;
  extractedFields: Record<string, unknown>;
  fieldConfidence: Record<string, unknown>;
};

function str(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function conf(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return Math.min(1, Math.max(0, v));
    if (v && typeof v === "object" && "score" in (v as object)) {
      const score = (v as { score?: number }).score;
      if (typeof score === "number") return Math.min(1, Math.max(0, score));
    }
  }
  return 0.5;
}

function normalizeDate(v: string | undefined | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  // Accept YYYY-MM-DD or similar
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Try to parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function buildIdentityDocumentSuggestion(
  d: DocWithExtraction,
  hrIdentityTypeId: number | null
): HrComplianceRecordSuggestion {
  const { doc, extractedFields: ef, fieldConfidence: fc } = d;
  const classification = classifyDmsDocument(doc.document_type_code, doc.title);

  const documentNumber = str(ef, [
    "document_number",
    "passport_number",
    "emirates_id_number",
    "id_number",
    "visa_number",
    "labour_card_number",
    "work_permit_number",
    "driving_license_number",
    "card_number",
    "reference_number",
  ]);

  const issueDate =
    normalizeDate(str(ef, ["issue_date", "date_of_issue"])) ??
    normalizeDate(doc.issue_date);
  const expiryDate =
    normalizeDate(str(ef, ["expiry_date", "expiration_date", "valid_until"])) ??
    normalizeDate(doc.expiry_date);
  const issuingAuthority = str(ef, ["issuing_authority", "issuer", "issued_by"]);
  const uid = str(ef, ["uid_number", "uid", "unified_number"]);
  const visaFile = str(ef, ["visa_file_number", "file_number", "visa_file_no"]);
  const labourCard = str(ef, ["labour_card_number", "labor_card_number"]);
  const workPermit = str(ef, ["work_permit_number", "work_permit"]);
  const mohreCode = str(ef, ["mohre_person_code", "mohre_code"]);
  const profession = str(ef, ["profession_on_document", "profession", "designation_on_document"]);

  const warnings: string[] = [];
  if (!documentNumber) warnings.push("Document number not found — manual entry required");
  if (!issueDate && !expiryDate) warnings.push("Dates not found — manual entry may be needed");

  const overallConf = documentNumber
    ? conf(fc, ["document_number", "passport_number", "emirates_id_number", "id_number"])
    : 0.3;

  const fields: Record<string, string | number | boolean | null> = {
    document_type_id: hrIdentityTypeId,
    document_number: documentNumber,
    issue_date: issueDate,
    expiry_date: expiryDate,
    issuing_authority: issuingAuthority,
    status: "active",
    verification_status: "unverified",
    renewal_status: "not_required",
    uid_number: uid,
    visa_file_number: visaFile,
    labour_card_number: labourCard,
    work_permit_number: workPermit,
    mohre_person_code: mohreCode,
    profession_on_document: profession,
    dms_document_id: doc.id,
  };

  const fieldConf: Record<string, number> = {};
  if (documentNumber)
    fieldConf.document_number = conf(fc, ["document_number", "passport_number", "emirates_id_number"]);
  if (issueDate) fieldConf.issue_date = conf(fc, ["issue_date"]);
  if (expiryDate) fieldConf.expiry_date = conf(fc, ["expiry_date"]);

  return {
    tempId: nanoid(),
    kind: "identity_document",
    classification,
    label: classificationLabel(classification),
    sourceDocumentId: doc.id,
    sourceDocumentTitle: doc.title,
    confidence: overallConf,
    warnings,
    included: !!documentNumber,
    fields,
    fieldConfidence: fieldConf,
  };
}

function buildMedicalInsuranceSuggestion(d: DocWithExtraction): HrComplianceRecordSuggestion {
  const { doc, extractedFields: ef, fieldConfidence: fc } = d;

  const provider = str(ef, ["insurance_provider", "provider", "insurer", "company_name"]);
  const policyNumber = str(ef, ["policy_number", "policy_no", "policy_id", "certificate_number"]);
  const cardNumber = str(ef, ["insurance_card_number", "card_number", "member_id"]);
  const network = str(ef, ["network_class", "network", "plan_type", "coverage_class"]);
  const expiryDate =
    normalizeDate(str(ef, ["expiry_date", "expiration_date", "valid_until", "end_date"])) ??
    normalizeDate(doc.expiry_date);
  const issueDate =
    normalizeDate(str(ef, ["issue_date", "start_date", "effective_date"])) ??
    normalizeDate(doc.issue_date);

  const warnings: string[] = [];
  if (!provider) warnings.push("Insurance provider not found — manual entry required");
  if (!policyNumber) warnings.push("Policy number not found — manual entry required");
  if (!expiryDate) warnings.push("Expiry date not found — manual entry required");

  const overallConf = (provider && policyNumber)
    ? conf(fc, ["policy_number", "insurance_provider"])
    : 0.3;

  return {
    tempId: nanoid(),
    kind: "medical_insurance",
    classification: "MEDICAL_INSURANCE",
    label: "Medical Insurance",
    sourceDocumentId: doc.id,
    sourceDocumentTitle: doc.title,
    confidence: overallConf,
    warnings,
    included: !!(provider && policyNumber && expiryDate),
    fields: {
      insurance_provider: provider,
      policy_number: policyNumber,
      insurance_card_number: cardNumber,
      network_class: network,
      issue_date: issueDate,
      expiry_date: expiryDate,
      employee_covered: true,
      dependent_coverage_included: false,
      status: "active",
      verification_status: "unverified",
      renewal_status: "pending",
      dms_document_id: doc.id,
    },
    fieldConfidence: {
      insurance_provider: conf(fc, ["insurance_provider", "provider"]),
      policy_number: conf(fc, ["policy_number"]),
    },
  };
}

export function buildComplianceSuggestions(
  docsWithExtraction: DocWithExtraction[],
  hrIdentityTypeMap: Record<string, number>
): HrComplianceRecordSuggestion[] {
  const suggestions: HrComplianceRecordSuggestion[] = [];

  for (const d of docsWithExtraction) {
    const classification = classifyDmsDocument(d.doc.document_type_code, d.doc.title);
    const kind = classificationToComplianceKind(classification);
    if (!kind) continue;

    if (kind === "identity_document") {
      const typeId = hrIdentityTypeMap[classification] ?? null;
      suggestions.push(buildIdentityDocumentSuggestion(d, typeId));
    } else if (kind === "medical_insurance") {
      suggestions.push(buildMedicalInsuranceSuggestion(d));
    }
    // training_certificate: deferred to HR.14B unless explicitly classified
  }

  return suggestions;
}
