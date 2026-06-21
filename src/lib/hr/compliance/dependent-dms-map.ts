/**
 * Maps DMS metadata / AI extraction to HR employee_dependents form fields.
 */

import { pickStringField, normalizeDateValue } from "@/lib/hr/compliance/dms-to-identity-map";
import {
  mapExtractionToMedicalInsuranceFields,
  normalizeMedicalInsuranceAiFields,
} from "@/lib/hr/compliance/medical-insurance-dms-map";
import { isInternalDmsDocumentNumber } from "@/lib/hr/compliance/compliance-dms-ocr";

export const DEPENDENT_DMS_TYPE_CODES = [
  "PASSPORT_COPY",
  "EMIRATES_ID",
  "VISA",
  "MEDICAL_INSURANCE",
  "DRIVING_LICENSE",
] as const;

export type DependentDmsTypeCode = (typeof DEPENDENT_DMS_TYPE_CODES)[number];

export type DependentPrefillFields = {
  dependent_name_en: string;
  dependent_name_ar: string;
  date_of_birth: string;
  nationality_id: number | null;
  nationality_name: string;
  passport_number: string;
  passport_expiry: string;
  emirates_id_number: string;
  emirates_id_expiry: string;
  residence_visa_number: string;
  residence_visa_expiry: string;
  medical_insurance_provider: string;
  medical_insurance_policy: string;
  medical_insurance_card: string;
  medical_insurance_expiry: string;
  sponsored_by: string;
  notes: string;
};

export const EMPTY_DEPENDENT_PREFILL: DependentPrefillFields = {
  dependent_name_en: "",
  dependent_name_ar: "",
  date_of_birth: "",
  nationality_id: null,
  nationality_name: "",
  passport_number: "",
  passport_expiry: "",
  emirates_id_number: "",
  emirates_id_expiry: "",
  residence_visa_number: "",
  residence_visa_expiry: "",
  medical_insurance_provider: "",
  medical_insurance_policy: "",
  medical_insurance_card: "",
  medical_insurance_expiry: "",
  sponsored_by: "",
  notes: "",
};

const NAME_KEYS = [
  "dependent_name_en",
  "full_name_en",
  "full_name",
  "visa_holder_name",
  "member_name",
  "holder_name",
  "name",
  "dependent_name",
];

const NAME_AR_KEYS = ["dependent_name_ar", "full_name_ar"];

const NATIONALITY_KEYS = ["nationality", "country_of_nationality", "citizenship"];

const DOB_KEYS = ["date_of_birth", "dob", "birth_date"];

function setIfEmpty(target: DependentPrefillFields, key: keyof DependentPrefillFields, value: string | null) {
  if (!value?.trim()) return;
  const current = target[key];
  if (current != null && current !== "") return;
  if (typeof current === "string") {
    (target as Record<string, unknown>)[key] = value.trim();
  }
}

function setDateIfEmpty(target: DependentPrefillFields, key: keyof DependentPrefillFields, value: unknown) {
  const d = normalizeDateValue(value);
  if (d) setIfEmpty(target, key, d);
}

export function mapFieldsToDependentByTypeCode(
  typeCode: string | null | undefined,
  fields: Record<string, unknown>,
  doc?: { title?: string | null; expiry_date?: string | null }
): Partial<DependentPrefillFields> {
  const code = (typeCode ?? "").trim().toUpperCase();
  const out: DependentPrefillFields = { ...EMPTY_DEPENDENT_PREFILL };

  const name = pickStringField(fields, NAME_KEYS);
  const nameAr = pickStringField(fields, NAME_AR_KEYS);
  const nationality = pickStringField(fields, NATIONALITY_KEYS);

  if (name) out.dependent_name_en = name;
  if (nameAr) out.dependent_name_ar = nameAr;
  if (nationality) out.nationality_name = nationality;
  setDateIfEmpty(out, "date_of_birth", pickStringField(fields, DOB_KEYS));

  switch (code) {
    case "PASSPORT_COPY": {
      const passportNo = pickStringField(fields, ["passport_number", "document_number"]);
      if (passportNo && !isInternalDmsDocumentNumber(passportNo)) {
        out.passport_number = passportNo;
      }
      setDateIfEmpty(out, "passport_expiry", pickStringField(fields, ["expiry_date", "passport_expiry"]));
      if (!out.passport_expiry && doc?.expiry_date) {
        setDateIfEmpty(out, "passport_expiry", doc.expiry_date);
      }
      break;
    }
    case "EMIRATES_ID": {
      const eid = pickStringField(fields, ["emirates_id_number", "id_number", "document_number"]);
      if (eid) out.emirates_id_number = eid.replace(/\s/g, "");
      setDateIfEmpty(out, "emirates_id_expiry", pickStringField(fields, ["expiry_date", "emirates_id_expiry"]));
      if (!out.emirates_id_expiry && doc?.expiry_date) {
        setDateIfEmpty(out, "emirates_id_expiry", doc.expiry_date);
      }
      break;
    }
    case "VISA": {
      const visaNo = pickStringField(fields, [
        "visa_file_number",
        "visa_number",
        "uid_number",
        "file_number",
        "document_number",
      ]);
      if (visaNo && !isInternalDmsDocumentNumber(visaNo)) {
        out.residence_visa_number = visaNo;
      }
      setDateIfEmpty(out, "residence_visa_expiry", pickStringField(fields, ["expiry_date", "visa_expiry"]));
      if (!out.residence_visa_expiry && doc?.expiry_date) {
        setDateIfEmpty(out, "residence_visa_expiry", doc.expiry_date);
      }
      const passport = pickStringField(fields, ["passport_number"]);
      if (passport) out.passport_number = passport;
      const eid = pickStringField(fields, ["emirates_id_number"]);
      if (eid) out.emirates_id_number = eid.replace(/\s/g, "");
      const sponsor = pickStringField(fields, ["sponsor_name", "employer_name"]);
      if (sponsor) out.notes = `Sponsor: ${sponsor}`;
      break;
    }
    case "MEDICAL_INSURANCE": {
      const insurance = mapExtractionToMedicalInsuranceFields(normalizeMedicalInsuranceAiFields(fields));
      if (insurance.insurance_provider) out.medical_insurance_provider = insurance.insurance_provider;
      if (insurance.policy_number) out.medical_insurance_policy = insurance.policy_number;
      if (insurance.insurance_card_number) out.medical_insurance_card = insurance.insurance_card_number;
      if (insurance.expiry_date) out.medical_insurance_expiry = insurance.expiry_date;
      if (insurance.notes && !out.notes) out.notes = insurance.notes;
      break;
    }
    case "DRIVING_LICENSE": {
      const licenseNo = pickStringField(fields, ["license_number", "driving_license_number", "licence_number"]);
      const eid = pickStringField(fields, ["emirates_id_number"]);
      if (eid && !out.emirates_id_number) out.emirates_id_number = eid.replace(/\s/g, "");
      const parts = [
        licenseNo ? `Driving licence: ${licenseNo}` : null,
        pickStringField(fields, ["license_category"]) ? `Category: ${pickStringField(fields, ["license_category"])}` : null,
      ].filter(Boolean);
      if (parts.length) {
        out.notes = [out.notes, parts.join("; ")].filter(Boolean).join(" | ");
      }
      break;
    }
    default: {
      const passportNo = pickStringField(fields, ["passport_number"]);
      const eid = pickStringField(fields, ["emirates_id_number", "emirates_id"]);
      const visaNo = pickStringField(fields, ["visa_number", "visa_file_number", "residence_visa_number"]);
      if (passportNo) out.passport_number = passportNo;
      if (eid) out.emirates_id_number = eid.replace(/\s/g, "");
      if (visaNo) out.residence_visa_number = visaNo;
      setDateIfEmpty(out, "passport_expiry", pickStringField(fields, ["passport_expiry"]));
      setDateIfEmpty(out, "emirates_id_expiry", pickStringField(fields, ["emirates_id_expiry", "expiry_date"]));
      setDateIfEmpty(out, "residence_visa_expiry", pickStringField(fields, ["residence_visa_expiry", "visa_expiry"]));
      if (!out.dependent_name_en && doc?.title?.trim()) {
        out.dependent_name_en = doc.title.trim();
      }
      break;
    }
  }

  return out;
}

/** Merge overlay into base — fills empty string fields; nationality_id when null. */
export function mergeDependentFields(
  base: DependentPrefillFields,
  overlay: Partial<DependentPrefillFields>,
  options: { onlyEmpty?: boolean } = { onlyEmpty: true }
): DependentPrefillFields {
  const merged = { ...base };
  for (const [rawKey, value] of Object.entries(overlay)) {
    const key = rawKey as keyof DependentPrefillFields;
    if (!(key in merged)) continue;
    if (value == null || value === "") continue;

    const current = merged[key];
    const isEmpty =
      current == null
      || current === ""
      || (key === "nationality_id" && current == null);

    if (!options.onlyEmpty || isEmpty) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export function dependentPrefillToFormFields(
  fields: DependentPrefillFields
): Record<string, string | number | boolean | null> {
  return {
    dependent_name_en: fields.dependent_name_en || null,
    dependent_name_ar: fields.dependent_name_ar || null,
    date_of_birth: fields.date_of_birth || null,
    nationality_id: fields.nationality_id,
    passport_number: fields.passport_number || null,
    passport_expiry: fields.passport_expiry || null,
    emirates_id_number: fields.emirates_id_number || null,
    emirates_id_expiry: fields.emirates_id_expiry || null,
    residence_visa_number: fields.residence_visa_number || null,
    residence_visa_expiry: fields.residence_visa_expiry || null,
    medical_insurance_provider: fields.medical_insurance_provider || null,
    medical_insurance_policy: fields.medical_insurance_policy || null,
    medical_insurance_card: fields.medical_insurance_card || null,
    medical_insurance_expiry: fields.medical_insurance_expiry || null,
    sponsored_by: fields.sponsored_by || null,
    notes: fields.notes || null,
  };
}

export function extractPersonNameFromDependentFields(fields: DependentPrefillFields): string | null {
  const name = fields.dependent_name_en.trim();
  if (name.length >= 2) return name;
  return null;
}
