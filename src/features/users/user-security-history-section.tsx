"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldAlert } from "lucide-react";
import type { AuditLog } from "@/types/database";
import type { AuthContext } from "@/lib/rbac/check";

// User-relevant security audit actions to display
const USER_SECURITY_ACTIONS = new Set([
  "USER_CREATED",
  "USER_UPDATED",
  "USER_STATUS_CHANGED",
  "USER_DELETED",
  "USER_ROLE_ASSIGNED",
  "USER_ROLE_REMOVED",
  "USER_SECURITY_RESET_EMAIL_SENT",
  "USER_SECURITY_TEMP_PASSWORD_SET",
  "USER_SECURITY_FORCE_CHANGE_SET",
  "USER_SECURITY_FORCE_CHANGE_CLEARED",
  "USER_SECURITY_EMAIL_CONFIRMED_BY_ADMIN",
  "USER_SECURITY_WELCOME_EMAIL_SENT",
  "USER_SECURITY_INVITE_EMAIL_SENT",
  "USER_PASSWORD_CHANGED",
  "LAST_ADMIN_GUARD_TRIGGERED",
  "UNAUTHORIZED_ACCESS_ATTEMPT",
  "EFFECTIVE_ACCESS_VIEWED",
  "DEBUG_ROUTE_ACCESSED",
]);

type UserSecurityHistorySectionProps = {
  userProfileId: number;
  authContext: AuthContext;
};

function canViewSecurityHistory(ctx: AuthContext): boolean {
  return (
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin") ||
    ctx.permissionCodes.includes("users.security.manage") ||
    ctx.permissionCodes.includes("audit.view")
  );
}

function getActionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action.includes("DELETED") || action.includes("UNAUTHORIZED") || action.includes("GUARD")) return "destructive";
  if (action.includes("CREATED") || action.includes("ASSIGNED") || action.includes("CONFIRMED")) return "default";
  if (action.includes("UPDATED") || action.includes("CHANGED") || action.includes("SET")) return "secondary";
  return "outline";
}

// Safe payload renderer — never displays sensitive values
function SafePayloadDisplay({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") return null;
  const BLOCKED = ["password", "token", "link", "secret", "otp", "jwt", "cookie", "raw"];
  const safe = Object.entries(payload as Record<string, unknown>)
    .filter(([k]) => !BLOCKED.some((b) => k.toLowerCase().includes(b)))
    .slice(0, 8);
  if (!safe.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
      {safe.map(([k, v]) => (
        <div key={k} className="flex gap-1 text-[10px]">
          <dt className="text-muted-foreground">{k}:</dt>
          <dd className="font-mono truncate max-w-[140px]">{String(v ?? "")}</dd>
        </div>
      ))}
    </dl>
  );
}

export function UserSecurityHistorySection({ userProfileId, authContext }: UserSecurityHistorySectionProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewSecurityHistory(authContext)) {
      setLoading(false);
      return;
    }
    fetch(`/api/admin/audit/user-history?user_profile_id=${userProfileId}`)
      .then((r) => r.json())
      .then((data: { logs?: AuditLog[] }) => setLogs(data.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [userProfileId, authContext]);

  if (!canViewSecurityHistory(authContext)) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Lock className="h-4 w-4" />
        <span>You need <code className="font-mono text-xs">users.security.manage</code> or <code className="font-mono text-xs">audit.view</code> to view security history.</span>
      </div>
    );
  }

  const filtered = logs.filter((l) => USER_SECURITY_ACTIONS.has(l.action));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Security History</span>
        <Badge variant="outline" className="text-xs">{filtered.length} events</Badge>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No security events recorded for this user.</p>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {filtered.map((log) => (
            <div key={log.id} className="flex flex-col gap-0.5 px-3 py-2 rounded-md border border-border bg-muted/20 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground whitespace-nowrap">
                  {format(new Date(log.created_at), "MMM d yyyy HH:mm:ss")}
                </span>
                <Badge variant={getActionBadgeVariant(log.action)} className="text-[10px] font-mono">
                  {log.action}
                </Badge>
                {log.actor_user_profile_id && (
                  <span className="text-muted-foreground">by #{log.actor_user_profile_id}</span>
                )}
              </div>
              {log.entity_reference && (
                <span className="text-muted-foreground">{log.entity_reference}</span>
              )}
              {log.new_values && <SafePayloadDisplay payload={log.new_values} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
