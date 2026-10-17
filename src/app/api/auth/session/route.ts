import { traceRequest } from "@/lib/performance/request";
import { tracedJsonResponse } from "@/lib/performance/trace";
import { getAuthContext } from "@/lib/rbac/check";
import { readScopeVersion } from "@/lib/reads/scope-version";
export async function GET() {
  return traceRequest("session.route", sessionResponse);
}
async function sessionResponse() {
  try {
    const ctx = await getAuthContext();
    return tracedJsonResponse({ authUserId: ctx.profile?.auth_user_id ?? null, active: ctx.isAccountActive, requiredChange: ctx.profile?.must_change_password === true, scopeVersion: readScopeVersion(ctx) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return tracedJsonResponse({ error: "Session verification unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
