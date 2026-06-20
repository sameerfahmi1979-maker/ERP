/**
 * ERP COMMON AI.6 — Signal Decorators
 *
 * Adds AI signal badges (risk, compliance, duplicate) to entity results.
 * Only adds badges when user has the corresponding permission.
 * Uses admin client only after permission checks — never weakens RLS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/rbac/check";
import type { ErpSearchResult, ErpSearchBadgeData, ErpSearchEntityType } from "./types";
import { hasPermission } from "@/lib/rbac/check";

type EntityGroup = {
  entityType: ErpSearchEntityType;
  ids: number[];
};

function groupByEntityType(results: ErpSearchResult[]): EntityGroup[] {
  const map = new Map<ErpSearchEntityType, Set<number>>();
  for (const r of results) {
    if (!r.entityType || r.resultType === "dms_document") continue;
    const set = map.get(r.entityType) ?? new Set<number>();
    set.add(r.entityId);
    map.set(r.entityType, set);
  }
  return Array.from(map.entries()).map(([entityType, ids]) => ({
    entityType,
    ids: Array.from(ids),
  }));
}

type EntityKey = `${ErpSearchEntityType}:${number}`;

function makeKey(entityType: ErpSearchEntityType, entityId: number): EntityKey {
  return `${entityType}:${entityId}`;
}

// ── Fetch risk scores ─────────────────────────────────────────────────────────

async function fetchRiskBadges(
  groups: EntityGroup[]
): Promise<Map<EntityKey, Pick<ErpSearchBadgeData, "riskLevel" | "riskScore">>> {
  const supabase = await createAdminClient();
  const map = new Map<EntityKey, Pick<ErpSearchBadgeData, "riskLevel" | "riskScore">>();

  for (const group of groups) {
    if (group.ids.length === 0) continue;
    const entityTypeName = group.entityType === "organization" ? "company" : group.entityType;

    const { data } = await supabase
      .from("erp_ai_risk_scores")
      .select("entity_id, risk_level, risk_score")
      .eq("entity_type", entityTypeName)
      .in("entity_id", group.ids)
      .is("deleted_at", null);

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const key = makeKey(group.entityType, r.entity_id as number);
      map.set(key, {
        riskLevel: (r.risk_level as ErpSearchBadgeData["riskLevel"]) ?? null,
        riskScore: typeof r.risk_score === "number" ? r.risk_score : null,
      });
    }
  }
  return map;
}

// ── Fetch compliance counts ───────────────────────────────────────────────────

async function fetchComplianceBadges(
  groups: EntityGroup[]
): Promise<Map<EntityKey, Pick<ErpSearchBadgeData, "openComplianceCount" | "criticalComplianceCount">>> {
  const supabase = await createAdminClient();
  const map = new Map<
    EntityKey,
    Pick<ErpSearchBadgeData, "openComplianceCount" | "criticalComplianceCount">
  >();

  for (const group of groups) {
    if (group.ids.length === 0) continue;
    const entityTypeName = group.entityType === "organization" ? "company" : group.entityType;

    const { data } = await supabase
      .from("erp_ai_compliance_findings")
      .select("entity_id, finding_severity, status")
      .eq("entity_type", entityTypeName)
      .in("entity_id", group.ids)
      .eq("status", "open")
      .is("deleted_at", null);

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const key = makeKey(group.entityType, r.entity_id as number);
      const existing = map.get(key) ?? { openComplianceCount: 0, criticalComplianceCount: 0 };
      existing.openComplianceCount = (existing.openComplianceCount ?? 0) + 1;
      if (r.finding_severity === "critical") {
        existing.criticalComplianceCount = (existing.criticalComplianceCount ?? 0) + 1;
      }
      map.set(key, existing);
    }
  }
  return map;
}

// ── Fetch duplicate counts ────────────────────────────────────────────────────

async function fetchDuplicateBadges(
  groups: EntityGroup[]
): Promise<Map<EntityKey, Pick<ErpSearchBadgeData, "pendingDuplicateCount">>> {
  const supabase = await createAdminClient();
  const map = new Map<EntityKey, Pick<ErpSearchBadgeData, "pendingDuplicateCount">>();

  for (const group of groups) {
    if (group.ids.length === 0) continue;

    const { data } = await supabase
      .from("erp_ai_duplicate_candidates")
      .select("entity_id_a, status")
      .eq("entity_type", group.entityType)
      .in("entity_id_a", group.ids)
      .eq("status", "pending")
      .is("deleted_at", null);

    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const key = makeKey(group.entityType, r.entity_id_a as number);
      const existing = map.get(key) ?? { pendingDuplicateCount: 0 };
      existing.pendingDuplicateCount = (existing.pendingDuplicateCount ?? 0) + 1;
      map.set(key, existing);
    }
  }
  return map;
}

// ── Main decorator ────────────────────────────────────────────────────────────

export async function decorateResultsWithSignals(
  results: ErpSearchResult[],
  ctx: AuthContext
): Promise<ErpSearchResult[]> {
  const canRisk = hasPermission(ctx, "ai.risk.view");
  const canCompliance = hasPermission(ctx, "ai.compliance.view");
  const canDuplicates = hasPermission(ctx, "ai.duplicates.view");

  if (!canRisk && !canCompliance && !canDuplicates) return results;

  const entityResults = results.filter(
    (r) => r.entityType && r.entityType !== "dms_document"
  );
  if (entityResults.length === 0) return results;

  const groups = groupByEntityType(entityResults);

  const [riskMap, complianceMap, duplicateMap] = await Promise.all([
    canRisk ? fetchRiskBadges(groups) : Promise.resolve(new Map()),
    canCompliance ? fetchComplianceBadges(groups) : Promise.resolve(new Map()),
    canDuplicates ? fetchDuplicateBadges(groups) : Promise.resolve(new Map()),
  ]);

  return results.map((result) => {
    if (!result.entityType || result.entityType === "dms_document") return result;
    const key = makeKey(result.entityType, result.entityId);

    const riskData = canRisk ? (riskMap.get(key) ?? {}) : {};
    const complianceData = canCompliance ? (complianceMap.get(key) ?? {}) : {};
    const duplicateData = canDuplicates ? (duplicateMap.get(key) ?? {}) : {};

    const badgeData: ErpSearchBadgeData = {
      ...result.badges,
      ...riskData,
      ...complianceData,
      ...duplicateData,
    };

    const hasBadge = Object.values(badgeData).some((v) => v != null);

    return {
      ...result,
      badges: hasBadge ? badgeData : result.badges,
    };
  });
}
