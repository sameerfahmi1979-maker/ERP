"use client";

/**
 * ERP REALTIME.1A — Global Realtime Provider
 *
 * Mounts persistent Supabase Realtime subscriptions for:
 *   - erp_notifications  → invalidates notification query cache
 *   - dms_upload_sessions → invalidates DMS upload inbox cache
 *
 * These two are globally relevant (notification bell, DMS inbox badge)
 * so they live here rather than inside individual list components.
 *
 * Rules:
 *  - No visible UI rendered.
 *  - Must be mounted inside <QueryClientProvider>.
 *  - Must be mounted only in the authenticated/protected shell.
 *  - Does nothing when NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED !== "true".
 */

import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import { invalidateMyNotifications, invalidateDmsUploadSessions } from "@/lib/query/invalidation";

function NotificationsSync() {
  const queryClient = useQueryClient();
  useRealtimeSync({
    table: "erp_notifications",
    event: "*",
    debounceMs: 500,
    onEvent: () => {
      invalidateMyNotifications(queryClient);
    },
  });
  return null;
}

function DmsUploadSessionsSync() {
  const queryClient = useQueryClient();
  useRealtimeSync({
    table: "dms_upload_sessions",
    event: "*",
    debounceMs: 300,
    onEvent: () => {
      invalidateDmsUploadSessions(queryClient);
    },
  });
  return null;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NotificationsSync />
      <DmsUploadSessionsSync />
      {children}
    </>
  );
}
