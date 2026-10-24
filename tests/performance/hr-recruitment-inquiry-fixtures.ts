import type {RecruitmentInquiryKind} from "@/lib/reads/hr-recruitment-inquiries-schema";
export function recruitmentInquiryFixture(kind: RecruitmentInquiryKind, id = 1) {
  const base = {id, workspace_revision:1, department_id:null,designation_id:null,requisition_id:null,interviewer_id:null,assigned_to:null, created_at: "2026-01-01T00:00:00Z", notes: "SYNTHETIC_PRIVATE_NOTES", arbitrary_secret: "OMIT_UNRELATED"};
  const candidate = {id: 100, candidate_code: "PERF-CAND-100", full_name_en: "Synthetic candidate " + id, full_name_ar: "مرشح اختباري"};
  if (kind === "requisitions") return {...base, requisition_code: "PERF-REQ-" + id, requisition_title: "Synthetic requisition " + id, vacancies_count: 1, requisition_status: "open", priority: "normal", target_start_date: "2026-02-01", department: null, designation: null, job_description: "Complete original wording", requirements: "Complete requirements"};
  if (kind === "candidates") return {...base, candidate_code: "PERF-CAND-" + id, full_name_en: "Synthetic candidate " + id, full_name_ar: "مرشح اختباري", candidate_status: "new", pipeline_stage: "new", mobile_number: null, email: null, source: "direct", requisition: null};
  if (kind === "interviews") return {...base, candidate_id: 100, interview_round: "technical", interview_status: "scheduled", interview_datetime: "2026-01-02T01:00:00Z", interview_location: "Synthetic location", result: "pending", candidate, interviewer: null};
  if (kind === "offers") return {...base, candidate_id: 100, offer_status: "draft", proposed_joining_date: "2026-02-01", valid_until: "2026-01-31", basic_salary: null, currency: "AED", candidate, designation: null};
  return {...base, candidate_id: 100, task_title: "Synthetic task " + id, task_category: "hr", task_status: "pending", due_date: "2026-02-01", candidate, assigned_user: null};
}
