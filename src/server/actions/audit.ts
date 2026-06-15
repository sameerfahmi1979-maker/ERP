/**
 * Audit Logging Helper
 * 
 * Server-only utility for recording admin actions to the audit_logs table.
 * Must be called from server actions only.
 */

import { createClient } from "@/lib/supabase/server";
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
      console.error("logAudit: No authenticated user profile found");
      return { success: false, error: "No authenticated user" };
    }

    // Prepare audit log entry
    const auditEntry = {
      actor_user_profile_id: ctx.profile.id,
      owner_company_id: params.owner_company_id ?? ctx.profile.owner_company_id ?? null,
      branch_id: params.branch_id ?? ctx.profile.branch_id ?? null,
      module_code: params.module_code,
      entity_name: params.entity_name,
      entity_id: params.entity_id,
      entity_reference: params.entity_reference,
      action: params.action,
      old_values: params.old_values ?? null,
      new_values: params.new_values ?? null,
      ip_address: null, // TODO: Extract from request headers if needed
      user_agent: null, // TODO: Extract from request headers if needed
    };

    // Insert audit log
    const { error } = await supabase.from("audit_logs").insert(auditEntry);

    if (error) {
      console.error("logAudit: Failed to insert audit log", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("logAudit: Unexpected error", error);
    return { success: false, error: String(error) };
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
