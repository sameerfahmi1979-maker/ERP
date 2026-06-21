/**
 * Maps DMS document types and AI extraction fields to HR identity document form fields.
 */

import type { IdentityDocumentFormState } from "./identity-document-form";

/** DMS document type_code → hr_identity_document_types.code */
export const DMS_TYPE_TO_HR_IDENTITY_CODE: Record<string, string> = {
  EMP_EMIRATES_ID: "EMIRATES_ID",
  EMIRATES_ID: "EMIRATES_ID",
  EID: "EMIRATES_ID",
  EMP_PASSPORT: "PASSPORT",
  PASSPORT: "PASSPORT",
  PASSPORT_COPY: "PASSPORT",
  EMP_VISA: "RESIDENCE_VISA",
  VISA: "RESIDENCE_VISA",
  RESIDENCE_VISA: "RESIDENCE_VISA",
  LABOUR_CARD: "LABOUR_CARD",
  WORK_PERMIT: "WORK_PERMIT",
  EMP_WORK_PERMIT: "WORK_PERMIT",
};

export function mapDmsTypeCodeToHrIdentityCode(dmsTypeCode: string | null | undefined): string | null {
  if (!dmsTypeCode) return null;
  const normalized = dmsTypeCode.trim().toUpperCase();
  return DMS_TYPE_TO_HR_IDENTITY_CODE[normalized] ?? null;
}

export function pickStringField(fields: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = fields[key];
    if (typeof val === "string" && val.trim()) return val.trim();
    if (typeof val === "number" && Number.isFinite(val)) return String(val);
  }
  return null;
}

/** Normalize to YYYY-MM-DD when possible. */
export function normalizeDateValue(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1]!;
    const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return null;
}

type HrIdentityTypeRow = { id: number; code: string };

export type ExtractionMapInput = {
  extractedFields: Record<string, unknown>;
  fieldConfidence: Record<string, unknown>;
  issueDateSuggestion: string | null;
  expiryDateSuggestion: string | null;
  dmsTypeCode: string | null;
  documentIssueDate: string | null;
  documentExpiryDate: string | null;
  documentNo: string | null;
  hrIdentityTypes: HrIdentityTypeRow[];
};

export type ExtractionMapResult = {
  form: Partial<IdentityDocumentFormState>;
  fieldConfidence: Record<string, number>;
};

function confidenceScore(fieldConf: Record<string, unknown>, fieldCode: string): number | undefined {
  const entry = fieldConf[fieldCode] as { score?: number } | number | undefined;
  if (typeof entry === "number") return entry;
  if (entry && typeof entry.score === "number") return entry.score;
  return undefined;
}

export function mapExtractionToIdentityForm(input: ExtractionMapInput): ExtractionMapResult {
  const { extractedFields, fieldConfidence, hrIdentityTypes } = input;
  const form: Partial<IdentityDocumentFormState> = {};
  const conf: Record<string, number> = {};

  const hrCode = mapDmsTypeCodeToHrIdentityCode(input.dmsTypeCode);
  if (hrCode) {
    const match = hrIdentityTypes.find((t) => t.code === hrCode);
    if (match) form.document_type_id = match.id;
  }

  const documentNumber = pickStringField(extractedFields, [
    "document_number",
    "passport_number",
    "emirates_id_number",
    "id_number",
    "visa_number",
    "labour_card_number",
    "work_permit_number",
    "reference_number",
  ]) ?? (input.documentNo?.trim() || null);

  if (documentNumber) {
    form.document_number = documentNumber;
    const c = confidenceScore(fieldConfidence, "document_number")
      ?? confidenceScore(fieldConfidence, "passport_number")
      ?? confidenceScore(fieldConfidence, "emirates_id_number");
    if (c != null) conf.document_number = c;
  }

  const issueDate =
    normalizeDateValue(input.issueDateSuggestion)
    ?? normalizeDateValue(pickStringField(extractedFields, ["issue_date", "date_of_issue"]))
    ?? normalizeDateValue(input.documentIssueDate);
  if (issueDate) {
    form.issue_date = issueDate;
    const c = confidenceScore(fieldConfidence, "issue_date");
    if (c != null) conf.issue_date = c;
  }

  const expiryDate =
    normalizeDateValue(input.expiryDateSuggestion)
    ?? normalizeDateValue(pickStringField(extractedFields, ["expiry_date", "expiration_date", "valid_until"]))
    ?? normalizeDateValue(input.documentExpiryDate);
  if (expiryDate) {
    form.expiry_date = expiryDate;
    const c = confidenceScore(fieldConfidence, "expiry_date");
    if (c != null) conf.expiry_date = c;
  }

  const issuingAuthority = pickStringField(extractedFields, [
    "issuing_authority",
    "issuer",
    "issued_by",
    "employer_name",
  ]);
  if (issuingAuthority) {
    // Authority must be chosen from Party Master in the UI — not auto-mapped from text.
    void issuingAuthority;
  }

  const uid = pickStringField(extractedFields, ["uid_number", "uid", "unified_number"]);
  if (uid) form.uid_number = uid;

  const visaFile = pickStringField(extractedFields, ["visa_file_number", "file_number", "visa_file_no"]);
  if (visaFile) form.visa_file_number = visaFile;

  const labourCard = pickStringField(extractedFields, ["labour_card_number", "labour_card_no", "mol_number"]);
  if (labourCard) form.labour_card_number = labourCard;

  const workPermit = pickStringField(extractedFields, ["work_permit_number", "permit_number"]);
  if (workPermit) form.work_permit_number = workPermit;

  const mohre = pickStringField(extractedFields, ["mohre_person_code", "person_code", "mohre_code"]);
  if (mohre) form.mohre_person_code = mohre;

  const profession = pickStringField(extractedFields, ["profession", "job_title", "occupation", "designation"]);
  if (profession) form.profession_on_document = profession;

  const eidApp = pickStringField(extractedFields, ["emirates_id_application_no", "application_number"]);
  if (eidApp) form.emirates_id_application_no = eidApp;

  return { form, fieldConfidence: conf };
}
