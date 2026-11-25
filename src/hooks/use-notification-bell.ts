"use client";
import {useQuery} from "@tanstack/react-query";
import {ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {notificationPreviewSchema, unreadCountSchema} from "@/lib/reads/notifications-schema";

async function bellRead(list: boolean, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await fetch(`/api/notifications/bell${list ? "?preview=1" : ""}`, {credentials: "same-origin", cache: "no-store", signal});
  signal.throwIfAborted();
  if (!response.ok) throw new ReadError("Notifications could not be verified. Please retry.", response.status);
  const result = await response.json(); signal.throwIfAborted();
  if (result?.success !== true) throw Error("Notifications could not be verified. Please retry.");
  return result.data as unknown;
}
export function useNotificationUnread(identity: string | undefined) {
  return useQuery({queryKey: ["notifications", "unread-count", identity], enabled: !!identity,
    queryFn: async ({signal}) => {if (!identity) throw new DOMException("Read cancelled", "AbortError"); return unreadCountSchema.parse(await bellRead(false, signal)).count;},
    gcTime: 0, staleTime: 30000, refetchInterval: query => query.state.error instanceof ReadError && [401, 403].includes(query.state.error.status) ? false : 60000, retry: retryAuthorizedRead});
}
export function useNotificationBellRows(identity: string | undefined, open: boolean) {
  return useQuery({queryKey: ["notifications", "my", identity, "bell"], enabled: !!identity && open,
    queryFn: async ({signal}) => {
      if (!identity || !open) throw new DOMException("Read cancelled", "AbortError");
      return notificationPreviewSchema.parse(await bellRead(true, signal)).rows;
    }, gcTime: 0, staleTime: 10000, retry: retryAuthorizedRead,refetchOnWindowFocus:true,refetchOnReconnect:true,
    refetchInterval:query=>!open||query.state.error instanceof ReadError&&[401,403].includes(query.state.error.status)?false:60000});
}
