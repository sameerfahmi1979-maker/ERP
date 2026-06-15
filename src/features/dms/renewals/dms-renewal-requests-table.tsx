"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsRenewalRequests,
  cancelDmsRenewalRequest,
  type DmsRenewalRequestRow,
  type RenewalRequestsFilter,
} from "@/server/actions/dms/renewals";
import { DmsRenewalStatusBadge } from "./dms-renewal-status-badge";
import { DmsCompleteRenewalDialog } from "./dms-complete-renewal-dialog";
import { invalidateDmsRenewals } from "@/lib/query/invalidation";

interface DmsRenewalRequestsTableProps {
  filter?: RenewalRequestsFilter;
}

export function DmsRenewalRequestsTable({ filter = {} }: DmsRenewalRequestsTableProps) {
  const queryClient = useQueryClient();
  const [completeDialog, setCompleteDialog] = useState<{ renewal: DmsRenewalRequestRow } | null>(null);

  const { data: renewals = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.renewalRequests(filter as Record<string, unknown>),
    queryFn: async () => {
      const result = await getDmsRenewalRequests(filter);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const handleCancel = async (id: number) => {
    const result = await cancelDmsRenewalRequest(id, "Cancelled from dashboard");
    if (result.success) {
      toast.success("Renewal request cancelled");
      invalidateDmsRenewals(queryClient);
    } else {
      toast.error(result.error ?? "Failed to cancel");
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (renewals.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No renewal requests found.</div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Renewal No</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Document</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Status</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Priority</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Target Date</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Assigned To</th>
              <th className="px-3 py-2 w-36" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {renewals.map((r) => {
              const doc = r.document as Record<string, unknown> | null | undefined;
              const assignee = r.assignee as Record<string, unknown> | null | undefined;
              return (
                <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{r.renewal_no ?? `#${r.id}`}</td>
                  <td className="px-3 py-2">
                    {doc ? (
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{doc.document_no as string}</p>
                        <p className="text-sm truncate max-w-[180px]">{doc.title as string}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <DmsRenewalStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 capitalize text-xs">{r.priority}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.target_renewal_date ? format(parseISO(r.target_renewal_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {(assignee?.full_name as string | null) ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {doc && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => window.open(`/dms/documents/record/${doc.id}`, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                      {!["renewed", "cancelled", "rejected"].includes(r.status) && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setCompleteDialog({ renewal: r })}
                          >
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            Complete
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleCancel(r.id)}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {completeDialog && (
        <DmsCompleteRenewalDialog
          open
          onOpenChange={(v) => { if (!v) setCompleteDialog(null); }}
          renewalId={completeDialog.renewal.id}
          renewalNo={completeDialog.renewal.renewal_no ?? `#${completeDialog.renewal.id}`}
          documentId={completeDialog.renewal.document_id}
          onSuccess={() => setCompleteDialog(null)}
        />
      )}
    </>
  );
}
