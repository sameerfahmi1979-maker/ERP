export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import {
  getUnreadNotificationCount,
  getMyNotifications,
} from "@/server/actions/notifications/notifications";

/**
 * GET /api/notifications/bell            → { count }
 * GET /api/notifications/bell?list=1     → { count, notifications }
 *
 * WORKSPACE.PERF.1 UAT fix — background notification polling must NOT be a
 * server action.
 *
 * The notification bell (app header, mounted on every page) polled
 * `getUnreadNotificationCount()` — a server action — every 60 seconds. In
 * Next.js, a `router.push` performed while ANY server action is in flight is
 * reverted when that action's response arrives (the response re-renders the
 * route the action was dispatched from). Each poll took ~1.5s, so every
 * minute there was a window where any navigation snapped back — the
 * intermittent "AI Intake Review opens then returns to Upload Inbox" bug.
 *
 * A plain GET fetch never touches the Next.js router, exactly like
 * /api/dms/intake-status. The underlying functions are invoked directly
 * (server-side call, not an action POST), so auth + RLS behavior is identical.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const includeList = req.nextUrl.searchParams.get("list") === "1";

    const countResult = await getUnreadNotificationCount();
    const count = countResult.success ? countResult.data?.count ?? 0 : 0;

    if (!includeList) {
      return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
    }

    const listResult = await getMyNotifications({ status: "unread", limit: 10 });
    return NextResponse.json(
      {
        count,
        notifications: listResult.success ? listResult.data ?? [] : [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
