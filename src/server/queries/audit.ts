import { createClient } from "@/lib/supabase/server";
import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";
import { sanitizeSecurityAuditPayload } from "@/lib/audit/sanitizers";
import { literalContains } from "@/lib/reads/search";
import type { AuditLog } from "@/types/domain";

/**
 * List audit logs with filters
 * RLS-protected query
 */
export async function listAuditLogs(options?: {
  limit?: number;
  module?: string;
  action?: string;
  entity_id?: number;
  entity_name?: string;
  actor_user_profile_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}): Promise<AuditLog[]> {
  const supabase = await createClient();
  const { limit = 100, module, action, entity_id, entity_name, actor_user_profile_id, date_from, date_to, search } = options || {};
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error("Invalid history preview limit");

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (module) query = query.eq("module_code", module);
  if (action) query = query.eq("action", action);
  if (entity_id !== undefined) query = query.eq("entity_id", entity_id);
  if (entity_name) query = query.eq("entity_name", entity_name);
  if (actor_user_profile_id !== undefined) query = query.eq("actor_user_profile_id", actor_user_profile_id);
  if (date_from) query = query.gte("created_at", date_from);
  if (date_to) query = query.lte("created_at", date_to);
  if (search) query = query.or(`action.ilike.${literalContains(search)},entity_reference.ilike.${literalContains(search)}`);

  const { data, error } = await query;

  if (error) {
    const reference = reportSafeDiagnostic(error, { source: "dashboard", route: "/admin/audit", event: "AUDIT_HISTORY_UNAVAILABLE" });
    throw Error(`Audit history is unavailable. Reference: ${reference}`);
  }
  if (!Array.isArray(data)) throw Error("Audit history is unavailable");
  return data.map(row => ({...row, old_values:sanitizeSecurityAuditPayload(row.old_values),new_values:sanitizeSecurityAuditPayload(row.new_values)}));
}

/**
 * List audit logs for a specific user — for Security History section.
 * Returns events where the user is the subject (entity_id) filtered to USER/SECURITY actions.
 */
export async function listUserSecurityAuditLogs(
  userProfileId: number,
  limit = 50,
): Promise<AuditLog[]> {
  if (!Number.isSafeInteger(userProfileId) || userProfileId < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error("Invalid history request");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_id", userProfileId)
    .in("entity_name", ["user_profiles", "user_roles", "debug_route"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    const reference = reportSafeDiagnostic(error, { source: "dashboard", route: "/admin/users", event: "USER_HISTORY_UNAVAILABLE" });
    throw Error(`Security history is unavailable. Reference: ${reference}`);
  }
  if (!Array.isArray(data)) throw Error("Security history is unavailable");
  return data.map(row => ({...row,old_values:sanitizeSecurityAuditPayload(row.old_values),new_values:sanitizeSecurityAuditPayload(row.new_values)}));
}
