import type {OfficialDocumentDefinition} from './types';

/** Deliberately synthetic, never written to HR, payroll, storage or issuance. */
export const wordingReviewInputValues:Readonly<Record<string,string>>={source_review_id:'996310',eos_case_id:'996310',leave_request_id:'996310',purpose:'a stated administrative purpose',purpose_ar:'غرض إداري محدد',
 validity_period:'30 days',validity_period_ar:'٣٠ يوماً',addressee:'SAMPLE RECIPIENT',addressee_ar:'الجهة المستلمة التجريبية',valid_until:'2026-11-29'};
export function wordingReviewInputs(def:OfficialDocumentDefinition){return Object.fromEntries(def.optionalInputs.filter(field=>wordingReviewInputValues[field.key]).map(field=>[field.key,wordingReviewInputValues[field.key]]));}
export function wordingReviewSample(){
 const row:Record<string,unknown>={employee_name:'SAMPLE EMPLOYEE — NOT A REAL PERSON',employee_name_ar:'موظف تجريبي — ليس شخصاً حقيقياً',employee_code:'SAMPLE-000001',
  bank_disclosure_authorised:true,gender:'male',service_period:'2 years and 9 months',service_period_ar:'سنتان وتسعة أشهر',work_performed:'Sample duties',work_performed_ar:'مهام تجريبية',salary_in_words_en:'Eight thousand dirhams',salary_in_words_ar:'ثمانية آلاف درهم',warning_subject_en:'Sample authorised decision',warning_subject_ar:'قرار معتمد تجريبي',verified_conduct_description_en:'the conduct recorded in the sample reviewed case',verified_conduct_description_ar:'الواقعة المدونة في الملف التجريبي المراجع',policy_reference_en:'SAMPLE-POLICY-001',policy_reference_ar:'سياسة تجريبية ٠٠١',specific_corrective_action_en:'complete the recorded sample corrective action',specific_corrective_action_ar:'استكمال الإجراء التصحيحي التجريبي المسجل',corrective_deadline:'2026-11-10',response_channel_en:'Sample HR review channel',response_channel_ar:'قناة مراجعة موارد بشرية تجريبية',response_period:'the period recorded in the sample decision',response_period_ar:'المدة المدونة في القرار التجريبي',clearance_status:'Pending',clearance_status_ar:'معلق',receiving_employee_name:'SAMPLE RECEIVER',receiving_employee_name_ar:'مستلم تجريبي',verified_iban:'SAMPLE — NOT AN ACCOUNT',company_name:'SAMPLE COMPANY',company_name_ar:'شركة تجريبية',designation:'Sample job title',designation_ar:'وظيفة تجريبية',department:'Sample department',department_ar:'قسم تجريبي',
  joining_date:'2024-01-01',employment_type:'Full Time',last_working_date:'2026-10-01',employment_end_date:'2026-10-01',
  final_wage:8000,termination_reason:'SAMPLE END-OF-SERVICE REASON FOR WORDING REVIEW',termination_reason_ar:'سبب انتهاء خدمة تجريبي لمراجعة الصياغة',gross_salary:8000,basic_salary:6000,currency:'AED',
  warning_level:'Sample written warning',warning_level_ar:'إنذار خطي تجريبي',warning_reason:'Sample incident for wording review only',warning_reason_ar:'واقعة تجريبية لمراجعة الصياغة فقط',
  incident_description:'Synthetic example, not an allegation about an employee',incident_description_ar:'مثال تجريبي وليس ادعاءً يتعلق بموظف',incident_date:'2026-10-01',
  bank_name:'SAMPLE BANK',bank_name_ar:'بنك تجريبي',iban_masked:'SAMPLE — NOT AN ACCOUNT',leave_reference:'SAMPLE-LEAVE-001',leave_type:'Sample approved annual leave',leave_type_ar:'إجازة سنوية معتمدة تجريبية',
  leave_start:'2026-11-01',leave_end:'2026-11-15',return_date:'2026-11-16',ppe_item:'Sample safety helmet',ppe_item_ar:'خوذة سلامة تجريبية',quantity:1,issue_date:'2026-10-01'};
 return {row,rows:[row]};
}
