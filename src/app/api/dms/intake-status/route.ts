export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

/**
 * GET /api/dms/intake-status?sessionId={id}
 *
 * SPEED.2L — lightweight AI intake status poll for the Upload Inbox.
 *
 * This is deliberately a route handler and NOT a server action:
 *  - Next.js serializes server actions client-side, so a status-poll action
 *    would queue behind the long-running startAiIntakeFromUploadSession action
 *    and observe nothing until it finishes.
 *  - Server actions resolving after a router.push can rebase/revert the
 *    navigation (the "flash back to Upload Inbox" bug). A plain GET fetch
 *    never touches the Next.js router.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sessionIdRaw = req.nextUrl.searchParams.get("sessionId");
    if (!sessionIdRaw || isNaN(Number(sessionIdRaw))) {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    }
    const sessionId = Number(sessionIdRaw);

    const ctx = await getAuthContext();
    if (!ctx.profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const canView =
      hasPermission(ctx, "dms.documents.upload") ||
      hasPermission(ctx, "dms.documents.view") ||
      hasPermission(ctx, "dms.documents.review_ai") ||
      hasPermission(ctx, "dms.admin");
    if (!canView) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: session, error } = await supabase
      .from("dms_upload_sessions")
      .select("session_code, intake_status")
      .eq("id", sessionId)
      .is("deleted_at", null)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        intakeStatus: (session.intake_status as string) ?? "uploaded",
        sessionCode: session.session_code as string,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
