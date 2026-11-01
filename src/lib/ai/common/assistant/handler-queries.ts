/**
 * ERP COMMON AI.7 — Handler Queries
 *
 * Thin DB read helpers for action handlers.
 * All queries respect RLS. No mutations.
 */

import { createClient } from "@/lib/supabase/server";
import { readAuthorizedAssistantEntity, normalizeAssistantReference } from "./entity-access";
import type { AiEntityReference } from "@/lib/ai/foundation/contracts";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export class AssistantReadUnavailable extends Error {
  constructor() { super("The source read could not be verified"); }
}

async function requireSource(entityType: string, entityId: number, limit: number, permission: string) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new AssistantReadUnavailable();
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, permission) && !hasPermission(ctx, "ai.common.admin")) throw new AssistantReadUnavailable();
  const ref = normalizeAssistantReference(entityType, entityId);
  if (!ref || !await readAuthorizedAssistantEntity(ref.entityType, ref.entityId)) throw new AssistantReadUnavailable();
  return ref;
}

export interface ComplianceFindingLite {
  id: number;
  severity: string | null;
  finding_text: string | null;
  status: string | null;
}

export interface DuplicateCandidateLite {
  id: number;
  similarity_score: number | null;
  status: string | null;
  sourceReferences: AiEntityReference[];
}

export async function getComplianceFindingsForHandler(
  entityType: string,
  entityId: number,
  limit: number
): Promise<ComplianceFindingLite[]> {
  const ref = await requireSource(entityType, entityId, limit, "ai.compliance.view");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_compliance_findings")
    .select("id, severity, finding_type, ai_reason, recommended_action, status")
    .eq("entity_type", ref.entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .in("status", ["open", "pending_review"])
    .order("severity", { ascending: true })
    .limit(limit);

  if (error || !Array.isArray(data)) throw new AssistantReadUnavailable();
  return data.map(row => ({ id: row.id, severity: row.severity, finding_text: row.ai_reason ?? row.recommended_action ?? row.finding_type, status: row.status }));
}

export async function getDuplicateCandidatesForHandler(
  entityType: string,
  entityId: number,
  limit: number
): Promise<DuplicateCandidateLite[]> {
  const ref = await requireSource(entityType, entityId, limit, "ai.duplicates.view");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_duplicate_candidates")
    .select("id, confidence_score, status, entity_type_a, entity_id_a, entity_type_b, entity_id_b")
    .or(`and(entity_type_a.eq.${ref.entityType},entity_id_a.eq.${entityId}),and(entity_type_b.eq.${ref.entityType},entity_id_b.eq.${entityId})`)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("confidence_score", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) throw new AssistantReadUnavailable();
  const authorized = new Set([`${ref.entityType}:${ref.entityId}`]);
  const items: DuplicateCandidateLite[] = [];
  for (const row of data) {
    const a = normalizeAssistantReference(row.entity_type_a, row.entity_id_a);
    const b = normalizeAssistantReference(row.entity_type_b, row.entity_id_b);
    if (!a || !b || ![a, b].some(s => s.entityType === ref.entityType && s.entityId === ref.entityId)) throw new AssistantReadUnavailable();
    for (const source of [a, b]) {
      const key = `${source.entityType}:${source.entityId}`;
      if (authorized.has(key)) continue;
      if (authorized.size >= 5 || !await readAuthorizedAssistantEntity(source.entityType, source.entityId)) throw new AssistantReadUnavailable();
      authorized.add(key);
    }
    items.push({ id: row.id, similarity_score: row.confidence_score, status: row.status, sourceReferences: [a, b] });
  }
  return items;
}
