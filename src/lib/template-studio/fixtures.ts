/**
 * OUTPUT.3A — Studio demo fixtures (EN + AR) used by the preview server action
 * and demo evidence scripts. Values are clearly synthetic — no real employee data.
 */

export const STUDIO_FIXTURE_EN: Record<string, string> = {
  "employee.full_name_en": "DEMO — John Fixture",
  "employee.full_name_ar": "جون فيكستر — عرض",
  "employee.employee_code": "EMP-DEMO-001",
  "employee.designation": "Senior Operations Executive",
  "employee.department": "Operations",
  "employee.branch": "Head Office",
  "employee.owner_company": "Alliance Gulf Transport & Construction L.L.C",
  "employee.joining_date": "15 March 2022",
  "employee.nationality": "British",
  "employee.employment_type": "Full Time",
  "employee.contract_end_date": "14 March 2027",
  "employee.employment_status": "Active",
  "employee.work_site": "Dubai Investments Park",
  "employee.last_working_date": "—",
  "company.legal_name_en": "Alliance Gulf Transport & Construction L.L.C",
  "company.legal_name_ar": "تحالف الخليج للنقل والمقاولات ذ.م.م",
  "company.address_block_en": "P.O. Box 12345, Dubai, United Arab Emirates",
  "company.trn": "100000000000003",
  "company.trade_license_no": "DEMO-123456",
  "company.phone": "+971 4 000 0000",
  "company.email": "info@example.ae",
  "company.website": "www.example.ae",
};

export const STUDIO_FIXTURE_AR: Record<string, string> = {
  ...STUDIO_FIXTURE_EN,
  "employee.full_name_en": "عرض — جون فيكستر",
  "employee.designation": "مسؤول عمليات أول",
  "employee.department": "العمليات",
  "employee.owner_company": "تحالف الخليج للنقل والمقاولات ذ.م.م",
};

export function getStudioFixture(locale: "en" | "ar"): Record<string, string> {
  return locale === "ar" ? STUDIO_FIXTURE_AR : STUDIO_FIXTURE_EN;
}
