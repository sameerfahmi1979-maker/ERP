import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { listUserSecurityAuditLogs } from "@/server/queries/audit";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const canView =
      ctx.roleCodes.includes("system_admin") ||
      ctx.roleCodes.includes("group_admin") ||
      hasPermission(ctx, "users.security.manage") ||
      hasPermission(ctx, "audit.view");

    if (!ctx.profile || !canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const userProfileId = parseInt(searchParams.get("user_profile_id") ?? "", 10);

    if (!userProfileId || isNaN(userProfileId)) {
      return NextResponse.json({ error: "Invalid user_profile_id" }, { status: 400 });
    }

    const logs = await listUserSecurityAuditLogs(userProfileId);
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
