/**
 * OUTPUT.2 — Global Output Framework coordinator contracts.
 *
 * These types define the single official-document issuance path. Every
 * Class A–D output must flow through the coordinator (see
 * .cursor/rules/erp-output-framework-standard.mdc).
 */

import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";
import type { EffectiveOutputPolicy } from "./class-policy";

/** How the official PDF is produced. HTML mode is canonical (v6.1). */
export type OfficialRendererMode = "gotenberg_html" | "gotenberg_url";

/**
 * Contract every output data provider must implement.
 * A provider loads record data server-side (with permission enforcement and
 * redaction already applied) and returns the canonical document model.
 */
export interface OutputDataProvider {
  outputCode: string;
  load(input: {
    recordId: number;
    filters?: Record<string, unknown>;
    permissionCodes: string[];
  }): Promise<OutputProviderResult>;
}

export interface OutputProviderResult {
  /** Canonical Executive Ledger document (branding attached by coordinator). */
  document: ExecutiveLedgerDocument;
  /** Owning company of the record — drives branding + isolation checks. */
  ownerCompanyId: number;
  /** Human reference for the record (e.g. employee code). */
  recordRef: string;
  /** Document title used for links/history. */
  documentTitle: string;
  /** Normalized data snapshot for fingerprinting + audit. */
  dataSnapshot: Record<string, unknown>;
  /** Whether this data is sensitive (drives approval policy checks). */
  sensitive?: boolean;
}

export interface GenerateOfficialDocumentOptions {
  /** Client-supplied idempotency token (same token = same logical request). */
  clientRequestToken?: string;
  /** Extra provider filters (e.g. purpose for NOC). */
  filters?: Record<string, unknown>;
  /**
   * Language variant for catalog-defined official documents
   * (OFFICIAL DOCS.1). Validated against the definition's supported
   * languages. Defaults to "en".
   */
  language?: "en" | "ar" | "bilingual";
  /**
   * Allowlisted optional user inputs for catalog-defined documents
   * (e.g. NOC purpose). Zod-validated against the definition's declared
   * input fields — unknown keys are rejected.
   */
  inputs?: Record<string, string>;
  /** Explicit template selection (validated against governance). */
  templateId?: number;
  /** Create + activate the public QR verification link (policy permitting). */
  issueQr?: boolean;
  /**
   * Authorize a reissue when equal content already exists.
   * Without this, an equal-content request returns a warning outcome.
   */
  authorizeReissue?: boolean;
  /** Issuance this new document supersedes (one-directional). */
  supersedesIssuanceId?: number;
}

export type QrOutcome =
  | { status: "activated"; publicUrl: string; linkId: number }
  | { status: "not_requested" }
  | { status: "policy_forbids" }
  | { status: "activation_failed_retryable"; error: string };

export interface GenerateOfficialDocumentResult {
  success: true;
  issuanceId: number;
  lifecycleState: "issued";
  storagePath: string;
  fileName: string;
  /** SHA-256 of the exact stored bytes. */
  finalSha256: string;
  fileSizeBytes: number;
  downloadUrl: string | null;
  qr: QrOutcome;
  /** True when this request was answered from an existing idempotent issuance. */
  idempotentReplay: boolean;
  /** True when equal content existed and the caller authorized a reissue. */
  reissued: boolean;
  /** Official serial (present when class policy requires one). */
  serialNo: string | null;
  policy: EffectiveOutputPolicy;
}

export interface GenerateOfficialDocumentBlocked {
  success: false;
  blocked:
    | "permission_denied"
    | "not_registered"
    | "approval_required"
    | "duplicate_content_warning"
    | "validation_failed"
    | "render_failed_retryable"
    | "render_failed_terminal"
    | "reconciliation_required"
    | "company_isolation_violation";
  error: string;
  /** Present for duplicate_content_warning — the equal-content issuance. */
  existingIssuanceId?: number;
  /** Present for retryable failures. */
  issuanceId?: number;
}

export type GenerateOfficialDocumentOutcome =
  | GenerateOfficialDocumentResult
  | GenerateOfficialDocumentBlocked;
