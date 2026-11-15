/**
 * Audit Logging Helper
 * 
 * Server-only utility for recording admin actions to the audit_logs table.
 * Must be called from server actions only.
 */

import "server-only";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext } from "@/lib/rbac/check";

export type AuditLogParams = {
  module_code: string;
  entity_name: string;
  entity_id: number | null;
  entity_reference: string;
  action: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  owner_company_id?: number | null;
  branch_id?: number | null;
};

export type AuditLogResult = {
  success: boolean;
  error?: string;
};

/**
 * Log an audit entry for admin actions
 * 
 * @example
 * await logAudit({
 *   module_code: "organizations",
 *   entity_name: "owner_companies",
 *   entity_id: 123,
 *   entity_reference: "AGT-001",
 *   action: "create",
 *   new_values: { legal_name_en: "Alliance Group Tech", ... },
 *   owner_company_id: 123,
 * });
 */
export async function logAudit(params: AuditLogParams): Promise<AuditLogResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();

    // If no authenticated user, cannot log (should not happen in server actions)
    if (!ctx.profile?.id) {
      logger.error("logAudit: No authenticated user profile found");
      return { success: false, error: "No authenticated user" };
    }

    // Prepare audit log entry
    const claims = await supabase.auth.getClaims();
    const sessionId = claims.data?.claims.session_id;
    if (claims.error || typeof sessionId !== "string") {
      return { success: false, error: "Audit session unavailable" };
    }
    const companyId = params.owner_company_id === undefined ? ctx.profile.owner_company_id : params.owner_company_id;
    const auditEntry = {
      owner_company_id: companyId ?? null,
      branch_id: params.branch_id === undefined
        ? companyId === ctx.profile.owner_company_id ? ctx.profile.branch_id ?? null : null
        : params.branch_id,
      module_code: params.module_code,
      entity_name: params.entity_name,
      entity_id: params.entity_id,
      entity_reference: params.entity_reference,
      action: params.action,
      old_values: params.old_values ?? null,
      new_values: params.new_values ?? null,
      ip_address: await extractIpAddress(),
      user_agent: await extractUserAgent(),
    };

    // Insert audit log
    const { error } = await createAdminClient().rpc("append_erp_server_audit_event", {
      p_actor: ctx.profile.id,
      p_session: sessionId,
      p_event: auditEntry,
    });

    if (error) {
      logger.error("logAudit: Failed to insert audit log", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logger.error("logAudit: Unexpected error", error);
    return { success: false, error: String(error) };
  }
}

// ── Header extraction helpers ──────────────────────────────────────────────

async function extractIpAddress(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null
    );
  } catch {
    return null;
  }
}

async function extractUserAgent(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("user-agent") ?? null;
  } catch {
    return null;
  }
}

/**
 * Helper to create a clean diff for old_values/new_values
 * Filters out unchanged fields and internal metadata
 */
export function createAuditDiff<T extends Record<string, unknown>>(
  oldData: T | null,
  newData: T | null,
): { old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null } {
  // Fields to exclude from audit diffs
  const excludeFields = ["created_at", "updated_at", "id"];

  const old_values: Record<string, unknown> = {};
  const new_values: Record<string, unknown> = {};

  if (!oldData && newData) {
    // Create operation: record all new values
    for (const [key, value] of Object.entries(newData)) {
      if (!excludeFields.includes(key)) {
        new_values[key] = value;
      }
    }
    return { old_values: null, new_values };
  }

  if (oldData && !newData) {
    // Delete operation: record all old values
    for (const [key, value] of Object.entries(oldData)) {
      if (!excludeFields.includes(key)) {
        old_values[key] = value;
      }
    }
    return { old_values, new_values: null };
  }

  if (oldData && newData) {
    // Update operation: record only changed fields
    for (const [key, newValue] of Object.entries(newData)) {
      if (excludeFields.includes(key)) continue;
      
      const oldValue = oldData[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        old_values[key] = oldValue;
        new_values[key] = newValue;
      }
    }
    return {
      old_values: Object.keys(old_values).length > 0 ? old_values : null,
      new_values: Object.keys(new_values).length > 0 ? new_values : null,
    };
  }

  return { old_values: null, new_values: null };
}
