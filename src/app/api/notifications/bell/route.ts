import {getAuthContext} from "@/lib/rbac/check";
import {readRoute} from "@/server/reads/route-response";
import {readNotifications, readUnreadNotificationCount, readUnreadNotificationPreview} from "@/server/reads/notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Plain HTTP read: polling must not deliver a Server Action router response. */
export function GET(request: Request) {
  return readRoute(request, async () => {
    const ctx = await getAuthContext();
    const params = new URL(request.url).searchParams;
    if (params.get("preview") === "1") {
      return readUnreadNotificationPreview(ctx, request.signal);
    }
    if (params.get("list") === "1") {
      return readNotifications({audience: "my", status: "unread", pageSize: 10}, ctx, request.signal);
    }
    return readUnreadNotificationCount(ctx, request.signal);
  });
}
