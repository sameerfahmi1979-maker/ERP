"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, ShieldAlert, RefreshCw, ChevronDown } from "lucide-react";
import type { AuditLog } from "@/types/database";
import type { AuthContext } from "@/lib/rbac/check";

// Humanized action labels
const ACTION_LABELS: Record<string, string> = {
  USER_CREATED: "User Account Created",
  USER_UPDATED: "Profile Updated",
  USER_STATUS_CHANGED: "Account Status Changed",
  USER_DELETED: "User Account Deleted",
  USER_ROLE_ASSIGNED: "Role Assigned",
  USER_ROLE_REMOVED: "Role Removed",
  USER_SECURITY_RESET_EMAIL_SENT: "Password Reset Email Sent",
  USER_SECURITY_TEMP_PASSWORD_SET: "Temporary Password Set",
  USER_SECURITY_FORCE_CHANGE_SET: "Forced Password Change Enabled",
  USER_SECURITY_FORCE_CHANGE_CLEARED: "Forced Password Change Cleared",
  USER_SECURITY_EMAIL_CONFIRMED_BY_ADMIN: "Email Confirmed by Admin",
  USER_SECURITY_WELCOME_EMAIL_SENT: "Welcome Email Sent",
  USER_SECURITY_INVITE_EMAIL_SENT: "Invite Email Sent",
  USER_PASSWORD_CHANGED: "Password Changed",
  LAST_ADMIN_GUARD_TRIGGERED: "Last Admin Guard Triggered",
  UNAUTHORIZED_ACCESS_ATTEMPT: "Unauthorized Access Attempt",
  EFFECTIVE_ACCESS_VIEWED: "Effective Access Viewed",
  DEBUG_ROUTE_ACCESSED: "Auth Debug Page Accessed",
};

function humanizeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

// High-risk actions that warrant red highlight
const HIGH_RISK_ACTIONS = new Set([
  "USER_DELETED",
  "LAST_ADMIN_GUARD_TRIGGERED",
  "UNAUTHORIZED_ACCESS_ATTEMPT",
]);

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

const INITIAL_DISPLAY = 20;

type Props = {
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
  if (HIGH_RISK_ACTIONS.has(action)) return "destructive";
  if (action.includes("CREATED") || action.includes("ASSIGNED") || action.includes("CONFIRMED")) return "default";
  if (action.includes("UPDATED") || action.includes("CHANGED") || action.includes("SET")) return "secondary";
  return "outline";
}

// Safe payload renderer — never displays sensitive values
function SafePayloadDisplay({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") return null;
  const BLOCKED = ["password", "token", "link", "secret", "otp", "jwt", "cookie", "raw", "hash"];
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

export function UserSecurityHistorySection({ userProfileId, authContext }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY);
  const [expandedPayloads, setExpandedPayloads] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!canViewSecurityHistory(authContext)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/admin/audit/user-history?user_profile_id=${userProfileId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { logs?: AuditLog[] }) => setLogs(data.logs ?? []))
      .catch(() => setError("Could not load security history. Please try again."))
      .finally(() => setLoading(false));
  }, [userProfileId, authContext]);

  useEffect(() => { load(); }, [load]);

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!canViewSecurityHistory(authContext)) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Lock className="h-4 w-4 shrink-0" />
        <span>
          You need <code className="font-mono text-xs">users.security.manage</code> or{" "}
          <code className="font-mono text-xs">audit.view</code> to view security history.
        </span>
      </div>
    );
  }

  const filtered = logs.filter((l) => USER_SECURITY_ACTIONS.has(l.action));
  const visible = filtered.slice(0, displayCount);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Event History</span>
        {!loading && !error && (
          <Badge variant="outline" className="text-xs">{filtered.length} events</Badge>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-md border border-border px-3 py-2 space-y-1.5">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No security events recorded for this user.</p>
      )}

      {/* Events list */}
      {!loading && !error && visible.length > 0 && (
        <>
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {visible.map((log) => {
              const isHighRisk = HIGH_RISK_ACTIONS.has(log.action);
              const hasPayload = log.new_values && typeof log.new_values === "object" && Object.keys(log.new_values as object).length > 0;
              const payloadKey = String(log.id);
              const isExpanded = expandedPayloads.has(payloadKey);

              return (
                <div
                  key={log.id}
                  className={`flex flex-col gap-0.5 px-3 py-2 rounded-md border text-xs ${
                    isHighRisk
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d yyyy HH:mm:ss")}
                    </span>
                    <Badge variant={getActionBadgeVariant(log.action)} className="text-[10px]">
                      {humanizeAction(log.action)}
                    </Badge>
                    {log.actor_user_profile_id && (
                      <span className="text-muted-foreground text-[10px]">
                        by Admin #{log.actor_user_profile_id}
                      </span>
                    )}
                    {hasPayload && (
                      <button
                        type="button"
                        onClick={() => togglePayload(payloadKey)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-[10px] ml-auto"
                        aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      >
                        Details
                        <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                  {log.entity_reference && (
                    <span className="text-muted-foreground text-[10px]">{log.entity_reference}</span>
                  )}
                  {isExpanded && log.new_values && (
                    <SafePayloadDisplay payload={log.new_values} />
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length > displayCount && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs w-full"
              onClick={() => setDisplayCount((c) => c + INITIAL_DISPLAY)}
            >
              Load more ({filtered.length - displayCount} remaining)
            </Button>
          )}
        </>
      )}
    </div>
  );
}
