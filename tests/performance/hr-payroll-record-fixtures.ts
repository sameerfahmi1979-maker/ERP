import type {PayrollRecordKind} from "@/lib/reads/hr-payroll-records-schema";
const base = {employee_id: 880301, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", deleted_at: null};
export function payrollRecordFixture(kind: PayrollRecordKind, id = 1) {
  const common = {...base, id};
  if (kind === "salary-components") return {...common, component_type_id: 100, amount: 1234, effective_from: "2026-01-01", effective_to: null, is_active: true, notes: `Synthetic component notes ${id}`, component_type: {id: 100, code: "SYNTH", name_en: `Synthetic earning ${id}`, name_ar: "بدل تجريبي", component_kind: "earning", is_wps_component: true}};
  if (kind === "salary-revisions") return {...common, effective_date: "2026-01-01", revision_reason: `Synthetic revision ${id}`, old_gross: 1000, new_gross: 1100, approved_by: null, created_by: null, approver: null, creator: {display_name: null}};
  return {...common, hold_reason: `Synthetic hold ${id}`, hold_date: "2026-01-01", release_date: null, released_by: null, notes: null, is_active: true, releaser: null};
}
export const payrollProfileFixture = {...base, id: 10, payroll_group_id: 100, effective_date: "2026-01-01", currency: "AED", payroll_status: "active", notes: "Synthetic profile", created_by: null, updated_by: null, payroll_group: {id: 100, name_en: "Synthetic payroll group", pay_frequency: "monthly"}};
export const payrollWpsFixture = {...base, id: 11, wps_applicable: true, wps_status: "active", bank_id: 101, account_holder_name: "Synthetic account", account_number: "1234567890", iban: "AE000000000000001234567", exchange_house: null, salary_payment_method: "bank_transfer", labour_card_number: "SYNTH-LABOUR", mohre_person_code: "SYNTH-PERSON", mohre_establishment_id: null, salary_effective_date: null, bank: {id: 101, bank_name_en: "Synthetic bank", bank_code: "SYNTH"}, mohre_establishment: null};
