// ERP COMMON AI.13 — Dashboard Summary Builder
// Combines all collector outputs into a single DTO.
// Read-only. No AI provider call. No mutations.

import type { DailyDashboardScope, DailyDashboardSummary, DashboardPermissionState, DashboardSection } from "./types";
import { getDashboardSectionLink } from "./dashboard-links";
import {
  collectRiskKpis,
  collectComplianceKpis,
  collectDuplicateKpis,
  collectFieldSuggestionKpis,
  collectDmsProcessingKpis,
  collectAssistantKpis,
  collectSearchKpis,
  collectAiUsageKpis,
  collectFeatureFlagKpis,
} from "./dashboard-collectors";

export async function buildDailyDashboardSummary(
  scope: DailyDashboardScope,
  permissions: DashboardPermissionState,
  userId: number
): Promise<DailyDashboardSummary> {
  const warnings: string[] = [];

  const [
    riskResult,
    complianceResult,
    duplicateResult,
    fieldSuggestionResult,
    dmsResult,
    assistantResult,
    searchResult,
    usageResult,
    flagResult,
  ] = await Promise.allSettled([
    permissions.canViewRisk ? collectRiskKpis(scope) : Promise.resolve(null),
    permissions.canViewCompliance ? collectComplianceKpis(scope) : Promise.resolve(null),
    permissions.canViewDuplicates ? collectDuplicateKpis(scope) : Promise.resolve(null),
    permissions.canViewFieldSuggestions ? collectFieldSuggestionKpis(scope) : Promise.resolve(null),
    permissions.canViewDms ? collectDmsProcessingKpis(scope) : Promise.resolve(null),
    permissions.canViewAssistant ? collectAssistantKpis(scope) : Promise.resolve(null),
    permissions.canViewSearch ? collectSearchKpis(scope, userId) : Promise.resolve(null),
    permissions.canViewUsage ? collectAiUsageKpis(scope) : Promise.resolve(null),
    permissions.canViewFlags ? collectFeatureFlagKpis() : Promise.resolve(null),
  ]);

  function unwrap<T>(r: PromiseSettledResult<T | null>, sectionName: string): T | null {
    if (r.status === "rejected") {
      warnings.push(`Failed to load ${sectionName}: ${String(r.reason)}`);
      return null;
    }
    return r.value;
  }

  const risk = unwrap(riskResult, "Risk");
  const compliance = unwrap(complianceResult, "Compliance");
  const duplicate = unwrap(duplicateResult, "Duplicates");
  const fieldSuggestion = unwrap(fieldSuggestionResult, "Field Suggestions");
  const dms = unwrap(dmsResult, "DMS Processing");
  const assistant = unwrap(assistantResult, "Assistant Activity");
  const search = unwrap(searchResult, "Search Activity");
  const usage = unwrap(usageResult, "AI Usage");
  const flags = unwrap(flagResult, "Feature Flags");

  const sections: DashboardSection[] = [
    {
      code: "risk",
      title: "Risk Overview",
      kpis: risk?.kpis ?? [],
      alerts: risk?.alerts ?? [],
      link: getDashboardSectionLink("risk"),
      hasPermission: permissions.canViewRisk,
      isLoaded: risk !== null || !permissions.canViewRisk,
    },
    {
      code: "compliance",
      title: "Compliance Overview",
      kpis: compliance?.kpis ?? [],
      alerts: compliance?.alerts ?? [],
      link: getDashboardSectionLink("compliance"),
      hasPermission: permissions.canViewCompliance,
      isLoaded: compliance !== null || !permissions.canViewCompliance,
    },
    {
      code: "duplicates",
      title: "Duplicate / Conflict Overview",
      kpis: duplicate?.kpis ?? [],
      alerts: duplicate?.alerts ?? [],
      link: getDashboardSectionLink("duplicates"),
      hasPermission: permissions.canViewDuplicates,
      isLoaded: duplicate !== null || !permissions.canViewDuplicates,
    },
    {
      code: "field_suggestions",
      title: "AI Field Suggestions",
      kpis: fieldSuggestion?.kpis ?? [],
      alerts: fieldSuggestion?.alerts ?? [],
      hasPermission: permissions.canViewFieldSuggestions,
      isLoaded: fieldSuggestion !== null || !permissions.canViewFieldSuggestions,
    },
    {
      code: "dms_processing",
      title: "DMS Processing Health",
      kpis: dms?.kpis ?? [],
      alerts: dms?.alerts ?? [],
      link: getDashboardSectionLink("dms_processing"),
      hasPermission: permissions.canViewDms,
      isLoaded: dms !== null || !permissions.canViewDms,
    },
    {
      code: "assistant_activity",
      title: "AI Assistant Activity",
      kpis: assistant?.kpis ?? [],
      alerts: assistant?.alerts ?? [],
      link: getDashboardSectionLink("assistant_activity"),
      hasPermission: permissions.canViewAssistant,
      isLoaded: assistant !== null || !permissions.canViewAssistant,
    },
    {
      code: "search_activity",
      title: "AI Search Activity",
      kpis: search?.kpis ?? [],
      alerts: search?.alerts ?? [],
      link: getDashboardSectionLink("search_activity"),
      hasPermission: permissions.canViewSearch,
      isLoaded: search !== null || !permissions.canViewSearch,
    },
    {
      code: "ai_usage",
      title: "AI Usage Summary",
      kpis: usage?.kpis ?? [],
      alerts: [],
      link: getDashboardSectionLink("ai_usage"),
      hasPermission: permissions.canViewUsage,
      isLoaded: usage !== null || !permissions.canViewUsage,
    },
    {
      code: "feature_flags",
      title: "Feature Flag Health",
      kpis: flags?.kpis ?? [],
      alerts: flags?.alerts ?? [],
      link: getDashboardSectionLink("feature_flags"),
      hasPermission: permissions.canViewFlags,
      isLoaded: flags !== null || !permissions.canViewFlags,
    },
  ];

  const topKpis = [
    ...(risk?.kpis.filter((k) => k.severity === "critical") ?? []),
    ...(compliance?.kpis.filter((k) => k.severity === "critical") ?? []),
  ].slice(0, 6);

  return {
    scope,
    generatedAt: new Date().toISOString(),
    kpis: topKpis,
    sections,
    permissionState: permissions,
    warnings,
  };
}
