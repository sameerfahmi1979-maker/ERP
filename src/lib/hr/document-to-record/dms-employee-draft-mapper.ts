/**
 * HR.14A — Employee draft mapper
 *
 * Maps DMS extraction results from selected documents into an HrEmployeeDraftFromDocuments.
 * Uses deterministic field mapping only — no AI calls here.
 */

import type {
  HrEmployeeDraftFromDocuments,
  HrDocumentFieldSuggestion,
  HrDocumentConflict,
  HrDmsDocumentSelection,
} from "./types";

type DocWithExtraction = {
  doc: HrDmsDocumentSelection;
  extractedFields: Record<string, unknown>;
  fieldConfidence: Record<string, unknown>;
};

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function confidenceFor(conf: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = conf[k];
    if (typeof v === "number") return Math.min(1, Math.max(0, v));
    if (v && typeof v === "object" && "score" in (v as object)) {
      const score = (v as { score?: number }).score;
      if (typeof score === "number") return Math.min(1, Math.max(0, score));
    }
  }
  return 0.5;
}

function buildSuggestion(
  fieldName: string,
  fieldLabel: string,
  value: string,
  confidence: number,
  doc: HrDmsDocumentSelection,
  source: HrDocumentFieldSuggestion["source"] = "extraction"
): HrDocumentFieldSuggestion {
  return {
    fieldName,
    fieldLabel,
    suggestedValue: value,
    confidence,
    sourceDocumentId: doc.id,
    sourceDocumentTitle: doc.title,
    source,
    userValue: value,
    accepted: false,
  };
}

type FieldCandidate = {
  value: string;
  confidence: number;
  doc: HrDmsDocumentSelection;
};

function bestCandidate(
  candidates: FieldCandidate[],
  fieldName: string,
  fieldLabel: string
): { suggestion: HrDocumentFieldSuggestion | null; conflict: HrDocumentConflict | null } {
  if (candidates.length === 0) return { suggestion: null, conflict: null };

  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      suggestion: buildSuggestion(fieldName, fieldLabel, c.value, c.confidence, c.doc),
      conflict: null,
    };
  }

  const distinctValues = [...new Set(candidates.map((c) => c.value.toLowerCase()))];
  if (distinctValues.length === 1) {
    // All agree — pick highest confidence
    const best = candidates.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    return {
      suggestion: buildSuggestion(fieldName, fieldLabel, best.value, best.confidence, best.doc),
      conflict: null,
    };
  }

  // Conflict — return all values
  const best = candidates.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
  return {
    suggestion: buildSuggestion(fieldName, fieldLabel, best.value, best.confidence, best.doc),
    conflict: {
      fieldName,
      fieldLabel,
      values: candidates.map((c) => ({
        value: c.value,
        sourceDocumentId: c.doc.id,
        sourceDocumentTitle: c.doc.title,
        confidence: c.confidence,
      })),
      resolvedValue: null,
      resolvedSourceDocumentId: null,
    },
  };
}

export function buildEmployeeDraftFromDocuments(
  docsWithExtraction: DocWithExtraction[]
): HrEmployeeDraftFromDocuments {
  const conflicts: HrDocumentConflict[] = [];

  function aggregateField(
    fieldName: string,
    fieldLabel: string,
    extractKeys: string[]
  ): HrDocumentFieldSuggestion | null {
    const candidates: FieldCandidate[] = [];
    for (const { doc, extractedFields, fieldConfidence } of docsWithExtraction) {
      const value = pick(extractedFields, extractKeys);
      if (!value) continue;
      const conf = confidenceFor(fieldConfidence, extractKeys);
      candidates.push({ value, confidence: conf, doc });
    }
    const { suggestion, conflict } = bestCandidate(candidates, fieldName, fieldLabel);
    if (conflict) conflicts.push(conflict);
    return suggestion;
  }

  const fullNameEn = aggregateField("full_name_en", "Full Name (English)", [
    "full_name_en",
    "full_name",
    "name_en",
    "holder_name",
    "person_name",
    "name",
  ]);

  const fullNameAr = aggregateField("full_name_ar", "Full Name (Arabic)", [
    "full_name_ar",
    "name_ar",
    "arabic_name",
  ]);

  const gender = aggregateField("gender", "Gender", ["gender", "sex"]);

  const dob = aggregateField("date_of_birth", "Date of Birth", [
    "date_of_birth",
    "dob",
    "birth_date",
    "birthdate",
  ]);

  const nationalityCandidate = aggregateField("nationality_name", "Nationality", [
    "nationality",
    "nationality_name",
    "country_of_nationality",
  ]);

  const mobile = aggregateField("mobile_number", "Mobile Number", [
    "mobile_number",
    "mobile",
    "phone",
    "phone_number",
    "contact_number",
  ]);

  const email = aggregateField("personal_email", "Personal Email", [
    "email",
    "personal_email",
    "email_address",
  ]);

  const missingRequiredFields: string[] = [];
  if (!fullNameEn) missingRequiredFields.push("full_name_en");
  if (!gender) missingRequiredFields.push("gender");
  if (!dob) missingRequiredFields.push("date_of_birth");
  if (!mobile) missingRequiredFields.push("mobile_number");

  const allSuggestions: HrDocumentFieldSuggestion[] = [
    fullNameEn,
    fullNameAr,
    gender,
    dob,
    mobile,
    email,
  ].filter(Boolean) as HrDocumentFieldSuggestion[];

  const overallConfidence =
    allSuggestions.length > 0
      ? allSuggestions.reduce((sum, s) => sum + s.confidence, 0) / allSuggestions.length
      : 0;

  return {
    full_name_en: fullNameEn,
    full_name_ar: fullNameAr,
    gender,
    date_of_birth: dob,
    nationality_id: null, // resolved to FK server-side after user confirms nationality_name
    mobile_number: mobile,
    personal_email: email,
    // Employment fields — must be entered manually
    owner_company_id: null,
    branch_id: null,
    department_id: null,
    designation_id: null,
    employee_category_id: null,
    employment_type_id: null,
    joining_date: "",
    emergency_contact_name: "",
    emergency_contact_mobile: "",
    conflicts,
    missingRequiredFields,
    overallConfidence,
  };
}
