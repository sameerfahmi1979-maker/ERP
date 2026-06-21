/**
 * Maps DMS extraction / metadata to HR medical insurance compliance form fields.
 */

import { isInternalDmsDocumentNumber } from "@/lib/hr/compliance/compliance-dms-ocr";
import { normalizeDateValue, pickStringField } from "@/lib/hr/compliance/dms-to-identity-map";

export type MedicalInsurancePrefillFields = {
  insurance_provider: string;
  tpa: string;
  policy_number: string;
  insurance_card_number: string;
  network_class: string;
  issue_date: string;
  expiry_date: string;
  employee_covered: boolean;
  dependent_coverage_included: boolean;
  dependent_count_covered: number | null;
  notes: string;
};

export const EMPTY_MEDICAL_INSURANCE_PREFILL: MedicalInsurancePrefillFields = {
  insurance_provider: "",
  tpa: "",
  policy_number: "",
  insurance_card_number: "",
  network_class: "",
  issue_date: "",
  expiry_date: "",
  employee_covered: true,
  dependent_coverage_included: false,
  dependent_count_covered: null,
  notes: "",
};

const PROVIDER_KEYS = [
  "insurance_provider",
  "insurer_name",
  "insurer",
  "insurance_company",
  "company_name",
  "payer",
  "payer_name",
  "underwriter",
  "provider",
];

const POLICY_KEYS = [
  "policy_number",
  "policy_no",
  "policy_id",
  "group_policy_number",
  "group_policy",
  "insurance_policy",
  "contract_number",
  "certificate_number",
];

const CARD_KEYS = [
  "insurance_card_number",
  "card_number",
  "card_no",
  "card_id",
  "health_card_number",
  "health_card_no",
  "member_id",
  "member_no",
  "membership_number",
  "membership_id",
  "membership_no",
  "member_number",
  "dha_member_id",
  "doh_member_id",
  "dha_id",
  "doh_id",
  "subscriber_id",
  "subscriber_number",
  "patient_id",
  "reg_no",
  "registration_number",
  "id_number",
  "id_no",
];

const NETWORK_KEYS = [
  "network_class",
  "network",
  "network_type",
  "network_name",
  "network_code",
  "plan_type",
  "plan_name",
  "plan",
  "plan_code",
  "category",
  "class",
  "product",
  "product_name",
  "benefit_category",
  "benefit_plan",
  "coverage_type",
  "coverage_plan",
  "coverage_category",
  "package",
  "package_name",
  "scheme",
  "option",
];

const TPA_KEYS = [
  "tpa",
  "tpa_name",
  "third_party_administrator",
  "administrator",
  "claims_administrator",
];

/** Map alternate AI / DMS field names → canonical form keys. */
export const MEDICAL_INSURANCE_AI_FIELD_ALIASES: Record<string, keyof MedicalInsurancePrefillFields> = {
  card_number: "insurance_card_number",
  card_no: "insurance_card_number",
  card_id: "insurance_card_number",
  health_card_number: "insurance_card_number",
  health_card_no: "insurance_card_number",
  member_id: "insurance_card_number",
  member_no: "insurance_card_number",
  membership_number: "insurance_card_number",
  membership_id: "insurance_card_number",
  membership_no: "insurance_card_number",
  member_number: "insurance_card_number",
  subscriber_id: "insurance_card_number",
  subscriber_number: "insurance_card_number",
  patient_id: "insurance_card_number",
  id_number: "insurance_card_number",
  id_no: "insurance_card_number",
  reg_no: "insurance_card_number",
  network: "network_class",
  network_type: "network_class",
  network_name: "network_class",
  network_code: "network_class",
  plan_type: "network_class",
  plan_name: "network_class",
  plan: "network_class",
  plan_code: "network_class",
  category: "network_class",
  class: "network_class",
  product: "network_class",
  product_name: "network_class",
  benefit_category: "network_class",
  benefit_plan: "network_class",
  coverage_type: "network_class",
  coverage_plan: "network_class",
  package: "network_class",
  package_name: "network_class",
  scheme: "network_class",
  insurer_name: "insurance_provider",
  insurer: "insurance_provider",
  insurance_company: "insurance_provider",
  company_name: "insurance_provider",
  payer: "insurance_provider",
  policy_no: "policy_number",
  group_policy_number: "policy_number",
  tpa_name: "tpa",
  third_party_administrator: "tpa",
  start_date: "issue_date",
  effective_date: "issue_date",
  valid_from: "issue_date",
  expiration_date: "expiry_date",
  valid_until: "expiry_date",
  valid_to: "expiry_date",
  end_date: "expiry_date",
};

export function normalizeMedicalInsuranceAiFields(
  raw: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  const source = raw ?? {};
  const out: Record<string, unknown> = { ...source };

  for (const [alias, canonical] of Object.entries(MEDICAL_INSURANCE_AI_FIELD_ALIASES)) {
    const aliasVal = source[alias];
    if (aliasVal == null || aliasVal === "") continue;
    const current = out[canonical];
    if (current == null || current === "") {
      out[canonical] = aliasVal;
    }
  }

  return out;
}

const NETWORK_CLASS_VALUES =
  /\b(gold|silver|bronze|platinum|basic|enhanced|standard|premium|vip|thiqa|saada|deluxe|essential|comprehensive|network\s*(?:gn|rn|cn|pn|[a-c]\d?)|category\s*[a-d]|cat\.?\s*[a-d]|class\s*[a-d]|plan\s*[a-d])\b/i;

const CARD_LABEL_PATTERN =
  /(?:card\s*(?:no\.?|number|#)|member(?:ship)?\s*(?:no\.?|number|id)|member\s*id|health\s*card\s*(?:no\.?|number)|subscriber\s*(?:no\.?|id)|patient\s*(?:no\.?|id)|reg(?:istration)?\s*(?:no\.?|number)|id\s*no\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]{3,24})/gi;

const NETWORK_LABEL_PATTERN =
  /(?:network(?:\s*(?:class|type|name|code))?|category|class|plan(?:\s*(?:type|name|code))?|benefit(?:\s*category)?|product(?:\s*name)?|package(?:\s*name)?|scheme|coverage(?:\s*(?:type|plan|category))?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s\-\/\.]{1,40})/gi;

function cleanOcrValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
}

function isLikelyPolicyNotCard(value: string, policyNumber: string): boolean {
  if (!value || !policyNumber) return false;
  return value.trim().toLowerCase() === policyNumber.trim().toLowerCase();
}

/** Regex fallback when AI misses labeled card / network fields on UAE health cards. */
export function extractMedicalInsuranceHintsFromOcr(
  ocr: string,
  existing?: Partial<MedicalInsurancePrefillFields>
): Partial<MedicalInsurancePrefillFields> {
  const hints: Partial<MedicalInsurancePrefillFields> = {};
  if (!ocr.trim()) return hints;

  const policyNumber = existing?.policy_number?.trim() ?? "";

  if (!existing?.insurance_card_number?.trim()) {
    let match: RegExpExecArray | null;
    CARD_LABEL_PATTERN.lastIndex = 0;
    while ((match = CARD_LABEL_PATTERN.exec(ocr)) !== null) {
      const candidate = cleanOcrValue(match[1] ?? "");
      if (!candidate || isInternalDmsDocumentNumber(candidate)) continue;
      if (isLikelyPolicyNotCard(candidate, policyNumber)) continue;
      hints.insurance_card_number = candidate;
      break;
    }
  }

  if (!existing?.network_class?.trim()) {
    let match: RegExpExecArray | null;
    NETWORK_LABEL_PATTERN.lastIndex = 0;
    while ((match = NETWORK_LABEL_PATTERN.exec(ocr)) !== null) {
      const candidate = cleanOcrValue(match[1] ?? "");
      if (!candidate || candidate.length < 2) continue;
      if (!NETWORK_CLASS_VALUES.test(candidate) && !/^(?:cat\.?\s*)?[A-D]$/i.test(candidate)) {
        if (candidate.length > 25) continue;
      }
      hints.network_class = candidate;
      break;
    }

    if (!hints.network_class) {
      const tierMatch = ocr.match(
        /\b(Gold|Silver|Bronze|Platinum|Basic|Enhanced|Standard|Premium|VIP|Thiqa|Saada|Deluxe|Essential)\b/i
      );
      if (tierMatch?.[1]) hints.network_class = tierMatch[1];
    }
  }

  return hints;
}

const ISSUE_DATE_KEYS = [
  "issue_date",
  "start_date",
  "effective_date",
  "valid_from",
  "date_of_issue",
  "inception_date",
  "commencement_date",
];

const EXPIRY_DATE_KEYS = [
  "expiry_date",
  "expiration_date",
  "valid_until",
  "valid_to",
  "end_date",
  "renewal_date",
];

const MEMBER_NAME_KEYS = [
  "member_name",
  "insured_name",
  "insured_party_name",
  "patient_name",
  "cardholder_name",
  "employee_name",
  "beneficiary_name",
];

function pickPolicyNumber(
  extracted: Record<string, unknown>,
  documentNo: string | null
): string | null {
  const fromExtraction = pickStringField(extracted, POLICY_KEYS);
  if (fromExtraction && !isInternalDmsDocumentNumber(fromExtraction)) return fromExtraction;
  if (documentNo && !isInternalDmsDocumentNumber(documentNo)) return documentNo.trim();
  return fromExtraction;
}

function parseBooleanField(extracted: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const val = extracted[key];
    if (typeof val === "boolean") return val;
    if (typeof val === "string") {
      const normalized = val.trim().toLowerCase();
      if (["true", "yes", "y", "1", "included", "covered"].includes(normalized)) return true;
      if (["false", "no", "n", "0", "excluded", "not included"].includes(normalized)) return false;
    }
    if (typeof val === "number") return val > 0;
  }
  return null;
}

function parseDependentCount(extracted: Record<string, unknown>): number | null {
  const text = pickStringField(extracted, [
    "dependent_count_covered",
    "dependents_covered",
    "dependent_count",
    "number_of_dependents",
    "family_members",
  ]);
  if (text) {
    const n = parseInt(text.replace(/\D/g, ""), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  for (const key of ["dependent_count_covered", "dependents_covered", "dependent_count", "number_of_dependents"]) {
    const val = extracted[key];
    if (typeof val === "number" && Number.isFinite(val) && val >= 0) return Math.trunc(val);
  }
  return null;
}

export function mapExtractionToMedicalInsuranceFields(
  extracted: Record<string, unknown>,
  options?: {
    issueDateSuggestion?: string | null;
    expiryDateSuggestion?: string | null;
    documentNo?: string | null;
  }
): MedicalInsurancePrefillFields {
  const issueDate =
    normalizeDateValue(options?.issueDateSuggestion)
    ?? normalizeDateValue(pickStringField(extracted, ISSUE_DATE_KEYS));
  const expiryDate =
    normalizeDateValue(options?.expiryDateSuggestion)
    ?? normalizeDateValue(pickStringField(extracted, EXPIRY_DATE_KEYS));

  const dependentIncluded = parseBooleanField(extracted, [
    "dependent_coverage_included",
    "family_coverage",
    "dependents_included",
    "includes_dependents",
  ]);
  const employeeCovered = parseBooleanField(extracted, ["employee_covered", "principal_covered", "member_covered"]);

  const memberName = pickStringField(extracted, MEMBER_NAME_KEYS);

  return {
    insurance_provider: pickStringField(extracted, PROVIDER_KEYS) ?? "",
    tpa: pickStringField(extracted, TPA_KEYS) ?? "",
    policy_number: pickPolicyNumber(extracted, options?.documentNo ?? null) ?? "",
    insurance_card_number: pickStringField(extracted, CARD_KEYS) ?? "",
    network_class: pickStringField(extracted, NETWORK_KEYS) ?? "",
    issue_date: issueDate ?? "",
    expiry_date: expiryDate ?? "",
    employee_covered: employeeCovered ?? true,
    dependent_coverage_included: dependentIncluded ?? false,
    dependent_count_covered: parseDependentCount(extracted),
    notes: memberName ? `Member: ${memberName}` : "",
  };
}

export function mapMetadataToMedicalInsuranceFields(doc: {
  title: string | null;
  document_no: string | null;
  issue_date: string | null;
  expiry_date: string | null;
}): MedicalInsurancePrefillFields {
  const issueDate = normalizeDateValue(doc.issue_date);
  const expiryDate = normalizeDateValue(doc.expiry_date);
  const docNo = doc.document_no?.trim() || null;
  const safePolicy = docNo && !isInternalDmsDocumentNumber(docNo) ? docNo : "";

  return {
    ...EMPTY_MEDICAL_INSURANCE_PREFILL,
    issue_date: issueDate ?? "",
    expiry_date: expiryDate ?? "",
    policy_number: safePolicy,
    // Do not map document title → provider (often wrong, blocks AI merge)
  };
}

export function needsMedicalInsuranceAiEnrichment(fields: MedicalInsurancePrefillFields): boolean {
  const requiredMissing =
    !fields.insurance_provider.trim()
    || !fields.policy_number.trim()
    || !fields.expiry_date.trim();
  const usefulMissing =
    !fields.insurance_card_number.trim()
    || !fields.tpa.trim()
    || !fields.network_class.trim()
    || !fields.issue_date.trim();
  return requiredMissing || usefulMissing;
}

export function isWeakMedicalInsuranceValue(
  key: keyof MedicalInsurancePrefillFields,
  value: string | number | boolean | null | undefined,
  context: { documentTitle: string | null; documentNo: string | null }
): boolean {
  if (value == null || value === "") return true;
  if (typeof value === "boolean" || typeof value === "number") return false;
  const v = value.trim();
  if (!v) return true;
  if (isInternalDmsDocumentNumber(v)) return true;
  if (key === "insurance_provider" && context.documentTitle) {
    if (v.toLowerCase() === context.documentTitle.trim().toLowerCase()) return true;
  }
  if (key === "policy_number" && context.documentNo && v === context.documentNo.trim()) {
    if (isInternalDmsDocumentNumber(v)) return true;
  }
  return false;
}

/** Merge overlay into base; AI overlay may replace weak placeholder values. */
export function mergeMedicalInsuranceFields(
  base: MedicalInsurancePrefillFields,
  overlay: Partial<MedicalInsurancePrefillFields>,
  options: {
    onlyEmpty?: boolean;
    allowOverrideWeak?: boolean;
    context?: { documentTitle: string | null; documentNo: string | null };
  } = {}
): MedicalInsurancePrefillFields {
  const merged = { ...base };
  const context = options.context ?? { documentTitle: null, documentNo: null };

  for (const [rawKey, value] of Object.entries(overlay)) {
    const key = rawKey as keyof MedicalInsurancePrefillFields;
    if (!(key in merged)) continue;
    if (value == null || value === "") continue;

    const current = merged[key];
    const isEmpty =
      current == null
      || current === ""
      || (typeof current === "string" && !current.trim());

    const weak = options.allowOverrideWeak
      && isWeakMedicalInsuranceValue(key, current as string | number | boolean | null, context);

    if (!options.onlyEmpty || isEmpty || weak) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return merged;
}
