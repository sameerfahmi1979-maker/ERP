"use server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsDocumentEventRow = {
  id: number;
  document_id: number | null;
  event_type: string;
  description: string | null;
  performed_by: number | null;
  performed_at: string;
  metadata_json: unknown;
  performer?: { display_name: string } | null;
};

export async function getDmsDocumentEvents(
  documentId: number
): Promise<ActionResult<DmsDocumentEventRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_document_events")
      .select("id, document_id, event_type, description, performed_by, performed_at, metadata_json, performer:user_profiles!performed_by(display_name)")
      .eq("document_id", documentId)
      .order("performed_at", { ascending: false })
      .limit(100);

    if (error) return { success: false, error: error.message };

    return { success: true, data: (data ?? []) as unknown as DmsDocumentEventRow[] };
  } catch (err) {
    logger.error("getDmsDocumentEvents error", err);
    return { success: false, error: "Failed to load events" };
  }
}
