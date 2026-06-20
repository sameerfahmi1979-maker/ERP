"use server";

/**
 * ERP COMMON AI.13 — AI Daily Dashboard Server Actions
 *
 * Read-only aggregation over existing ERP scope.
 * No mutations. No AI provider call. No future module tables.
 * No raw OCR / content_text / prompt / AI response / API key exposure.
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { buildDailyDashboardSummary } from "@/lib/ai/common/dashboard/dashboard-summary";
import type {
  DailyDashboardScope,
  DailyDashboardSummary,
  DashboardPermissionState,
  DashboardSection,
  DashboardSectionCode,
} from "@/lib/ai/common/dashboard/types";
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
} from "@/lib/ai/common/dashboard/dashboard-collectors";
import { getDashboardSectionLink } from "@/lib/ai/common/dashboard/dashboard-links";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Feature flag check ─────────────────────────────────────────────────────────

export async function isAiDailyDashboardEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_DAILY_DASHBOARD")
      .single();
    return data?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Permission helpers ─────────────────────────────────────────────────────────

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

function buildPermissionState(ctx: AuthCtx): DashboardPermissionState {
  const isAdmin = ctx.roleCodes.includes("system_admin");
  const isDashboardAdmin =
    hasPermission(ctx, "ai.dashboard.admin") || isAdmin;

  return {
    canViewRisk:
      hasPermission(ctx, "ai.risk.view") ||
      hasPermission(ctx, "ai.common.admin") ||
      isAdmin,
    canViewCompliance:
      hasPermission(ctx, "ai.compliance.view") ||
      hasPermission(ctx, "ai.common.admin") ||
      isAdmin,
    canViewDuplicates:
      hasPermission(ctx, "ai.duplicates.view") ||
      hasPermission(ctx, "ai.common.admin") ||
      isAdmin,
    canViewFieldSuggestions:
      hasPermission(ctx, "ai.common.view") ||
      hasPermission(ctx, "ai.common.admin") ||
      isAdmin,
    canViewDms:
      hasPermission(ctx, "dms.documents.view") ||
      isAdmin,
    canViewAssistant:
      hasPermission(ctx, "ai.assistant.view") ||
      hasPermission(ctx, "ai.assistant.admin") ||
      isAdmin,
    canViewSearch:
      hasPermission(ctx, "ai.search.view") ||
      hasPermission(ctx, "ai.search.use") ||
      isAdmin,
    canViewUsage: isDashboardAdmin,
    canViewFlags: isDashboardAdmin,
  };
}

function canViewDashboard(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, "ai.dashboard.view") ||
    hasPermission(ctx, "ai.dashboard.admin") ||
    hasPermission(ctx, "ai.common.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Main action: full dashboard ────────────────────────────────────────────────

export async function getAiDailyDashboard(input?: {
  scope?: DailyDashboardScope;
}): Promise<ActionResult<DailyDashboardSummary>> {
  try {
    const ctx = await getAuthContext();

    if (!canViewDashboard(ctx)) {
      return { success: false, error: "Insufficient permissions to view AI Dashboard." };
    }

    const scope: DailyDashboardScope = input?.scope ?? "today";
    const permissions = buildPermissionState(ctx);
    const userId = ctx.profile?.id ?? 0;

    const summary = await buildDailyDashboardSummary(scope, permissions, userId);

    return { success: true, data: summary };
  } catch (err) {
    return { success: false, error: `Failed to load dashboard: ${String(err)}` };
  }
}

// ── Single section load ────────────────────────────────────────────────────────

export async function getAiDailyDashboardSection(input: {
  sectionCode: DashboardSectionCode;
  scope?: DailyDashboardScope;
}): Promise<ActionResult<DashboardSection>> {
  try {
    const ctx = await getAuthContext();

    if (!canViewDashboard(ctx)) {
      return { success: false, error: "Insufficient permissions." };
    }

    const scope: DailyDashboardScope = input.scope ?? "today";
    const permissions = buildPermissionState(ctx);
    const userId = ctx.profile?.id ?? 0;
    const link = getDashboardSectionLink(input.sectionCode);

    let section: DashboardSection;

    switch (input.sectionCode) {
      case "risk": {
        const result = permissions.canViewRisk ? await collectRiskKpis(scope) : null;
        section = {
          code: "risk",
          title: "Risk Overview",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewRisk,
          isLoaded: true,
        };
        break;
      }
      case "compliance": {
        const result = permissions.canViewCompliance ? await collectComplianceKpis(scope) : null;
        section = {
          code: "compliance",
          title: "Compliance Overview",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewCompliance,
          isLoaded: true,
        };
        break;
      }
      case "duplicates": {
        const result = permissions.canViewDuplicates ? await collectDuplicateKpis(scope) : null;
        section = {
          code: "duplicates",
          title: "Duplicate / Conflict Overview",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewDuplicates,
          isLoaded: true,
        };
        break;
      }
      case "field_suggestions": {
        const result = permissions.canViewFieldSuggestions ? await collectFieldSuggestionKpis(scope) : null;
        section = {
          code: "field_suggestions",
          title: "AI Field Suggestions",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          hasPermission: permissions.canViewFieldSuggestions,
          isLoaded: true,
        };
        break;
      }
      case "dms_processing": {
        const result = permissions.canViewDms ? await collectDmsProcessingKpis(scope) : null;
        section = {
          code: "dms_processing",
          title: "DMS Processing Health",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewDms,
          isLoaded: true,
        };
        break;
      }
      case "assistant_activity": {
        const result = permissions.canViewAssistant ? await collectAssistantKpis(scope) : null;
        section = {
          code: "assistant_activity",
          title: "AI Assistant Activity",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewAssistant,
          isLoaded: true,
        };
        break;
      }
      case "search_activity": {
        const result = permissions.canViewSearch ? await collectSearchKpis(scope, userId) : null;
        section = {
          code: "search_activity",
          title: "AI Search Activity",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewSearch,
          isLoaded: true,
        };
        break;
      }
      case "ai_usage": {
        const result = permissions.canViewUsage ? await collectAiUsageKpis(scope) : null;
        section = {
          code: "ai_usage",
          title: "AI Usage Summary",
          kpis: result?.kpis ?? [],
          alerts: [],
          link,
          hasPermission: permissions.canViewUsage,
          isLoaded: true,
        };
        break;
      }
      case "feature_flags": {
        const result = permissions.canViewFlags ? await collectFeatureFlagKpis() : null;
        section = {
          code: "feature_flags",
          title: "Feature Flag Health",
          kpis: result?.kpis ?? [],
          alerts: result?.alerts ?? [],
          link,
          hasPermission: permissions.canViewFlags,
          isLoaded: true,
        };
        break;
      }
      default:
        return { success: false, error: "Unknown section code." };
    }

    return { success: true, data: section };
  } catch (err) {
    return { success: false, error: `Failed to load section: ${String(err)}` };
  }
}
