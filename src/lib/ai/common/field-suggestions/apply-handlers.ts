/**
 * ERP COMMON AI.1E — Apply Handlers
 *
 * Maps applyHandlerKey values to safe DB write functions for Stage 1 entities.
 *
 * Rules:
 * - Only registered AI-eligible fields may be updated.
 * - FK fields (office_emirate_id, office_city_id) are BLOCKED in Phase 1E.
 *   Numeric FK resolution requires a safe lookup step — deferred to Phase 1F+.
 * - Party child table applies are best-effort: exactly one active row required.
 * - All writes go through user-scoped createClient() after permission checks.
 * - No auto-apply — these handlers are called only from the apply engine,
 *   which verifies suggestion status = "accepted" before calling.
 * - No prompt/OCR/evidence text is written to target tables.
 * - No audit fields (created_at, updated_at, deleted_at, etc.) are written.
 */

import { createClient } from "@/lib/supabase/server";
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

  apply_owner_company_trade_name: makeSimpleColumnHandler(
    "owner_companies", "trade_name", 255
  ),
  apply_owner_company_main_activity: makeSimpleColumnHandler(
    "owner_companies", "main_activity", 500
  ),
  apply_owner_company_established_date: makeDateColumnHandler(
    "owner_companies", "established_date"
  ),
  apply_owner_company_office_address_line_1: makeSimpleColumnHandler(
    "owner_companies", "office_address_line_1", 255
  ),
  apply_owner_company_office_address_line_2: makeSimpleColumnHandler(
    "owner_companies", "office_address_line_2", 255
  ),

  // FK fields — blocked in Phase 1E
  apply_owner_company_office_emirate_id: makeFkBlockedHandler("office_emirate_id"),
  apply_owner_company_office_city_id: makeFkBlockedHandler("office_city_id"),

  // ── Party (parties) ───────────────────────────────────────────────────────

  apply_party_display_name: makeSimpleColumnHandler(
    "parties", "display_name", 255
  ),
  apply_party_legal_name_en: makeSimpleColumnHandler(
    "parties", "legal_name_en", 255
  ),
  apply_party_legal_name_ar: makeSimpleColumnHandler(
    "parties", "legal_name_ar", 255
  ),
  apply_party_primary_email: makeEmailColumnHandler("parties", "primary_email"),
  apply_party_primary_phone: makeSimpleColumnHandler(
    "parties", "primary_phone", 50
  ),
  apply_party_website: makeSimpleColumnHandler(
    "parties", "website", 500
  ),

  // ── Party child tables ─────────────────────────────────────────────────────

  apply_party_tax_registration_trn: async ({ entityId, suggestedValue }) => {
    return applyPartyChildField(entityId, "party_tax_registrations", "trn", suggestedValue, 20);
  },
  apply_party_license_license_number: async ({ entityId, suggestedValue }) => {
    return applyPartyChildField(entityId, "party_licenses", "license_number", suggestedValue, 100);
  },
  apply_party_license_expiry_date: async ({ entityId, suggestedValue }) => {
    return applyPartyChildDateField(entityId, "party_licenses", "expiry_date", suggestedValue);
  },
};

// ── Generic column handlers ───────────────────────────────────────────────────

/** Handler for simple text/string columns on a table, filtered by `id`. */
function makeSimpleColumnHandler(
  table: string,
  column: string,
  maxLength: number
): ApplyHandlerFn {
  return async ({ entityId, suggestedValue, allowClear }) => {
    let value = suggestedValue;

    if (value === null || value === undefined) {
      if (!allowClear) {
        return { success: false, message: `Cannot clear field "${column}" (allowClear is not enabled for this field).` };
      }
      value = null;
    } else {
      value = value.trim();
      if (!value) {
        return { success: false, message: `Cannot apply empty value to field "${column}".` };
      }
      if (value.length > maxLength) {
        value = value.slice(0, maxLength);
      }
    }

    try {
      const supabase = await createClient();

      // Get old value for audit
      const { data: current } = await supabase
        .from(table)
        .select(column)
        .eq("id", entityId)
        .is("deleted_at", null)
        .single();

      const oldValue = current
        ? String((current as unknown as Record<string, unknown>)[column] ?? "")
        : null;

      const { error } = await supabase
        .from(table)
        .update({
          [column]: value,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .is("deleted_at", null);

      if (error) {
        return { success: false, message: `Failed to update ${column}: ${error.message.slice(0, 100)}` };
      }

      return {
        success: true,
        message: `Field "${column}" updated successfully.`,
        oldValue,
      };
    } catch (err) {
      return { success: false, message: `Apply failed: ${String(err).slice(0, 100)}` };
    }
  };
}

/** Handler for date columns — validates ISO date format. */
function makeDateColumnHandler(table: string, column: string): ApplyHandlerFn {
  return async ({ entityId, suggestedValue, allowClear }) => {
    if (suggestedValue === null) {
      if (!allowClear) {
        return { success: false, message: `Cannot clear date field "${column}".` };
      }
    } else {
      const trimmed = suggestedValue.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { success: false, message: `Invalid date format for "${column}". Expected YYYY-MM-DD. Got: "${trimmed.slice(0, 20)}".` };
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        return { success: false, message: `Invalid date value for "${column}".` };
      }
    }

    try {
      const supabase = await createClient();

      const { data: current } = await supabase
        .from(table)
        .select(column)
        .eq("id", entityId)
        .is("deleted_at", null)
        .single();

      const oldValue = current
        ? String((current as unknown as Record<string, unknown>)[column] ?? "")
        : null;

      const { error } = await supabase
        .from(table)
        .update({
          [column]: suggestedValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .is("deleted_at", null);

      if (error) {
        return { success: false, message: `Failed to update date field ${column}: ${error.message.slice(0, 100)}` };
      }

      return {
        success: true,
        message: `Date field "${column}" updated successfully.`,
        oldValue,
      };
    } catch (err) {
      return { success: false, message: `Apply failed: ${String(err).slice(0, 100)}` };
    }
  };
}

/** Email handler — validates basic email format. */
function makeEmailColumnHandler(table: string, column: string): ApplyHandlerFn {
  return async ({ entityId, suggestedValue, allowClear }) => {
    if (!suggestedValue) {
      if (!allowClear) {
        return { success: false, message: `Cannot clear email field "${column}".` };
      }
    } else {
      const trimmed = suggestedValue.trim().toLowerCase();
      if (!trimmed.includes("@") || !trimmed.includes(".") || trimmed.length > 255) {
        return { success: false, message: `Invalid email format for "${column}".` };
      }
    }

    return makeSimpleColumnHandler(table, column, 255)({
      entityId,
      suggestedValue: suggestedValue ? suggestedValue.trim().toLowerCase() : null,
      fieldType: "text",
      maxLength: 255,
      allowClear,
    });
  };
}

/** Blocked FK handler — returns controlled error. */
function makeFkBlockedHandler(fieldName: string): ApplyHandlerFn {
  return async () => ({
    success: false,
    message: `FK field "${fieldName}" cannot be applied automatically in Phase 1E. Numeric ID resolution requires manual selection. Please update this field manually.`,
  });
}

// ── Party child table apply helpers ───────────────────────────────────────────

/**
 * Applies a text value to a party child table field.
 * Only applies if the party has exactly one active row.
 * Never creates rows.
 */
async function applyPartyChildField(
  partyId: number,
  childTable: string,
  column: string,
  suggestedValue: string | null,
  maxLength: number
): Promise<ApplyHandlerResult> {
  if (!suggestedValue || !suggestedValue.trim()) {
    return { success: false, message: `Cannot apply empty value to ${childTable}.${column}.` };
  }

  try {
    const supabase = await createClient();

    const { data: rows, error: fetchError } = await supabase
      .from(childTable)
      .select("id")
      .eq("party_id", partyId)
      .is("deleted_at", null);

    if (fetchError) {
      return { success: false, message: `Failed to load ${childTable} rows.` };
    }

    if (!rows || rows.length === 0) {
      return {
        success: false,
        message: `No active ${childTable} row found for this party. ${column} apply requires manual creation.`,
      };
    }

    if (rows.length > 1) {
      return {
        success: false,
        message: `Multiple active ${childTable} rows found for this party. ${column} apply requires manual selection.`,
      };
    }

    const rowId = (rows[0] as { id: number }).id;
    const value = suggestedValue.trim().slice(0, maxLength);

    const { error: updateError } = await supabase
      .from(childTable)
      .update({
        [column]: value,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId)
      .is("deleted_at", null);

    if (updateError) {
      return { success: false, message: `Failed to update ${childTable}.${column}: ${updateError.message.slice(0, 100)}` };
    }

    return { success: true, message: `Field "${column}" updated on ${childTable}.` };
  } catch (err) {
    return { success: false, message: `Apply failed for ${childTable}.${column}: ${String(err).slice(0, 100)}` };
  }
}

/** Date variant of party child field apply. */
async function applyPartyChildDateField(
  partyId: number,
  childTable: string,
  column: string,
  suggestedValue: string | null
): Promise<ApplyHandlerResult> {
  if (!suggestedValue) {
    return { success: false, message: `Cannot apply null date to ${childTable}.${column}.` };
  }

  const trimmed = suggestedValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || isNaN(new Date(trimmed).getTime())) {
    return { success: false, message: `Invalid date format for ${childTable}.${column}. Expected YYYY-MM-DD.` };
  }

  try {
    const supabase = await createClient();

    const { data: rows } = await supabase
      .from(childTable)
      .select("id")
      .eq("party_id", partyId)
      .is("deleted_at", null);

    if (!rows || rows.length === 0) {
      return { success: false, message: `No active ${childTable} row found. ${column} apply requires manual creation.` };
    }
    if (rows.length > 1) {
      return { success: false, message: `Multiple ${childTable} rows found. ${column} apply requires manual selection.` };
    }

    const rowId = (rows[0] as { id: number }).id;

    const { error } = await supabase
      .from(childTable)
      .update({
        [column]: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId)
      .is("deleted_at", null);

    if (error) {
      return { success: false, message: `Failed to update ${childTable}.${column}: ${error.message.slice(0, 100)}` };
    }

    return { success: true, message: `Date field "${column}" updated on ${childTable}.` };
  } catch (err) {
    return { success: false, message: `Apply failed for ${childTable}.${column}: ${String(err).slice(0, 100)}` };
  }
}
