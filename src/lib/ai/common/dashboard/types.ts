// ERP COMMON AI.13 — AI Daily Dashboard Types
// Read-only aggregation types. No mutations. No future module tables.

export type DailyDashboardScope = "today" | "last_7_days" | "last_30_days";

export type DashboardSectionCode =
  | "risk"
  | "compliance"
  | "duplicates"
  | "field_suggestions"
  | "dms_processing"
  | "assistant_activity"
  | "search_activity"
  | "ai_usage"
  | "feature_flags";

export interface DashboardKpiCard {
  label: string;
  value: number | string;
  description?: string;
  severity?: "normal" | "warning" | "critical" | "info";
}

export interface DashboardAlertItem {
  id: number;
  label: string;
  sublabel?: string;
  severity?: "normal" | "warning" | "critical";
  navigationPath?: string;
}

export interface DashboardLink {
  label: string;
  path: string;
}

export interface DashboardPermissionState {
  canViewRisk: boolean;
  canViewCompliance: boolean;
  canViewDuplicates: boolean;
  canViewFieldSuggestions: boolean;
  canViewDms: boolean;
  canViewAssistant: boolean;
  canViewSearch: boolean;
  canViewUsage: boolean;
  canViewFlags: boolean;
}

export interface DashboardSection {
  code: DashboardSectionCode;
  title: string;
  kpis: DashboardKpiCard[];
  alerts: DashboardAlertItem[];
  link?: DashboardLink;
  hasPermission: boolean;
  isLoaded: boolean;
}

export interface DailyDashboardSummary {
  scope: DailyDashboardScope;
  generatedAt: string;
  kpis: DashboardKpiCard[];
  sections: DashboardSection[];
  permissionState: DashboardPermissionState;
  warnings: string[];
}

export interface GetAiDailyDashboardInput {
  scope?: DailyDashboardScope;
}

export interface GetAiDailyDashboardSectionInput {
  sectionCode: DashboardSectionCode;
  scope?: DailyDashboardScope;
}
