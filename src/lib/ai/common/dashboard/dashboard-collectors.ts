// ERP COMMON AI.13 — Dashboard Data Collectors
// All functions are read-only. No mutations. No future module tables.
// No raw OCR / content_text / prompt / AI response / API key exposure.

import { createAdminClient } from "@/lib/supabase/admin";
import type { DailyDashboardScope, DashboardAlertItem, DashboardKpiCard } from "./types";

function scopeToDate(scope: DailyDashboardScope): string {
  const now = new Date();
  if (scope === "today") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d.toISOString();
  }
  if (scope === "last_7_days") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

// ── 1. Risk KPIs ─────────────────────────────────────────────────────────────

export interface RiskKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectRiskKpis(scope: DailyDashboardScope): Promise<RiskKpiResult> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  const { data: counts } = await supabase
    .from("erp_ai_risk_scores")
    .select("risk_level, status, entity_type, entity_id")
    .is("deleted_at", null)
    .in("risk_level", ["critical", "high", "medium", "low", "none"]);

  const rows = counts ?? [];
  const critical = rows.filter((r) => r.risk_level === "critical").length;
  const high = rows.filter((r) => r.risk_level === "high").length;
  const unreviewed = rows.filter((r) => r.status === "pending_review").length;

  const { data: staleRows } = await supabase
    .from("erp_ai_risk_scores")
    .select("id")
    .is("deleted_at", null)
    .lt("updated_at", since);

  const stale = (staleRows ?? []).length;

  const { data: topRows } = await supabase
    .from("erp_ai_risk_scores")
    .select("id, entity_type, entity_id, risk_level, risk_score")
    .is("deleted_at", null)
    .in("risk_level", ["critical", "high"])
    .order("risk_score", { ascending: false })
    .limit(10);

  const alerts: DashboardAlertItem[] = (topRows ?? []).map((r) => ({
    id: Number(r.id),
    label: `${r.entity_type} #${r.entity_id}`,
    sublabel: `Risk: ${r.risk_level} (${r.risk_score ?? 0})`,
    severity: r.risk_level === "critical" ? "critical" : "warning",
    navigationPath: `/admin/ai/risk`,
  }));

  return {
    kpis: [
      { label: "Critical Risk", value: critical, severity: critical > 0 ? "critical" : "normal" },
      { label: "High Risk", value: high, severity: high > 0 ? "warning" : "normal" },
      { label: "Stale Scores", value: stale, severity: stale > 5 ? "warning" : "normal" },
      { label: "Pending Review", value: unreviewed, severity: unreviewed > 0 ? "warning" : "normal" },
    ],
    alerts,
  };
}

// ── 2. Compliance KPIs ────────────────────────────────────────────────────────

export interface ComplianceKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectComplianceKpis(scope: DailyDashboardScope): Promise<ComplianceKpiResult> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("erp_ai_compliance_findings")
    .select("id, severity, status, entity_type, entity_id")
    .is("deleted_at", null)
    .in("status", ["open", "acknowledged"]);

  const all = rows ?? [];
  const open = all.filter((r) => r.status === "open").length;
  const critical = all.filter((r) => r.severity === "critical").length;
  const high = all.filter((r) => r.severity === "high").length;

  const { data: topRows } = await supabase
    .from("erp_ai_compliance_findings")
    .select("id, entity_type, entity_id, severity, status")
    .is("deleted_at", null)
    .in("status", ["open", "acknowledged"])
    .in("severity", ["critical", "high"])
    .order("created_at", { ascending: false })
    .limit(10);

  const alerts: DashboardAlertItem[] = (topRows ?? []).map((r) => ({
    id: Number(r.id),
    label: `${r.entity_type} #${r.entity_id}`,
    sublabel: `Severity: ${r.severity} — ${r.status}`,
    severity: r.severity === "critical" ? "critical" : "warning",
    navigationPath: `/admin/ai/compliance`,
  }));

  return {
    kpis: [
      { label: "Open Findings", value: open, severity: open > 0 ? "warning" : "normal" },
      { label: "Critical Findings", value: critical, severity: critical > 0 ? "critical" : "normal" },
      { label: "High Findings", value: high, severity: high > 0 ? "warning" : "normal" },
    ],
    alerts,
  };
}

// ── 3. Duplicate KPIs ─────────────────────────────────────────────────────────

export interface DuplicateKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectDuplicateKpis(scope: DailyDashboardScope): Promise<DuplicateKpiResult> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id, candidate_type, status, confidence_score, entity_type_a, entity_id_a")
    .is("deleted_at", null)
    .in("status", ["pending", "under_review"]);

  const all = rows ?? [];
  const pending = all.length;
  const highConf = all.filter((r) => (r.confidence_score ?? 0) >= 0.8).length;
  const conflicts = all.filter((r) => r.candidate_type === "conflict").length;

  const { data: topRows } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id, entity_type_a, entity_id_a, entity_type_b, entity_id_b, confidence_score, candidate_type")
    .is("deleted_at", null)
    .in("status", ["pending", "under_review"])
    .order("confidence_score", { ascending: false })
    .limit(10);

  const alerts: DashboardAlertItem[] = (topRows ?? []).map((r) => ({
    id: Number(r.id),
    label: `${r.entity_type_a} #${r.entity_id_a} ↔ ${r.entity_type_b} #${r.entity_id_b}`,
    sublabel: `Confidence: ${Math.round((r.confidence_score ?? 0) * 100)}% — ${r.candidate_type}`,
    severity: (r.confidence_score ?? 0) >= 0.9 ? "critical" : "warning",
    navigationPath: `/admin/ai/duplicates`,
  }));

  return {
    kpis: [
      { label: "Pending Candidates", value: pending, severity: pending > 0 ? "warning" : "normal" },
      { label: "High Confidence", value: highConf, severity: highConf > 0 ? "warning" : "normal" },
      { label: "Conflict Type", value: conflicts, severity: conflicts > 0 ? "warning" : "normal" },
    ],
    alerts,
  };
}

// ── 4. Field Suggestion KPIs ──────────────────────────────────────────────────

export interface FieldSuggestionKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectFieldSuggestionKpis(scope: DailyDashboardScope): Promise<FieldSuggestionKpiResult> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  const { count: pendingCount } = await supabase
    .from("erp_ai_field_suggestions")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "pending");

  const { count: acceptedCount } = await supabase
    .from("erp_ai_field_suggestions")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "accepted")
    .gte("updated_at", since);

  const { count: rejectedCount } = await supabase
    .from("erp_ai_field_suggestions")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "rejected")
    .gte("updated_at", since);

  const { count: conflictCount } = await supabase
    .from("erp_ai_field_suggestions")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "conflict_detected");

  const { data: topRows } = await supabase
    .from("erp_ai_field_suggestions")
    .select("id, entity_type, entity_id, field_code, status")
    .is("deleted_at", null)
    .in("status", ["pending", "conflict_detected"])
    .order("created_at", { ascending: false })
    .limit(10);

  const alerts: DashboardAlertItem[] = (topRows ?? []).map((r) => ({
    id: Number(r.id),
    label: `${r.entity_type} #${r.entity_id} — ${r.field_code}`,
    sublabel: r.status === "conflict_detected" ? "Conflict detected" : "Pending review",
    severity: r.status === "conflict_detected" ? "warning" : "normal",
  }));

  return {
    kpis: [
      { label: "Pending Suggestions", value: pendingCount ?? 0, severity: (pendingCount ?? 0) > 0 ? "info" : "normal" },
      { label: `Accepted (${scope})`, value: acceptedCount ?? 0 },
      { label: `Rejected (${scope})`, value: rejectedCount ?? 0 },
      { label: "Conflicts", value: conflictCount ?? 0, severity: (conflictCount ?? 0) > 0 ? "warning" : "normal" },
    ],
    alerts,
  };
}

// ── 5. DMS Processing KPIs ────────────────────────────────────────────────────

export interface DmsProcessingKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectDmsProcessingKpis(scope: DailyDashboardScope): Promise<DmsProcessingKpiResult> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  const { count: uploadedToday } = await supabase
    .from("dms_documents")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("created_at", since);

  const { count: missingOcr } = await supabase
    .from("dms_documents")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .or("ocr_text_available.is.null,ocr_text_available.eq.false");

  const { count: missingSummary } = await supabase
    .from("dms_documents")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("ai_summary_status", "eq", "complete");

  const { count: missingEmbedding } = await supabase
    .from("dms_documents")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("summary_embedding_status", "eq", "complete");

  const { count: highRisk } = await supabase
    .from("dms_documents")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .in("ai_risk_level", ["high", "critical"]);

  const { data: topRows } = await supabase
    .from("dms_documents")
    .select("id, title, doc_no, ai_risk_level, ai_summary_status")
    .is("deleted_at", null)
    .in("ai_risk_level", ["high", "critical"])
    .order("ai_risk_score", { ascending: false })
    .limit(10);

  const alerts: DashboardAlertItem[] = (topRows ?? []).map((r) => ({
    id: Number(r.id),
    label: r.doc_no ? `${r.doc_no}` : `Document #${r.id}`,
    sublabel: r.title ? String(r.title).substring(0, 60) : undefined,
    severity: r.ai_risk_level === "critical" ? "critical" : "warning",
    navigationPath: `/dms/documents/record/${r.id}`,
  }));

  return {
    kpis: [
      { label: `Uploaded (${scope})`, value: uploadedToday ?? 0 },
      { label: "Missing OCR", value: missingOcr ?? 0, severity: (missingOcr ?? 0) > 0 ? "warning" : "normal" },
      { label: "Missing AI Summary", value: missingSummary ?? 0, severity: (missingSummary ?? 0) > 10 ? "warning" : "normal" },
      { label: "Missing Embedding", value: missingEmbedding ?? 0 },
      { label: "High/Critical Risk Docs", value: highRisk ?? 0, severity: (highRisk ?? 0) > 0 ? "warning" : "normal" },
    ],
    alerts,
  };
}

// ── 6. Assistant Activity KPIs ────────────────────────────────────────────────

export interface AssistantKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectAssistantKpis(scope: DailyDashboardScope): Promise<AssistantKpiResult> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  const { count: sessionsCount } = await supabase
    .from("erp_ai_assistant_sessions")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("created_at", since);

  const { count: messagesCount } = await supabase
    .from("erp_ai_assistant_messages")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);

  const { count: draftsCreated } = await supabase
    .from("erp_ai_assistant_action_drafts")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("created_at", since);

  const { count: draftsPending } = await supabase
    .from("erp_ai_assistant_action_drafts")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "pending_review");

  return {
    kpis: [
      { label: `Sessions (${scope})`, value: sessionsCount ?? 0 },
      { label: `Messages (${scope})`, value: messagesCount ?? 0 },
      { label: `Drafts Created (${scope})`, value: draftsCreated ?? 0 },
      { label: "Drafts Pending Review", value: draftsPending ?? 0, severity: (draftsPending ?? 0) > 0 ? "info" : "normal" },
    ],
    alerts: [],
  };
}

// ── 7. Search Activity KPIs ───────────────────────────────────────────────────

export interface SearchKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectSearchKpis(scope: DailyDashboardScope, userId: number): Promise<SearchKpiResult> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  const { count: totalSearches } = await supabase
    .from("erp_ai_recent_searches")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("created_at", since);

  const { data: modeCounts } = await supabase
    .from("erp_ai_recent_searches")
    .select("search_mode")
    .is("deleted_at", null)
    .gte("created_at", since);

  const modeBreakdown = (modeCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    const m = r.search_mode ?? "unknown";
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});
  const topMode = Object.entries(modeBreakdown).sort((a, b) => b[1] - a[1])[0];

  const { data: mySearches } = await supabase
    .from("erp_ai_recent_searches")
    .select("id, search_mode, result_count, created_at")
    .is("deleted_at", null)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const alerts: DashboardAlertItem[] = (mySearches ?? []).map((r) => ({
    id: Number(r.id),
    label: `Search (${r.search_mode ?? "unknown"})`,
    sublabel: `${r.result_count ?? 0} results`,
    severity: "normal",
  }));

  return {
    kpis: [
      { label: `Searches (${scope})`, value: totalSearches ?? 0 },
      { label: "Top Mode", value: topMode ? `${topMode[0]} (${topMode[1]})` : "—" },
      { label: "My Recent Searches", value: (mySearches ?? []).length },
    ],
    alerts,
  };
}

// ── 8. AI Usage KPIs ──────────────────────────────────────────────────────────

export interface AiUsageKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectAiUsageKpis(scope: DailyDashboardScope): Promise<AiUsageKpiResult> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  const { data: rows } = await supabase
    .from("erp_ai_usage_logs")
    .select("feature_area, status, input_token_count, output_token_count")
    .gte("created_at", since);

  const all = rows ?? [];
  const totalCalls = all.length;
  const failedCalls = all.filter((r) => r.status === "error" || r.status === "failed").length;
  const totalInputTokens = all.reduce((s, r) => s + (r.input_token_count ?? 0), 0);
  const totalOutputTokens = all.reduce((s, r) => s + (r.output_token_count ?? 0), 0);

  const areaBreakdown = all.reduce<Record<string, number>>((acc, r) => {
    const a = r.feature_area ?? "unknown";
    acc[a] = (acc[a] ?? 0) + 1;
    return acc;
  }, {});

  const areaKpis: DashboardKpiCard[] = Object.entries(areaBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([area, count]) => ({ label: area, value: count }));

  return {
    kpis: [
      { label: `AI Calls (${scope})`, value: totalCalls },
      { label: "Failed Calls", value: failedCalls, severity: failedCalls > 0 ? "warning" : "normal" },
      { label: "Input Tokens", value: totalInputTokens.toLocaleString() },
      { label: "Output Tokens", value: totalOutputTokens.toLocaleString() },
      ...areaKpis,
    ],
    alerts: [],
  };
}

// ── 9. Feature Flag KPIs ──────────────────────────────────────────────────────

export interface FeatureFlagKpiResult {
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
}

export async function collectFeatureFlagKpis(): Promise<FeatureFlagKpiResult> {
  const supabase = createAdminClient();

  const { data: flags } = await supabase
    .from("erp_ai_feature_flags")
    .select("id, feature_code, feature_name, is_enabled, requires_human_review")
    .order("feature_code");

  const all = flags ?? [];
  const enabled = all.filter((f) => f.is_enabled).length;
  const disabled = all.filter((f) => !f.is_enabled).length;
  const requiresReview = all.filter((f) => f.requires_human_review).length;

  const importantDisabled = all
    .filter((f) => !f.is_enabled && f.feature_code.startsWith("ERP_AI_"))
    .slice(0, 10);

  const alerts: DashboardAlertItem[] = importantDisabled.map((f) => ({
    id: Number(f.id),
    label: f.feature_code,
    sublabel: f.feature_name ?? undefined,
    severity: "normal",
  }));

  return {
    kpis: [
      { label: "Enabled Flags", value: enabled, severity: "info" },
      { label: "Disabled Flags", value: disabled },
      { label: "Requires Human Review", value: requiresReview },
    ],
    alerts,
  };
}
