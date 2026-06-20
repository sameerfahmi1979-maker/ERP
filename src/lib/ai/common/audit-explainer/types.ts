// ERP COMMON AI.14 — AI Audit Trail Explainer Types
// Read-only. No mutations. No future module tables.

export type AuditExplainerScope =
  | "today"
  | "last_7_days"
  | "last_30_days";

export type AuditExplainerSourceType =
  | "audit_log"
  | "audit_group"
  | "entity_timeline"
  | "ai_event_group"
  | "dms_event_group";

export const AUDIT_EXPLAINER_PROMPT_VERSION = "v1.0";

export interface AuditTimelineItem {
  id: number;
  source: AuditExplainerSourceType;
  entityType: string;
  entityId?: number;
  entityReference?: string;
  action: string;
  actorId?: number;
  occurredAt: string;
  moduleCode?: string;
  safeLabel: string;
  safeDetail?: string;
}

export interface AuditExplanationOutput {
  title: string;
  plainEnglishSummary: string;
  whatChanged: string[];
  whoAndWhen: string;
  businessImpact: string | null;
  recommendedReviewLinks: Array<{ label: string; href: string }>;
  confidence: "high" | "medium" | "low";
}

export interface AuditExplanationSummary {
  explanationId?: number;
  sourceType: AuditExplainerSourceType;
  sourceId?: number;
  entityType?: string;
  entityId?: number;
  scope: string;
  explanation: AuditExplanationOutput | null;
  deterministicSummary: string;
  isAiGenerated: boolean;
  modelName?: string;
  generatedAt: string;
  warnings: string[];
}

export interface AuditExplainerPermissionState {
  canView: boolean;
  canUseAi: boolean;
  canAdmin: boolean;
}

export interface AuditExplainerInput {
  scope?: AuditExplainerScope;
  entityType?: string;
  entityId?: number;
  auditLogId?: number;
  sourceType?: AuditExplainerSourceType;
  limit?: number;
}

export interface AuditExplainerOverview {
  scope: AuditExplainerScope;
  generatedAt: string;
  timeline: AuditTimelineItem[];
  totalEvents: number;
  entityBreakdown: Record<string, number>;
  actionBreakdown: Record<string, number>;
}
