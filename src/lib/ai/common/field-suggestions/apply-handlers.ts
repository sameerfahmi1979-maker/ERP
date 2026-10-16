/**
 * ERP COMMON AI.1E — Apply Handlers
 *
 * Retains handler keys while reviewed writes use the apply-engine transactions.
 *
 * Rules:
 * - Only registered AI-eligible fields may be updated.
 * - FK fields (office_emirate_id, office_city_id) are BLOCKED in Phase 1E.
 *   Numeric FK resolution requires a safe lookup step — deferred to Phase 1F+.
 * - Company and party/child writes use accepted-suggestion transactions.
 * - These compatibility handlers never write target records directly.
 * - No auto-apply — these handlers are called only from the apply engine,
 *   which verifies suggestion status = "accepted" before calling.
 * - No prompt/OCR/evidence text is written to target tables.
 * - No audit fields (created_at, updated_at, deleted_at, etc.) are written.
 */

import type { ErpAiFieldType } from "../types";

// ── Apply handler result ──────────────────────────────────────────────────────

export interface ApplyHandlerResult {
  success: boolean;
  /** Safe message for event_data_json and client (no raw values). */
  message: string;
  /** The (sanitized) old value before update — for audit only. */
  oldValue?: string | null;
}

// ── Handler function type ─────────────────────────────────────────────────────

type ApplyHandlerFn = (input: {
  entityId: number;
  suggestedValue: string | null;
  fieldType: ErpAiFieldType;
  maxLength?: number;
  allowClear?: boolean;
}) => Promise<ApplyHandlerResult>;

// ── Handler registry ──────────────────────────────────────────────────────────

/**
 * Maps applyHandlerKey → ApplyHandlerFn.
 * Only Stage 1 handlers are implemented.
 * FK handlers are intentionally absent (blocked in 1E).
 */
export const APPLY_HANDLER_REGISTRY: Readonly<
  Record<string, ApplyHandlerFn>
> = {
  // ── Company (owner_companies) ─────────────────────────────────────────────

  apply_owner_company_trade_name: reviewedCompanyOnly,
  apply_owner_company_main_activity: reviewedCompanyOnly,
  apply_owner_company_established_date: reviewedCompanyOnly,
  apply_owner_company_office_address_line_1: reviewedCompanyOnly,
  apply_owner_company_office_address_line_2: reviewedCompanyOnly,

  // FK fields — blocked in Phase 1E
  apply_owner_company_office_emirate_id: makeFkBlockedHandler("office_emirate_id"),
  apply_owner_company_office_city_id: makeFkBlockedHandler("office_city_id"),

  // ── Party (parties) ───────────────────────────────────────────────────────

  // The engine routes these through the accepted-suggestion transaction.
  // Retain registry keys for older suggestions, but never a generic write path.
  apply_party_display_name: reviewedPartyOnly,
  apply_party_legal_name_en: reviewedPartyOnly,
  apply_party_legal_name_ar: reviewedPartyOnly,
  apply_party_primary_email: reviewedPartyOnly,
  apply_party_primary_phone: reviewedPartyOnly,
  apply_party_website: reviewedPartyOnly,

  // ── Party child tables ─────────────────────────────────────────────────────

  apply_party_tax_registration_trn: reviewedPartyOnly,
  apply_party_license_license_number: reviewedPartyOnly,
  apply_party_license_expiry_date: reviewedPartyOnly,
};

// ── Generic column handlers ───────────────────────────────────────────────────

const reviewedPartyMessage='Party fields require an accepted suggestion and its atomic application transaction.';
async function reviewedPartyOnly():Promise<ApplyHandlerResult>{return {success:false,message:reviewedPartyMessage};}
async function reviewedCompanyOnly():Promise<ApplyHandlerResult>{return {success:false,message:'Company fields require their reviewed suggestion and atomic application transaction.'};}


/** Blocked FK handler — returns controlled error. */
function makeFkBlockedHandler(fieldName: string): ApplyHandlerFn {
  return async () => ({
    success: false,
    message: `FK field "${fieldName}" cannot be applied automatically in Phase 1E. Numeric ID resolution requires manual selection. Please update this field manually.`,
  });
}
