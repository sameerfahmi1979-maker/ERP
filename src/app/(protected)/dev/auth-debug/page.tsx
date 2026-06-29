/**
 * DEV ONLY — Auth context diagnostic.
 * Remove or guard with requireAdmin() before production.
 * Access: /dev/auth-debug
 */
import { getAuthContext, isGlobalAdmin } from "@/lib/rbac/check";
import { redirect } from "next/navigation";

export default async function AuthDebugPage() {
  const ctx = await getAuthContext();

  // Only accessible to authenticated users; non-admin users see limited info
  if (!ctx.profile) redirect("/login");

  const globalAdmin = isGlobalAdmin(ctx);

  return (
    <div className="p-8 font-mono text-sm space-y-4 max-w-4xl">
      <h1 className="text-xl font-bold">Auth Context Debug</h1>

      <section className="border rounded p-4 space-y-1">
        <p><strong>profile.id:</strong> {ctx.profile.id}</p>
        <p><strong>auth_user_id:</strong> {ctx.profile.auth_user_id}</p>
        <p><strong>full_name:</strong> {ctx.profile.full_name}</p>
        <p><strong>display_name:</strong> {ctx.profile.display_name ?? "(null)"}</p>
        <p><strong>email:</strong> {ctx.email}</p>
        <p><strong>status:</strong> {ctx.accountStatus}</p>
        <p><strong>isAccountActive:</strong> {String(ctx.isAccountActive)}</p>
        <p><strong>isGlobalAdmin:</strong> {String(globalAdmin)}</p>
      </section>

      <section className="border rounded p-4 space-y-1">
        <p><strong>roleCodes ({ctx.roleCodes.length}):</strong></p>
        <ul className="pl-4 list-disc">
          {ctx.roleCodes.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section className="border rounded p-4 space-y-1">
        <p><strong>permissionCodes ({ctx.permissionCodes.length}):</strong></p>
        <p className="text-green-600">HR: {ctx.permissionCodes.filter(p => p.startsWith("hr.")).join(", ") || "NONE"}</p>
        <p className="text-blue-600">DMS: {ctx.permissionCodes.filter(p => p.startsWith("dms.")).join(", ") || "NONE"}</p>
        <p className="text-orange-600">dashboard.view: {String(ctx.permissionCodes.includes("dashboard.view"))}</p>
        <details>
          <summary className="cursor-pointer">All permissions (first 50)</summary>
          <ul className="pl-4 list-disc">
            {ctx.permissionCodes.slice(0, 50).map((p) => <li key={p}>{p}</li>)}
          </ul>
        </details>
      </section>
    </div>
  );
}
