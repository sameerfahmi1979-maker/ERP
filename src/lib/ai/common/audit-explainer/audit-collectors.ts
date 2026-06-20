// ERP COMMON AI.14 — Audit Data Collectors
// Read-only. No mutations. No raw OCR/content/prompt/AI response.
// No future module tables.

import { createAdminClient } from "@/lib/supabase/admin";
import { buildSafeAuditDiff } from "./audit-sanitizer";
import type { AuditExplainerScope, AuditTimelineItem } from "./types";

function scopeToDate(scope: AuditExplainerScope): string {
  if (scope === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (scope === "last_7_days") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

// ── Core audit log entries ─────────────────────────────────────────────────────

export async function collectAuditLogEntries(
  scope: AuditExplainerScope,
  entityType?: string,
  entityId?: number,
  limit = 50
): Promise<AuditTimelineItem[]> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  let query = supabase
    .from("audit_logs")
    .select("id, actor_user_profile_id, module_code, entity_name, entity_id, entity_reference, action, old_values, new_values, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (entityType) {
    query = query.ilike("entity_name", entityType);
  }
  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data } = await query;

  return (data ?? []).map((row) => {
    const diff = buildSafeAuditDiff(
      row.old_values as Record<string, unknown> | null,
      row.new_values as Record<string, unknown> | null
    );
    const safeDetail = diff.length > 0 ? diff.slice(0, 3).join("; ") : undefined;

    return {
      id: Number(row.id),
      source: "audit_log" as const,
      entityType: row.entity_name ?? "unknown",
      entityId: row.entity_id ? Number(row.entity_id) : undefined,
      entityReference: row.entity_reference ?? undefined,
      action: row.action ?? "update",
      actorId: row.actor_user_profile_id ? Number(row.actor_user_profile_id) : undefined,
      occurredAt: row.created_at,
      moduleCode: row.module_code ?? undefined,
      safeLabel: `${row.action ?? "update"} on ${row.entity_name ?? "record"}${row.entity_reference ? ` (${row.entity_reference})` : ""}`,
      safeDetail,
    };
  });
}

// ── Entity audit timeline (audit_logs + AI events) ────────────────────────────

export async function collectEntityAuditTimeline(
  scope: AuditExplainerScope,
  entityType: string,
  entityId: number,
  limit = 30
): Promise<AuditTimelineItem[]> {
  const auditItems = await collectAuditLogEntries(scope, entityType, entityId, limit);
  return auditItems;
}

// ── AI event timeline ──────────────────────────────────────────────────────────

export interface AiEventTimelineItem extends AuditTimelineItem {
  aiSource: "field_suggestion" | "compliance" | "duplicate" | "risk_score";
}

export async function collectAiEventTimeline(
  scope: AuditExplainerScope,
  entityType?: string,
  entityId?: number,
  limit = 30
): Promise<AiEventTimelineItem[]> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);
  const items: AiEventTimelineItem[] = [];

  // Risk score events
  const riskQuery = supabase
    .from("erp_ai_risk_score_events")
    .select("id, event_type, prior_risk_level, new_risk_level, actor_id, created_at, risk_score_id")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: riskEvents } = await riskQuery;
  for (const row of riskEvents ?? []) {
    items.push({
      id: Number(row.id),
      source: "ai_event_group",
      entityType: entityType ?? "entity",
      entityId,
      action: row.event_type ?? "risk_updated",
      actorId: row.actor_id ? Number(row.actor_id) : undefined,
      occurredAt: row.created_at,
      safeLabel: `Risk score ${row.event_type ?? "updated"}`,
      safeDetail: row.prior_risk_level && row.new_risk_level
        ? `${row.prior_risk_level} → ${row.new_risk_level}`
        : undefined,
      aiSource: "risk_score",
    });
  }

  // Compliance finding events
  const complianceQuery = supabase
    .from("erp_ai_compliance_finding_events")
    .select("id, finding_id, event_type, actor_user_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: complianceEvents } = await complianceQuery;
  for (const row of complianceEvents ?? []) {
    items.push({
      id: Number(row.id),
      source: "ai_event_group",
      entityType: entityType ?? "entity",
      entityId,
      action: row.event_type ?? "compliance_updated",
      actorId: row.actor_user_id ? Number(row.actor_user_id) : undefined,
      occurredAt: row.created_at,
      safeLabel: `Compliance finding ${row.event_type ?? "updated"}`,
      aiSource: "compliance",
    });
  }

  // Duplicate candidate events
  const dupQuery = supabase
    .from("erp_ai_duplicate_candidate_events")
    .select("id, candidate_id, event_type, actor_user_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: dupEvents } = await dupQuery;
  for (const row of dupEvents ?? []) {
    items.push({
      id: Number(row.id),
      source: "ai_event_group",
      entityType: entityType ?? "entity",
      entityId,
      action: row.event_type ?? "duplicate_updated",
      actorId: row.actor_user_id ? Number(row.actor_user_id) : undefined,
      occurredAt: row.created_at,
      safeLabel: `Duplicate candidate ${row.event_type ?? "updated"}`,
      aiSource: "duplicate",
    });
  }

  // Field suggestion events
  const suggQuery = supabase
    .from("erp_ai_field_suggestion_events")
    .select("id, suggestion_id, event_type, actor_user_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: suggEvents } = await suggQuery;
  for (const row of suggEvents ?? []) {
    items.push({
      id: Number(row.id),
      source: "ai_event_group",
      entityType: entityType ?? "entity",
      entityId,
      action: row.event_type ?? "suggestion_updated",
      actorId: row.actor_user_id ? Number(row.actor_user_id) : undefined,
      occurredAt: row.created_at,
      safeLabel: `AI field suggestion ${row.event_type ?? "updated"}`,
      aiSource: "field_suggestion",
    });
  }

  return items
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

// ── DMS event timeline ─────────────────────────────────────────────────────────

export async function collectDmsEventTimeline(
  scope: AuditExplainerScope,
  documentId?: number,
  limit = 20
): Promise<AuditTimelineItem[]> {
  const supabase = createAdminClient();
  const since = scopeToDate(scope);

  let query = supabase
    .from("dms_document_events")
    .select("id, document_id, event_type, description, performed_by, performed_at")
    .gte("performed_at", since)
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (documentId) {
    query = query.eq("document_id", documentId);
  }

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    source: "dms_event_group" as const,
    entityType: "dms_document",
    entityId: row.document_id ? Number(row.document_id) : undefined,
    action: row.event_type ?? "document_event",
    actorId: row.performed_by ? Number(row.performed_by) : undefined,
    occurredAt: row.performed_at ?? new Date().toISOString(),
    safeLabel: row.description ? String(row.description).slice(0, 120) : `Document ${row.event_type ?? "event"}`,
    moduleCode: "DMS",
  }));
}

// ── Combined overview ──────────────────────────────────────────────────────────

export async function collectAuditExplainerOverview(
  scope: AuditExplainerScope,
  entityType?: string,
  entityId?: number
): Promise<{ timeline: AuditTimelineItem[]; totalEvents: number; entityBreakdown: Record<string, number>; actionBreakdown: Record<string, number> }> {
  const [auditItems, aiItems, dmsItems] = await Promise.all([
    collectAuditLogEntries(scope, entityType, entityId, 30),
    collectAiEventTimeline(scope, entityType, entityId, 20),
    entityType === "dms_document"
      ? collectDmsEventTimeline(scope, entityId, 20)
      : Promise.resolve([] as AuditTimelineItem[]),
  ]);

  const all = [...auditItems, ...aiItems, ...dmsItems]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 50);

  const entityBreakdown: Record<string, number> = {};
  const actionBreakdown: Record<string, number> = {};
  for (const item of all) {
    entityBreakdown[item.entityType] = (entityBreakdown[item.entityType] ?? 0) + 1;
    actionBreakdown[item.action] = (actionBreakdown[item.action] ?? 0) + 1;
  }

  return {
    timeline: all,
    totalEvents: all.length,
    entityBreakdown,
    actionBreakdown,
  };
}
