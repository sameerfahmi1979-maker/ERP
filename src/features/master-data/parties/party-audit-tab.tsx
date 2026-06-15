"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Lock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { getPartyAuditLogs } from "@/server/actions/master-data/parties";
import type { PartyAuditLogRow } from "@/server/actions/master-data/parties";

type Props = {
  partyId: number;
  canViewAudit: boolean;
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  deactivate: "bg-orange-100 text-orange-800",
  reactivate: "bg-teal-100 text-teal-800",
};

export function PartyAuditTab({ partyId, canViewAudit }: Props) {
  const { data: result, isLoading } = useQuery({
    queryKey: ["party_audit_logs", partyId],
    queryFn: () => getPartyAuditLogs(partyId),
    enabled: canViewAudit && !!partyId,
    staleTime: 60 * 1000,
  });

  if (!canViewAudit) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
        <Lock className="h-6 w-6" />
        <p className="text-sm">You do not have permission to view audit logs.</p>
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center h-32 text-muted-foreground">Loading audit log…</div>;

  if (!result?.success) {
    return (
      <div className="text-destructive p-4 text-sm">
        {result?.error ?? "Failed to load audit logs"}
      </div>
    );
  }

  const logs = (result.data ?? []) as PartyAuditLogRow[];

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-24 border border-dashed rounded-md text-muted-foreground text-sm gap-2">
        <AlertCircle className="h-4 w-4" />
        No audit log entries found for this party
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-sm">Audit Log</h3>
        <p className="text-xs text-muted-foreground">Showing party-level change history ({logs.length} entries)</p>
      </div>
      <div className="grid gap-2">
        {logs.map((log) => (
          <div key={log.id} className="border rounded-md px-4 py-3 flex items-start gap-4">
            <div className="flex-shrink-0 pt-0.5">
              <Badge className={`text-xs capitalize ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-800"}`}>
                {log.action}
              </Badge>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{log.entity_name}</span>
                {log.entity_reference && (
                  <span className="text-xs text-muted-foreground font-mono">{log.entity_reference}</span>
                )}
              </div>
              {log.new_values && Object.keys(log.new_values).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  Changed: {Object.keys(log.new_values).slice(0, 5).join(", ")}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 text-xs text-muted-foreground">
              {format(new Date(log.created_at), "dd MMM yyyy HH:mm")}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Note: This view shows top-level party changes only. Child entity audit is deferred to a future phase.
      </p>
    </div>
  );
}
