/**
 * Global ERP Report Center — Constants
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 */

import type {
  ReportOutputFormat,
  ReportTemplateType,
  ReportCategory,
  ReportBrandingStrategy,
  ReportSensitiveProfile,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Output formats
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_OUTPUT_FORMATS: ReportOutputFormat[] = [
  "screen",
  "pdf",
  "excel",
  "csv",
  "print",
  "email",
];

export const REPORT_OUTPUT_FORMAT_LABELS: Record<ReportOutputFormat, string> = {
  screen: "Screen",
  pdf: "PDF",
  excel: "Excel",
  csv: "CSV",
  print: "Print",
  email: "Email",
};

// ─────────────────────────────────────────────────────────────────────────────
// Template types
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_TEMPLATE_TYPES: ReportTemplateType[] = [
  "report",
  "letter",
  "certificate",
  "form",
  "checklist",
  "badge",
  "external_submission",
  "group_summary",
];

export const REPORT_TEMPLATE_TYPE_LABELS: Record<ReportTemplateType, string> = {
  report: "Report",
  letter: "Letter",
  certificate: "Certificate",
  form: "Form",
  checklist: "Checklist",
  badge: "Badge",
  external_submission: "External Submission",
  group_summary: "Group Summary",
};

// ─────────────────────────────────────────────────────────────────────────────
// Report categories
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_CATEGORIES: ReportCategory[] = [
  "list",
  "summary",
  "detail",
  "dashboard_snapshot",
  "letter",
  "certificate",
  "form",
  "checklist",
  "compliance",
  "audit",
  "export",
  "badge",
  "external_submission",
  "group_summary",
];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  list: "List",
  summary: "Summary",
  detail: "Detail",
  dashboard_snapshot: "Dashboard Snapshot",
  letter: "Letter",
  certificate: "Certificate",
  form: "Form",
  checklist: "Checklist",
  compliance: "Compliance",
  audit: "Audit",
  export: "Export",
  badge: "Badge",
  external_submission: "External Submission",
  group_summary: "Group Summary",
};

// ─────────────────────────────────────────────────────────────────────────────
// Branding strategies
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_BRANDING_STRATEGIES: ReportBrandingStrategy[] = [
  "auto_by_owner_company",
  "manual_required",
  "group_default",
  "template_fixed",
  "none",
];

export const REPORT_BRANDING_STRATEGY_LABELS: Record<
  ReportBrandingStrategy,
  string
> = {
  auto_by_owner_company: "Auto by Owner Company",
  manual_required: "Manual Selection Required",
  group_default: "Group Default",
  template_fixed: "Fixed Template",
  none: "No Branding",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sensitive profiles
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_SENSITIVE_PROFILES: ReportSensitiveProfile[] = [
  "normal",
  "payroll",
  "medical",
  "disciplinary",
  "recruitment",
  "dms_confidential",
  "mixed_sensitive",
];

export const REPORT_SENSITIVE_PROFILE_LABELS: Record<
  ReportSensitiveProfile,
  string
> = {
  normal: "Normal",
  payroll: "Payroll (Sensitive)",
  medical: "Medical (Sensitive)",
  disciplinary: "Disciplinary (Sensitive)",
  recruitment: "Recruitment (Sensitive)",
  dms_confidential: "DMS Confidential",
  mixed_sensitive: "Mixed Sensitive",
};

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_PERMISSIONS = {
  VIEW: "reports.view",
  RUN: "reports.run",
  EXPORT: "reports.export",
  EMAIL: "reports.email",
  MANAGE: "reports.manage",
  HISTORY_VIEW: "reports.history.view",
  SIGN: "reports.sign",
} as const;

export type ReportPermission =
  (typeof REPORT_PERMISSIONS)[keyof typeof REPORT_PERMISSIONS];

// ─────────────────────────────────────────────────────────────────────────────
// Default theme colors
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_REPORT_COLORS = {
  PRIMARY: "#1e293b",
  SECONDARY: "#475569",
  HEADER_BG: "#1e293b",
  HEADER_TEXT: "#ffffff",
  NEUTRAL_PRIMARY: "#374151",
  NEUTRAL_SECONDARY: "#6b7280",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Default template codes (seeded in REPORT.2 migration)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_REPORT_TEMPLATE_CODES = {
  DEFAULT_REPORT: "DEFAULT_REPORT_TEMPLATE",
  DEFAULT_LETTER: "DEFAULT_LETTER_TEMPLATE",
  DEFAULT_CERTIFICATE: "DEFAULT_CERTIFICATE_TEMPLATE",
  DEFAULT_FORM: "DEFAULT_FORM_TEMPLATE",
  DEFAULT_CHECKLIST: "DEFAULT_CHECKLIST_TEMPLATE",
  DEFAULT_BADGE: "DEFAULT_BADGE_TEMPLATE",
  DEFAULT_EXTERNAL_SUBMISSION: "DEFAULT_EXTERNAL_SUBMISSION_TEMPLATE",
  GROUP_REPORT: "GROUP_REPORT_TEMPLATE",
} as const;

export const NEUTRAL_BRANDING_PROFILE_CODE = "NEUTRAL_DEFAULT";
export const GROUP_BRANDING_PROFILE_CODE = "GROUP_DEFAULT";

/** Numbering rule code for report run references */
export const REPORT_RUN_NUMBERING_RULE = "REPORT_RUN";
