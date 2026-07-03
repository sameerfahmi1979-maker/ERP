/**
 * Global ERP Report Center — Type Definitions
 * Phase: REPORT.2 — Global Report Engine + Registry + Security Foundation
 *
 * All BIGINT IDs are typed as `number` (JavaScript/TypeScript safe integer range
 * is sufficient for this ERP's data volumes).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Template governance types (BRANDING.7)
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateGovernanceStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

export type TemplateSecurityReviewStatus =
  | "pending"
  | "passed"
  | "failed"
  | "skipped";

export type TemplateEventType =
  | "template_created"
  | "template_updated"
  | "template_submitted_for_review"
  | "template_approved"
  | "template_rejected"
  | "template_published"
  | "template_archived"
  | "template_new_version_created"
  | "template_security_review_failed"
  | "template_security_review_passed";

export interface ReportTemplateEvent {
  id: number;
  template_id: number;
  event_type: TemplateEventType;
  actor_user_profile_id: number | null;
  occurred_at: string;
  payload_json: Record<string, unknown>;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum-like string literal types
// ─────────────────────────────────────────────────────────────────────────────

export type ReportOutputFormat =
  | "screen"
  | "pdf"
  | "excel"
  | "csv"
  | "print"
  | "email";

export type ReportTemplateType =
  | "report"
  | "letter"
  | "certificate"
  | "form"
  | "checklist"
  | "badge"
  | "external_submission"
  | "group_summary";

export type ReportCategory =
  | "list"
  | "summary"
  | "detail"
  | "dashboard_snapshot"
  | "letter"
  | "certificate"
  | "form"
  | "checklist"
  | "compliance"
  | "audit"
  | "export"
  | "badge"
  | "external_submission"
  | "group_summary";

export type ReportBrandingStrategy =
  | "auto_by_owner_company"
  | "manual_required"
  | "group_default"
  | "template_fixed"
  | "none";

export type ReportSensitiveProfile =
  | "normal"
  | "payroll"
  | "medical"
  | "disciplinary"
  | "recruitment"
  | "dms_confidential"
  | "mixed_sensitive";

export type ReportRunStatus = "success" | "failed" | "cancelled" | "running";

export type ReportDeliveryStatus = "queued" | "sent" | "failed" | "cancelled";

export type ReportProfileType = "company" | "group" | "neutral" | "custom";

// ─────────────────────────────────────────────────────────────────────────────
// Database row shapes (mirrors DB columns)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportBrandingProfile {
  id: number;
  profile_code: string;
  profile_name: string;
  profile_type: ReportProfileType;
  owner_company_id: number | null;
  logo_url: string | null;
  small_logo_url: string | null;
  stamp_url: string | null;
  signature_url: string | null;
  watermark_url: string | null;
  watermark_text: string | null;
  theme_primary_color: string;
  theme_secondary_color: string;
  theme_header_bg_color: string;
  theme_header_text_color: string;
  legal_name_en: string | null;
  legal_name_ar: string | null;
  trade_name_en: string | null;
  trade_name_ar: string | null;
  address_block_en: string | null;
  address_block_ar: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  po_box: string | null;
  trn: string | null;
  trade_license_no: string | null;
  footer_text_en: string | null;
  footer_text_ar: string | null;
  signatory_name: string | null;
  signatory_title_en: string | null;
  signatory_title_ar: string | null;
  is_default_for_company: boolean;
  is_group_profile: boolean;
  is_neutral_profile: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
  /** Populated by listBrandingProfiles — true if an active asset exists in erp_branding_assets */
  has_report_logo?: boolean;
  has_stamp?: boolean;
  has_signature?: boolean;
  has_small_logo?: boolean;
}

export interface ReportTemplate {
  id: number;
  template_code: string;
  template_name: string;
  template_type: ReportTemplateType;
  branding_profile_id: number | null;
  default_orientation: "portrait" | "landscape";
  page_size: "a4" | "letter" | "legal";
  font_family: string;
  language_mode: "en" | "ar" | "bilingual";
  show_logo: boolean;
  show_small_logo: boolean;
  show_address: boolean;
  show_trn: boolean;
  show_license: boolean;
  show_signatory: boolean;
  show_stamp: boolean;
  show_watermark: boolean;
  requires_stamp_permission: boolean;
  watermark_text: string | null;
  body_html_en: string | null;
  body_html_ar: string | null;
  custom_css: string | null;
  header_layout_json: Record<string, unknown>;
  footer_layout_json: Record<string, unknown>;
  body_layout_json: Record<string, unknown>;
  style_json: Record<string, unknown>;
  // Visual editor tracking (REPORT DESIGNER.1)
  visual_editor_engine: string | null;
  visual_layout_schema_version: number | null;
  visual_layout_updated_at: string | null;
  visual_layout_updated_by: number | null;
  version_no: number;
  is_default: boolean;
  is_active: boolean;
  // Governance (BRANDING.7)
  parent_template_id: number | null;
  governance_status: TemplateGovernanceStatus;
  submitted_at: string | null;
  submitted_by: number | null;
  approved_at: string | null;
  approved_by: number | null;
  approval_notes: string | null;
  rejected_at: string | null;
  rejected_by: number | null;
  rejection_reason: string | null;
  published_at: string | null;
  published_by: number | null;
  archived_at: string | null;
  archived_by: number | null;
  archive_reason: string | null;
  security_review_status: TemplateSecurityReviewStatus;
  security_review_notes: string | null;
  security_review_at: string | null;
  security_review_by: number | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
}

/** Template with its branding profile pre-joined */
export interface ResolvedReportTemplate extends ReportTemplate {
  branding_profile: ReportBrandingProfile | null;
}

export interface ReportRegistryEntry {
  id: number;
  report_code: string;
  report_name_en: string;
  report_name_ar: string | null;
  module_code: string;
  report_category: ReportCategory;
  description_en: string | null;
  description_ar: string | null;
  default_template_id: number | null;
  default_output_formats: ReportOutputFormat[];
  default_orientation: "portrait" | "landscape";
  branding_strategy: ReportBrandingStrategy;
  branding_source_path: string | null;
  required_permissions: string[];
  sensitive_profile: ReportSensitiveProfile;
  sensitive_field_rules_json: Record<string, unknown>;
  filter_schema_json: Record<string, unknown>;
  column_schema_json: Record<string, unknown>;
  supports_numbering: boolean;
  numbering_rule_code: string | null;
  supports_scheduling: boolean;
  is_letter_type: boolean;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Context describing which companies own the data rows being reported */
export interface ReportCompanyContext {
  /** Distinct owner_company_ids detected in the report data */
  ownerCompanyIds: number[];
  /** Whether rows span multiple owner companies */
  isMultiCompany: boolean;
  /** Whether a template must be selected manually by the user */
  requiresManualTemplateSelection: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report runner
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportRunRequest {
  reportCode: string;
  outputFormat: ReportOutputFormat;
  filters?: Record<string, unknown>;
  templateId?: number;
  ownerCompanyIds?: number[];
  requestedByUserId: number;
}

export interface ReportRunResult {
  success: boolean;
  runId?: number;
  runReference?: string;
  rowCount?: number;
  data?: ReportDataResult;
  error?: string;
  redactionSummary?: ReportRedactionSummary;
  requiresManualTemplateSelection?: boolean;
  resolvedBrandingProfileId?: number;
  resolvedTemplateId?: number;
}

export interface ReportDataResult {
  columns: string[];
  rows: Record<string, unknown>[];
  meta?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Redaction engine
// ─────────────────────────────────────────────────────────────────────────────

/** A single field that was redacted in the output */
export interface RedactedValue {
  field: string;
  action: "masked" | "removed" | "replaced";
  reason: string;
}

export interface ReportRedactionSummary {
  profile: ReportSensitiveProfile;
  totalFieldsRedacted: number;
  redactedFields: RedactedValue[];
  wasRedacted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher plug-in interface
// ─────────────────────────────────────────────────────────────────────────────

/** Contract every report fetcher must implement */
export interface ReportFetcher {
  reportCode: string;
  /** Called by the runner to fetch and return structured data */
  fetch(
    filters: Record<string, unknown>,
    permissionCodes: string[]
  ): Promise<ReportDataResult>;
}
