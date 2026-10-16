import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/rbac/check";
import { readScopeVersion } from "@/lib/reads/scope-version";
export async function GET() {
  try {
    const ctx = await getAuthContext();
    return NextResponse.json({ authUserId: ctx.profile?.auth_user_id ?? null, active: ctx.isAccountActive, requiredChange: ctx.profile?.must_change_password === true, scopeVersion: readScopeVersion(ctx) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Session verification unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
