/**
 * Public Verification System — Core Types
 * Phase: BRANDING.6 — Public QR Verification System
 *
 * These types are safe to use in both server and client code.
 * They must never include internal DB IDs in public-facing structures.
 */

// ─────────────────────────────────────────────────────────────────────────────
// DB row types (server-only use)
// ─────────────────────────────────────────────────────────────────────────────

export type OutputPublicLinkStatus =
  | "valid"
  | "expired"
  | "cancelled"
  | "superseded";

export type OutputPublicLinkAccessLevel =
  | "verify_only"
  | "summary"
  | "full_view"
  | "full_view_download_ready";

export type OutputPublicLinkOutputType =
  | "report"
  | "letter"
  | "certificate"
  | "form"
  | "external_submission"
  | "executive_ledger"
  | "other";

/** Internal DB row shape — never serialize to client directly */
export interface OutputPublicLink {
  id: number;
  public_token: string;
  public_url_path: string;
  output_type: OutputPublicLinkOutputType;
  source_module: string;
  source_entity_type?: string | null;
  source_entity_id?: number | null;
  source_record_ref?: string | null;
  document_title: string;
  document_subtitle?: string | null;
  document_ref?: string | null;
  document_date?: string | null;
  owner_company_id?: number | null;
  branding_profile_id?: number | null;
  template_id?: number | null;
  report_run_id?: number | null;
  issued_by_user_profile_id?: number | null;
  issued_at: string;
  expires_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_profile_id?: number | null;
  cancel_reason?: string | null;
  superseded_by_link_id?: number | null;
  status: OutputPublicLinkStatus;
  access_level: OutputPublicLinkAccessLevel;
  verification_summary_json: Record<string, unknown>;
  public_payload_json: Record<string, unknown>;
  download_file_path?: string | null;
  download_file_mime_type?: string | null;
  download_file_name?: string | null;
  download_enabled: boolean;
  view_count: number;
  last_viewed_at?: string | null;
  created_at: string;
  created_by?: number | null;
  updated_at: string;
  updated_by?: number | null;
  deleted_at?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input types for creating / managing links (server-side)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateOutputPublicLinkInput {
  output_type: OutputPublicLinkOutputType;
  source_module: string;
  source_entity_type?: string | null;
  source_entity_id?: number | null;
  source_record_ref?: string | null;
  document_title: string;
  document_subtitle?: string | null;
  document_ref?: string | null;
  document_date?: string | null;
  owner_company_id?: number | null;
  branding_profile_id?: number | null;
  template_id?: number | null;
  report_run_id?: number | null;
  expires_at?: string | null;
  access_level?: OutputPublicLinkAccessLevel;
  /** Safe pre-sanitized summary fields */
  verification_summary?: Record<string, string | null>;
  /** Safe pre-sanitized public payload */
  public_payload?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public response type (returned to /verify/[token] page)
// NO internal IDs are included
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicVerificationResult {
  status: OutputPublicLinkStatus;
  access_level: OutputPublicLinkAccessLevel;
  output_type: OutputPublicLinkOutputType;
  document_title: string;
  document_subtitle?: string | null;
  document_ref?: string | null;
  document_date?: string | null;
  issued_at: string;
  expires_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  verification_summary: Record<string, unknown>;
  public_payload: Record<string, unknown>;
  download_enabled: boolean;
  /** Token of the superseding link (for "View new version" link) */
  superseded_by_token?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe summary field allowlist
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe fields that may appear in verification_summary_json.
 * Keep this narrow — only business-safe, non-sensitive fields.
 */
export const SAFE_SUMMARY_FIELDS = [
  "document_type",
  "document_title",
  "document_ref",
  "document_date",
  "issuing_company",
  "issuing_company_trn",
  "subject_name",
  "subject_role",
  "valid_from",
  "valid_until",
  "issued_by_name",
  "issued_by_role",
  "description",
  "status",
] as const;

export type SafeSummaryField = (typeof SAFE_SUMMARY_FIELDS)[number];
