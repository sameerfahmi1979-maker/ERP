import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasPermission, canUseApplication } from "@/lib/rbac/check";
import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";
import { listUserSecurityAuditLogs } from "@/server/queries/audit";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const canView =
      hasPermission(ctx, "users.security.manage") ||
      hasPermission(ctx, "audit.view");

    if (!canUseApplication(ctx) || !canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const userProfileId = Number(searchParams.get("user_profile_id"));

    if (!Number.isSafeInteger(userProfileId) || userProfileId < 1) {
      return NextResponse.json({ error: "Invalid user_profile_id" }, { status: 400 });
    }

    const logs = await listUserSecurityAuditLogs(userProfileId);
    const current = await getAuthContext();
    if (!canUseApplication(current) || current.profile?.id !== ctx.profile?.id ||
      JSON.stringify(current.roleAssignments) !== JSON.stringify(ctx.roleAssignments) ||
      !(hasPermission(current,"users.security.manage") || hasPermission(current,"audit.view"))) return NextResponse.json({error:"Access changed. Refresh and try again."},{status:403});
    return NextResponse.json({ logs }, {headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    const reference = reportSafeDiagnostic(error, {source:"server",route:"/api/admin/audit/user-history",event:"USER_HISTORY_UNAVAILABLE"});
    return NextResponse.json({ error: `History could not be verified. Retry. Reference: ${reference}` }, { status: 503,headers:{"Cache-Control":"private, no-store"} });
  }
}
