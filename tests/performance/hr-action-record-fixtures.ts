import type {HrActionRecordKind} from "@/lib/reads/hr-action-records-schema";
/** Independently authored synthetic fixture. Extra fields deliberately test
 * allowlisted response projections; never production HR contents. */
export function actionRecordDetail(kind: HrActionRecordKind, id = 1, employeeId = 100) {
  return {id, employee_id: employeeId, eos_case_id: 300, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", created_by: 6, updated_by: 6, deleted_at: null,
    process_type_id: null, process_title: "Synthetic PRO اختبار", process_status: "draft", priority: "normal", request_date: "2026-01-01", target_date: null, submitted_date: null, completed_date: null, assigned_to: null, related_document_id: null, related_record_type: null, related_record_id: null, process_type: null, assigned_to_profile: null,
    action_type: "general", action_title: "Synthetic action اختبار", action_status: "open", action_date: "2026-01-01", due_date: null, dms_document_id: null, requires_approval: false, approval_request_id: null,
    review_type: "annual", review_period_start: null, review_period_end: null, review_date: "2026-01-01", reviewer_id: null, reviewer: null, rating: "good", summary: "SYNTHETIC_PRIVATE_REVIEW", strengths: "Retain full strengths", improvement_areas: "Retain full improvements", next_review_date: null,
    disciplinary_type: "written_warning", incident_date: null, record_date: "2026-01-01", severity: "medium", subject: "Synthetic warning اختبار", description: "SYNTHETIC_PRIVATE_DISCIPLINE", action_taken: "Retain full action", issued_by: null, issued_by_profile: null, acknowledged_by_employee: false, acknowledged_at: null, creates_operational_block: false, operational_block_id: null,
    note_type: "confidential", note_text: "SYNTHETIC_PRIVATE_NOTE اختبار " + "x".repeat(5000), visibility: "restricted",
    approval_type: "other", request_title: "Synthetic request اختبار", request_status: "pending", approval_role_id: null, requested_by: null, requested_at: "2026-01-01T00:00:00Z", approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, cancelled_by: null, cancelled_at: null, decision_reason: "SYNTHETIC_PRIVATE_DECISION", approval_role: null, requested_by_profile: null,
    eos_type: "other", case_status: "draft", notice_date: null, last_working_date: "2026-01-01", reason: "SYNTHETIC_PRIVATE_REASON", final_settlement_status: "not_started", clearance_completed: false,
    clearance_area: "it", item_title: "Synthetic item اختبار", item_status: "pending", responsible_user_id: null, cleared_by: null, cleared_at: null, notes: "SYNTHETIC_PRIVATE_NOTES", status: kind === "disciplinary" ? "open" : "draft"};
}
