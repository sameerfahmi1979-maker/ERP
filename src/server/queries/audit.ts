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
}): Promise<AuditLog[]> {
  const supabase = await createClient();
  const { limit = 100, module, action } = options || {};

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (module) {
    query = query.eq("module_code", module);
  }

  if (action) {
    query = query.eq("action", action);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("listAuditLogs error", error.message);
    return [];
  }

  return data ?? [];
}
