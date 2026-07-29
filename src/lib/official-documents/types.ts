/**
 * OFFICIAL DOCS.1 — Global Official Letters & Forms Generator.
 *
 * Typed, source-controlled, versioned document definitions. This module is the
 * SINGLE source of truth for official letter/form wording and layout:
 *
 * - No in-app editing of wording or layout (Report Designer is retired).
 * - Wording is migrated only from verified repository sources; documents with
 *   incomplete wording carry status `disabled_pending_wording` and can never
 *   be generated.
 * - Definitions plug into the existing Global Output Framework coordinator
 *   (generateOfficialDocument) — they replace only the HTML body construction,
 *   never numbering/QR/storage/hash/lifecycle.
 */

import type { ExportBrandingContext } from "@/lib/export/export-types";

/** Language variants a definition can support. */
export type OfficialDocumentLanguage = "en" | "ar" | "bilingual";

/** Approved bilingual layout strategies (Section 9 of the program prompt). */
export type BilingualLayoutType =
  | "narrative_two_column"
  | "bilingual_form_table"
  | "custom_approved_layout";

/**
 * Publication status of a code-based definition.
 *
 * - `published` — approved wording verified for every supported language; generatable.
 * - `draft` — implemented but not yet approved; NOT generatable.
 * - `disabled_pending_wording` — identity reserved in the catalog, wording not
 *   yet verified/approved; NOT generatable and clearly labeled in the UI.
 */
export type OfficialDocumentStatus = "published" | "draft" | "disabled_pending_wording";

/**
 * Where a piece of official wording came from, and its business-approval status.
 *
 * GOVERNANCE SEPARATION (OFFICIAL DOCS.1A-R2):
 * `provenance` describes the technical origin of the text.
 * `businessApprovalStatus` describes whether the business owner has explicitly approved it.
 * These are independent — verified code/migration/prompt provenance does NOT constitute
 * business approval for official issuance.
 */
export interface WordingEvidence {
  /** Repo-relative file (or migration) containing the exact source wording. */
  source: string;

  /**
   * PROVENANCE — technical origin of the wording text only.
   * None of these values alone constitute business approval.
   *
   * - `verified_code` — text exists in live production source code.
   * - `verified_migration` — text seeded by an applied DB migration.
   * - `verified_prompt` — text supplied verbatim by an approved business program prompt.
   * - `pending` — no verified source; must NOT be published.
   */
  provenance: "verified_code" | "verified_migration" | "verified_prompt" | "pending";

  /**
   * BUSINESS APPROVAL STATUS — whether the business owner has explicitly approved
   * this wording for official issuance. Separate from and independent of provenance.
   *
   * - `draft` — wording is implemented but not yet submitted for business approval.
   * - `pending_business_approval` — submitted; awaiting explicit decision.
   * - `approved` — explicit approval received from the business owner or authorized HR approver.
   * - `rejected` — business owner rejected; wording must be revised.
   * - `superseded` — replaced by a newer approved version.
   *
   * Only `approved` permits production activation as an official issued document.
   * Technical UAT in non-production environments may proceed under `pending_business_approval`
   * provided the production activation gate (OUTPUT_OFFICIAL_ISSUANCE_ENABLED) remains closed.
   */
  businessApprovalStatus: "draft" | "pending_business_approval" | "approved" | "rejected" | "superseded";

  /** Identifier (name/role) of the person who approved. Never fabricated. */
  approvedBy?: string;
  /** ISO date of approval. Never fabricated. */
  approvalDate?: string;
  /** Free-text approval notes or decision summary. */
  approvalNotes?: string;
  /** Ticket, email thread, or document reference for audit trail. */
  approvalReference?: string;

  note?: string;
}

/** A minimal, explicitly-allowlisted user input (addressee, purpose, …). */
export interface OfficialDocumentInputField {
  key: string;
  labelEn: string;
  labelAr?: string;
  type: "text" | "date";
  required: boolean;
  maxLength: number;
  placeholder?: string;
  helpText?: string;
}

/** One bilingual label/value row of a form-table block. */
export interface OfficialFormRow {
  labelEn: string;
  labelAr?: string;
  value: string;
  emphasized?: boolean;
  /** Render an empty signature/checkbox style cell instead of a value. */
  signatureCell?: boolean;
}

/**
 * Language-agnostic body blocks. For bilingual narrative documents each
 * paragraph block is a synchronized row: English left (LTR), Arabic right
 * (RTL), aligned by semantic row and paginated together.
 */
export type OfficialBodyBlock =
  | {
      kind: "paragraph";
      en?: string;
      ar?: string;
      /** Bold/centered emphasis, e.g. "TO WHOM IT MAY CONCERN". */
      emphasis?: "salutation" | "normal";
    }
  | { kind: "form_table"; titleEn?: string; titleAr?: string; rows: OfficialFormRow[] }
  | {
      kind: "checklist";
      titleEn?: string;
      titleAr?: string;
      items: { en: string; ar?: string }[];
      /** Adds Status / Remarks columns with blank fill-in cells. */
      withStatusColumns?: boolean;
    }
  | { kind: "spacer"; heightMm?: number };

/** Document metadata rows rendered under the title (e.g. employee identifiers). */
export interface OfficialMetaRow {
  labelEn: string;
  labelAr?: string;
  value: string;
}

/** The renderable document model a definition's `build()` returns. */
export interface OfficialDocumentModel {
  titleEn: string;
  titleAr?: string;
  /** e.g. "Issued on 28 July 2026" */
  subtitleEn?: string;
  subtitleAr?: string;
  meta?: OfficialMetaRow[];
  blocks: OfficialBodyBlock[];
  /** Closing block, e.g. issuer sign-off lines above the signature zone. */
  closingEn?: string;
  closingAr?: string;
  /** Render the signature/stamp zone (default true). */
  showSignature?: boolean;
}

/** Everything the layout engine needs to render one issuance. */
export interface OfficialDocumentRenderContext {
  /** Server-resolved data row from the registered output fetcher (first row). */
  row: Record<string, unknown>;
  /** All fetched rows — used by multi-row forms (checklists, clearance, PPE). */
  rows: Record<string, unknown>[];
  /** Zod-validated optional user inputs (only keys declared by the definition). */
  inputs: Record<string, string>;
  language: OfficialDocumentLanguage;
  branding?: ExportBrandingContext;
  verification?: { publicUrl: string; qrDataUrl: string; label?: string };
  serialNo?: string | null;
  /** Pre-formatted issue dates (server clock). */
  issuedDateEn: string;
  issuedDateAr: string;
  /** Draft watermark text for non-official previews; never set on official issuance. */
  watermarkText?: string;
}

/** A fixed, versioned, code-based official document definition. */
export interface OfficialDocumentDefinition {
  /** Must equal the erp_report_registry.report_code of the output. */
  documentCode: string;
  /** Template version — bump on ANY wording/layout change (never edit in place). */
  version: number;
  moduleCode: "HR";
  recordType: "employee";
  titleEn: string;
  titleAr?: string;
  businessPurpose: string;
  status: OfficialDocumentStatus;
  supportedLanguages: OfficialDocumentLanguage[];
  bilingualLayoutType?: BilingualLayoutType;
  /**
   * Row keys that must be present and non-empty before generation. Each key
   * can carry a precise, user-facing missing-data message.
   */
  requiredSourceFields: string[];
  missingFieldMessages?: Record<string, string>;
  optionalInputs: OfficialDocumentInputField[];
  /** Row keys classified sensitive (salary, identity, disciplinary…). */
  sensitiveFields: string[];
  wording: {
    en: WordingEvidence;
    ar?: WordingEvidence;
  };
  /**
   * Pure model builder. MUST NOT fetch data, call AI, or read the clock —
   * everything comes from the render context (deterministic + unit-testable).
   */
  build: (ctx: OfficialDocumentRenderContext) => OfficialDocumentModel;
}
