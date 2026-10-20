import {complianceCriteriaSchema, complianceDetailSchemas, complianceRowSchemas, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";

/** Synthetic test construction only, not a transport normalizer. Deliberately
 * malformed/partial response tests bypass this builder. No real person data. */
export function complianceFixture(kind: ComplianceKind, rowId = 17, employeeId = 7, overrides: Record<string, unknown> = {}) {
  const common = {workspace_revision:1,id: rowId, employee_id: employeeId, dms_document_id: null, notes: "INITIAL_PRIVATE_NOTE", created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z"};
  const types = {
    identity: {document_type_id: 1, document_number: "SYNTHETIC-ID-001", issue_date: null, expiry_date: "2027-01-01", issuing_authority: null, issuing_authority_party_id: null, issue_country_id: null, issuing_emirate_id: null, issue_city_id: null, status: "active", verification_status: "unverified", verified_by: null, verified_at: null, renewal_status: "not_required", emirates_id_application_no: null, visa_file_number: null, uid_number: null, labour_card_number: null, work_permit_number: null, mohre_person_code: null, profession_on_document: null, sponsor_company_id: null, place_of_issue: null, document_type: {id: 1, name_en: "Synthetic identity"}, issue_country: null, issuing_emirate: null, issue_city: null, issuing_authority_party: null, sponsor_company: null},
    insurance: {insurance_provider: "Synthetic insurance", tpa: null, policy_number: "SYNTH-POLICY", insurance_card_number: null, network_class: null, issue_date: null, expiry_date: "2027-01-01", employee_covered: true, dependent_coverage_included: false, dependent_count_covered: null, status: "active", verification_status: "unverified", renewal_status: "pending"},
    dependents: {workspace_revision:1,dependent_name_en: "Synthetic dependent", dependent_name_ar: null, relationship_type_id: 1, date_of_birth: null, nationality_id: null, passport_number: null, passport_expiry: null, emirates_id_number: null, emirates_id_expiry: null, residence_visa_number: null, residence_visa_expiry: null, medical_insurance_provider: "SENSITIVE PROVIDER", medical_insurance_policy: "SENSITIVE POLICY", medical_insurance_card: "SENSITIVE CARD", medical_insurance_expiry: "2027-01-01", sponsored_by: null, is_active: true, relationship_type: {id: 1, name_en: "Synthetic relationship"}, nationality: null},
    cards: {access_type_id: 1, client_authority: null, work_site_id: null, card_number: "SYNTH-CARD", application_reference: null, issue_date: null, expiry_date: "2027-01-01", status: "active", renewal_status: "not_required", access_type: {id: 1, name_en: "Synthetic access"}, work_site: null},
    training: {training_category_id: null, training_type_id: 1, provider: null, approval_body: null, certificate_number: "SYNTH-CERT", completion_date: null, expiry_date: "2027-01-01", required_for_designation: false, required_for_site: false, status: "valid", verification_status: "unverified", training_category: null, training_type: {id: 1, name_en: "Synthetic training"}},
    medical: {medical_record_type_id: 1, medical_center: null, report_number: "SYNTH-MEDICAL", examination_date: "2026-10-04", result: "fit", fit_for_work: true, work_restrictions: false, restriction_details: null, next_examination_date: null, required_for_visa: false, required_for_site: false, required_for_noc: false, medical_record_type: {id: 1, name_en: "Synthetic medical"}},
  };
  return complianceDetailSchemas[kind].parse({...common, ...types[kind], ...overrides});
}
export function complianceFixtureReply(input: unknown, rows: unknown[], access = {canManage: true, medicalView: true, medicalManage: true}) {
  const p = complianceCriteriaSchema.parse(input);
  if (p.operation === "detail") {
    const row = rows.find(row => (row as {id: number}).id === p.recordId);
    return {success: true as const, data: row ? {...p, row: complianceDetailSchemas[p.kind].parse(row), access} : {...p, availability: "unavailable"}};
  }
  const from = (p.page - 1) * p.pageSize;
  return {success: true as const, data: {operation: "page", kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize, totalCount: rows.length,
    rows: rows.slice(from, from + p.pageSize).map(row => complianceRowSchemas[p.kind].parse(row)), access}};
}
