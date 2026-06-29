import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { AuditLog } from "@/types/database";

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

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (module) query = query.eq("module_code", module);
  if (action) query = query.eq("action", action);
  if (entity_id !== undefined) query = query.eq("entity_id", entity_id);
  if (entity_name) query = query.eq("entity_name", entity_name);
  if (actor_user_profile_id !== undefined) query = query.eq("actor_user_profile_id", actor_user_profile_id);
  if (date_from) query = query.gte("created_at", date_from);
  if (date_to) query = query.lte("created_at", date_to);
  if (search) query = query.or(`action.ilike.%${search}%,entity_reference.ilike.%${search}%`);

  const { data, error } = await query;

  if (error) {
    logger.error("listAuditLogs error", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * List audit logs for a specific user — for Security History section.
 * Returns events where the user is the subject (entity_id) filtered to USER/SECURITY actions.
 */
export async function listUserSecurityAuditLogs(
  userProfileId: number,
  limit = 50,
): Promise<AuditLog[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_id", userProfileId)
    .in("entity_name", ["user_profiles", "user_roles", "debug_route"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("listUserSecurityAuditLogs error", error.message);
    return [];
  }

  return data ?? [];
}
