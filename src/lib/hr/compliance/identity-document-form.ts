/**
 * Shared form state for employee legal / identity documents (Compliance tab).
 */

export type IdentityDocumentFormState = {
  dms_document_id: number | null;
  document_type_id: number | null;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority_party_id: number | null;
  issue_country_id: number | null;
  issuing_emirate_id: number | null;
  issue_city_id: number | null;
  status: string;
  verification_status: string;
  renewal_status: string;
  sponsor_company_id: number | null;
  notes: string;
  emirates_id_application_no: string;
  visa_file_number: string;
  uid_number: string;
  labour_card_number: string;
  work_permit_number: string;
  mohre_person_code: string;
  profession_on_document: string;
};

export function createEmptyIdentityDocumentForm(): IdentityDocumentFormState {
  return {
    dms_document_id: null,
    document_type_id: null,
    document_number: "",
    issue_date: "",
    expiry_date: "",
    issuing_authority_party_id: null,
    issue_country_id: null,
    issuing_emirate_id: null,
    issue_city_id: null,
    status: "active",
    verification_status: "unverified",
    renewal_status: "not_required",
    sponsor_company_id: null,
    notes: "",
    emirates_id_application_no: "",
    visa_file_number: "",
    uid_number: "",
    labour_card_number: "",
    work_permit_number: "",
    mohre_person_code: "",
    profession_on_document: "",
  };
}

export function identityDocumentFormToPayload(form: IdentityDocumentFormState) {
  return {
    dms_document_id: form.dms_document_id,
    document_type_id: form.document_type_id!,
    document_number: form.document_number,
    issue_date: form.issue_date || null,
    expiry_date: form.expiry_date || null,
    issuing_authority: null,
    issuing_authority_party_id: form.issuing_authority_party_id,
    issue_country_id: form.issue_country_id,
    issuing_emirate_id: form.issuing_emirate_id,
    issue_city_id: form.issue_city_id,
    status: form.status,
    verification_status: form.verification_status,
    renewal_status: form.renewal_status,
    sponsor_company_id: form.sponsor_company_id,
    place_of_issue: null,
    notes: form.notes || null,
    emirates_id_application_no: form.emirates_id_application_no || null,
    visa_file_number: form.visa_file_number || null,
    uid_number: form.uid_number || null,
    labour_card_number: form.labour_card_number || null,
    work_permit_number: form.work_permit_number || null,
    mohre_person_code: form.mohre_person_code || null,
    profession_on_document: form.profession_on_document || null,
  };
}

export const ISSUING_AUTHORITY_PARTY_TYPE_CODES = [
  "GOVERNMENT_AUTHORITY",
  "LICENSE_ISSUER",
  "FREE_ZONE_AUTHORITY",
] as const;

export const IDENTITY_DOC_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending", label: "Pending" },
] as const;

export const IDENTITY_VERIFICATION_OPTIONS = [
  { value: "unverified", label: "Unverified" },
  { value: "verified", label: "Verified" },
  { value: "failed", label: "Failed" },
] as const;

export const IDENTITY_RENEWAL_STATUS_OPTIONS = [
  { value: "not_required", label: "Not Required" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
] as const;
