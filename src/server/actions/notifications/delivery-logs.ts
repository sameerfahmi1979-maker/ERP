"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { canViewNotificationDeliveryLogs } from "@/lib/notifications/access";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export type DeliveryLogRow = {
  id: number;
  notificationId: number | null;
  emailQueueId: number | null;
  providerConfigId: number | null;
  deliveryChannel: string;
  status: string;
  message: string | null;
  externalMessageId: string | null;
  durationMs: number | null;
  attemptNumber: number | null;
  errorMessage: string | null;
  createdAt: string;
};

function rowToLog(r: Record<string, unknown>): DeliveryLogRow {
  return {
    id: r.id as number,
    notificationId: r.notification_id as number | null,
    emailQueueId: r.email_queue_id as number | null,
    providerConfigId: null,
    deliveryChannel: r.delivery_channel as string,
    status: r.status as string,
    message: r.message as string | null,
    externalMessageId: null,
    durationMs: r.duration_ms as number | null,
    attemptNumber: r.attempt_number as number | null,
    errorMessage: r.error_message as string | null,
    createdAt: r.created_at as string,
  };
}

export async function getNotificationDeliveryLogs(
  filters?: { limit?: number; status?: string; delivery_channel?: string }
): Promise<ActionResult<DeliveryLogRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!canViewNotificationDeliveryLogs(ctx)) {
      return { success: false, error: "Permission denied" };
    }
    const supabase = await createClient();

    let q = supabase
      .from("perf_notification_delivery_read")
      .select("id,notification_id,email_queue_id,delivery_channel,status,message,duration_ms,attempt_number,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 200);

    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.delivery_channel) q = q.eq("delivery_channel", filters.delivery_channel);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => rowToLog(r as Record<string, unknown>)) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
