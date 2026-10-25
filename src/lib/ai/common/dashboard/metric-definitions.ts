import type { DashboardSectionCode, DailyDashboardScope } from "./types";

/** Definitions belong to source code so labels, calculations and acceptance share a version. */
export const DASHBOARD_DEFINITIONS: Record<DashboardSectionCode, { source: string; definition: string }> = {
  risk: { source: "erp_ai_risk_scores", definition: "Current permitted risk records. Stale means last updated before the selected period; it is not a new-event count." },
  compliance: { source: "erp_ai_compliance_findings", definition: "Current permitted open or acknowledged findings; severity counts include both. Open counts only open findings." },
  duplicates: { source: "erp_ai_duplicate_candidates", definition: "Current permitted pending or under-review candidates. High confidence requires a recorded score of at least 80%; no score remains unknown." },
  field_suggestions: { source: "erp_ai_field_suggestions", definition: "Current pending/conflicting suggestions; accepted and rejected counts use the selected update period. Suggestions do not authorize changes." },
  dms_processing: { source: "dms_documents; dms_document_content_chunks", definition: "Current permitted document processing backlog, with new-document counts for the selected period. Missing OCR is not proof that OCR is required." },
  assistant_activity: { source: "erp_ai_assistant_sessions; erp_ai_assistant_messages; erp_ai_assistant_action_drafts", definition: "Permitted sessions, messages and drafts created in the selected period; pending-review drafts are the current backlog." },
  search_activity: { source: "erp_ai_recent_searches", definition: "Permitted searches in the selected period. My recent searches is a preview of at most 10, not the full search total." },
  ai_usage: { source: "erp_ai_usage_logs", definition: "Permitted recorded calls in the selected period. Failed includes failed, failure and error outcomes. Missing token evidence remains unknown; leading areas are the top four." },
  feature_flags: { source: "erp_ai_feature_flags", definition: "Current permitted configuration flags. Enabled does not mean that a provider, worker or dependency is healthy." },
};
export function dashboardPeriodStart(scope: DailyDashboardScope, now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid measurement time");
  if (scope === "today") {
    const day = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return new Date(`${day}T00:00:00+04:00`).toISOString();
  }
  if (scope !== "last_7_days" && scope !== "last_30_days") throw Error("Invalid dashboard period");
  return new Date(now.getTime() - (scope === "last_7_days" ? 7 : 30) * 86_400_000).toISOString();
}
