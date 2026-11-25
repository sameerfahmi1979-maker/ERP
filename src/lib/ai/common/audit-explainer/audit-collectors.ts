// ERP COMMON AI.14 — Audit Data Collectors
// Read-only. No mutations. No raw OCR/content/prompt/AI response.
// No future module tables.

import { getAuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { readAuthorizedAssistantEntity } from "@/lib/ai/common/assistant/entity-access";
import { createClient } from "@/lib/supabase/server";
import {verifiedPreview} from "@/server/reads/verified-aggregate";
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

const subjectNames = {
  company: ["company", "organization", "owner_company", "owner_companies"],
  branch: ["branch", "branches"],
  party: ["party", "parties"],
  site: ["site", "work_site", "work_sites"],
  dms_document: ["dms_document", "document", "dms_documents"],
  employee: ["employee", "employees"],
  dependent: ["dependent", "employee_dependent", "employee_dependents"],
} as const;

type SubjectType = keyof typeof subjectNames;
type Subject = { type: SubjectType; id: number };

function subjectType(value: unknown): SubjectType | undefined {
  if (typeof value !== "string") return undefined;
  return (Object.keys(subjectNames) as SubjectType[]).find(type =>
    (subjectNames[type] as readonly string[]).includes(value.toLowerCase()));
}

function subjectReference(typeValue: unknown, idValue: unknown): Subject | null {
  const type = subjectType(typeValue);
  if (!type || typeof idValue !== "number" || !Number.isSafeInteger(idValue) || idValue <= 0) return null;
  return { type, id: idValue };
}

function selectSubject(typeValue?: string, id?: number) {
  const type = subjectType(typeValue);
  if ((typeValue !== undefined && !type) || (id !== undefined && (!type || !Number.isSafeInteger(id) || id <= 0))) {
    throw Error("Choose a valid audit subject.");
  }
  return { type, id };
}

// ── Core audit log entries ─────────────────────────────────────────────────────

export async function collectAuditLogEntries(
  scope: AuditExplainerScope,
  entityType?: string,
  entityId?: number,
  limit = 50
): Promise<AuditTimelineItem[]> {
  const { type, id } = selectSubject(entityType, entityId);
  const supabase = await createClient();
  if (type && id !== undefined) {
    const context = await getAuthContext();
    if (!await readAuthorizedAssistantEntity(type, id, { context, db: supabase })) return [];
  }
  const since = scopeToDate(scope);

  let query = supabase
    .from("audit_logs")
    .select("id, actor_user_profile_id, module_code, entity_name, entity_id, entity_reference, action, old_values, new_values, created_at", {count:"exact"})
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) query = query.in("entity_name", [...subjectNames[type]]);
  if (id !== undefined) query = query.eq("entity_id", id);

  const { data } = await verifiedPreview(query.order("id",{ascending:false}),limit);

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

const eventSources = [
  {
    table: "erp_ai_risk_score_events",
    parent: "erp_ai_risk_scores",
    name: "Risk score events",
    label: "Risk score",
    kind: "risk_score",
    columns: "entity_type,entity_id",
    extras: "actor_id,prior_risk_level,new_risk_level",
  },
  {
    table: "erp_ai_compliance_finding_events",
    parent: "erp_ai_compliance_findings",
    name: "Compliance finding events",
    label: "Compliance finding",
    kind: "compliance",
    columns: "entity_type,entity_id,document_id",
    extras: "actor_user_id",
  },
  {
    table: "erp_ai_duplicate_candidate_events",
    parent: "erp_ai_duplicate_candidates",
    name: "Duplicate candidate events",
    label: "Duplicate candidate",
    kind: "duplicate",
    columns: "entity_type_a,entity_id_a,entity_type_b,entity_id_b,source_document_id",
    extras: "actor_user_id",
  },
  {
    table: "erp_ai_field_suggestion_events",
    parent: "erp_ai_field_suggestions",
    name: "AI field suggestion events",
    label: "AI field suggestion",
    kind: "field_suggestion",
    columns: "entity_type,entity_id",
    extras: "actor_user_id",
  },
] as const;

type EventRow = {
  id: number;
  event_type: string | null;
  created_at: string;
  actor_id?: number | null;
  actor_user_id?: number | null;
  prior_risk_level?: string | null;
  new_risk_level?: string | null;
  subject: Record<string, unknown>;
};

export async function collectAiEventTimeline(
  scope: AuditExplainerScope,
  entityType?: string,
  entityId?: number,
  limit = 30,
): Promise<{ items: AiEventTimelineItem[]; unavailableSources: string[] }> {
  const { type, id } = selectSubject(entityType, entityId);
  const context = await getAuthContext();
  if (!canUseApplication(context)) throw Error("Audit event access is unavailable.");
  const db = await createClient();
  const permissions = new Map<string, Promise<boolean>>();
  function canRead(ref: Subject): Promise<boolean> {
    const key = `${ref.type}:${ref.id}`;
    const existing = permissions.get(key);
    if (existing) return existing;
    const result = readAuthorizedAssistantEntity(ref.type, ref.id, { context, db }).then(Boolean);
    permissions.set(key, result);
    return result;
  }
  if (type && id !== undefined && !await canRead({ type, id })) return { items: [], unavailableSources: [] };

  const since = scopeToDate(scope);
  const results = await Promise.allSettled(eventSources.map(async source => {
    let query = db.from(source.table)
      .select(`id,event_type,created_at,${source.extras},subject:${source.parent}!inner(${source.columns})`, { count: "exact" })
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    const duplicate = source.kind === "duplicate";
    if (type && duplicate) {
      const values = subjectNames[type].join(",");
      const paired = (side: "a" | "b") => {
        const filter = `entity_type_${side}.in.(${values})`;
        return id === undefined ? filter : `and(${filter},entity_id_${side}.eq.${id})`;
      };
      query = query.or(`${paired("a")},${paired("b")}`, { referencedTable: "subject" });
    } else if (type) {
      query = query.in("subject.entity_type", [...subjectNames[type]]);
      if (id !== undefined) query = query.eq("subject.entity_id", id);
    }

    const { data } = await verifiedPreview(
      query as unknown as PromiseLike<{ data: EventRow[] | null; error: unknown; count: number | null }>, limit,
    );
    const sourceItems: AiEventTimelineItem[] = [];
    for (const row of data) {
      const parent = row.subject;
      if (!parent) throw Error("AI event subject could not be verified.");
      const first = subjectReference(duplicate ? parent.entity_type_a : parent.entity_type, duplicate ? parent.entity_id_a : parent.entity_id);
      const second = duplicate ? subjectReference(parent.entity_type_b, parent.entity_id_b) : null;
      const relatedDocumentId = duplicate ? parent.source_document_id : parent.document_id;
      const relatedDocument = relatedDocumentId == null ? null : subjectReference("dms_document", relatedDocumentId);
      if (!first || (duplicate && (parent.entity_type_b != null || parent.entity_id_b != null) && !second) ||
          (relatedDocumentId != null && !relatedDocument)) continue;
      const subjects = [first, second].filter((ref): ref is Subject => ref !== null);
      const attributed = type ? subjects.find(ref => ref.type === type && (id === undefined || ref.id === id)) : first;
      if (!attributed) continue;

      const visible = await Promise.all([...subjects, ...(relatedDocument ? [relatedDocument] : [])].map(canRead));
      if (visible.some(allowed => !allowed)) continue;
      const actor = row.actor_id ?? row.actor_user_id ?? undefined;
      sourceItems.push({
        id: row.id,
        source: "ai_event_group",
        entityType: attributed.type,
        entityId: attributed.id,
        action: row.event_type ?? "updated",
        actorId: actor,
        occurredAt: row.created_at,
        safeLabel: `${source.label} ${row.event_type ?? "updated"}`,
        safeDetail: row.prior_risk_level && row.new_risk_level ? `${row.prior_risk_level} → ${row.new_risk_level}` : undefined,
        aiSource: source.kind,
      });
    }
    return sourceItems;
  }));
  const items = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  return {
    items: items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id).slice(0, limit),
    unavailableSources: eventSources.flatMap((source, index) => results[index].status === "rejected" ? [source.name] : []),
  };
}

// ── DMS event timeline ─────────────────────────────────────────────────────────

export async function collectDmsEventTimeline(
  scope: AuditExplainerScope,
  documentId?: number,
  limit = 20
): Promise<AuditTimelineItem[]> {
  const supabase = await createClient();
  const since = scopeToDate(scope);

  let query = supabase
    .from("dms_document_events")
    .select("id, document_id, event_type, description, performed_by, performed_at", {count:"exact"})
    .gte("performed_at", since)
    .order("performed_at", { ascending: false })
    .limit(limit);

  if (documentId) {
    query = query.eq("document_id", documentId);
  }

  const { data } = await verifiedPreview(query.order("id",{ascending:false}),limit);

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

async function collectAuthorizedDocumentTimeline(scope: AuditExplainerScope, id?: number) {
  const context = await getAuthContext();
  const db = await createClient();
  if (id !== undefined) {
    if (!await readAuthorizedAssistantEntity("dms_document", id, { context, db })) return [];
    return collectDmsEventTimeline(scope, id, 20);
  }
  const events = await collectDmsEventTimeline(scope, undefined, 20);
  const checked = new Map<number, boolean>();
  const visible: AuditTimelineItem[] = [];
  for (const event of events) {
    if (event.entityId === undefined) continue;
    if (!checked.has(event.entityId)) {
      checked.set(event.entityId, !!await readAuthorizedAssistantEntity("dms_document", event.entityId, { context, db }));
    }
    if (checked.get(event.entityId)) visible.push(event);
  }
  return visible;
}

// ── Combined overview ──────────────────────────────────────────────────────────

export async function collectAuditExplainerOverview(
  scope: AuditExplainerScope,
  entityType?: string,
  entityId?: number
): Promise<{ timeline: AuditTimelineItem[]; totalEvents: number; entityBreakdown: Record<string, number>; actionBreakdown: Record<string, number>; unavailableSources: string[] }> {
  const { type, id } = selectSubject(entityType, entityId);
  const includeDocumentEvents = type === "dms_document";
  const [audit, ai, dms] = await Promise.allSettled([
    collectAuditLogEntries(scope, type, id, 30),
    collectAiEventTimeline(scope, type, id, 20),
    includeDocumentEvents
      ? collectAuthorizedDocumentTimeline(scope, id)
      : Promise.resolve([] as AuditTimelineItem[]),
  ]);
  const auditItems = audit.status === "fulfilled" ? audit.value : [];
  const aiItems = ai.status === "fulfilled" ? ai.value.items : [];
  const dmsItems = dms.status === "fulfilled" ? dms.value : [];
  const unavailableSources = [
    ...(audit.status === "rejected" ? ["Audit log"] : []),
    ...(ai.status === "fulfilled" ? ai.value.unavailableSources : ["AI events"]),
    ...(dms.status === "rejected" ? ["Document events"] : []),
  ];

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
    unavailableSources,
  };
}
