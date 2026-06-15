"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw, Plus, CheckCircle2, XCircle } from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsExpiringDocuments,
  generateDmsExpiryRemindersForDocument,
  type ExpiringDocumentsFilter,
  type DmsExpiringDocumentRow,
} from "@/server/actions/dms/expiry-reminders";
import { DmsExpiryStatusBadge } from "./dms-expiry-status-badge";
import { invalidateDmsExpiry } from "@/lib/query/invalidation";

interface DmsExpiringDocumentsTableProps {
  view: "expired" | "expiring" | "missing_expiry";
  onStartRenewal?: (doc: DmsExpiringDocumentRow) => void;
}

export function DmsExpiringDocumentsTable({ view, onStartRenewal }: DmsExpiringDocumentsTableProps) {
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const filterKey: ExpiringDocumentsFilter = { view };

  const { data: docs = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.expiringDocuments(filterKey),
    queryFn: async () => {
      const result = await getDmsExpiringDocuments(filterKey);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 60_000,
  });

  const handleGenerateReminders = async (docId: number) => {
    setGeneratingId(docId);
    try {
      const result = await generateDmsExpiryRemindersForDocument(docId);
      if (result.success) {
        toast.success(`Reminders generated: ${result.data?.created} created`);
        invalidateDmsExpiry(queryClient);
      } else {
        toast.error(result.error ?? "Failed to generate reminders");
      }
    } finally {
      setGeneratingId(null);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (docs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {view === "expired" ? "No expired documents" :
         view === "expiring" ? "No documents expiring within 90 days" :
         "No documents with missing expiry date"}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 border-b border-border">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Document</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Type / Category</th>
            {view !== "missing_expiry" && (
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Expiry</th>
            )}
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Status</th>
            <th className="px-3 py-2 w-40" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {docs.map((doc) => (
            <tr key={doc.id} className="hover:bg-muted/10 transition-colors">
              <td className="px-3 py-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{doc.document_no}</p>
                  <p className="text-sm font-medium truncate max-w-[220px]">{doc.title}</p>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  <p>{doc.document_type ?? "—"}</p>
                  {doc.category && <p className="opacity-70">{doc.category}</p>}
                </div>
              </td>
              {view !== "missing_expiry" && (
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    {doc.expiry_date ? (
                      <p className="text-xs">{format(parseISO(doc.expiry_date), "dd MMM yyyy")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                    <DmsExpiryStatusBadge daysRemaining={doc.days_remaining} />
                  </div>
                </td>
              )}
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs capitalize">{doc.status}</Badge>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => window.open(`/dms/documents/record/${doc.id}`, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </Button>
                  {view !== "missing_expiry" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={generatingId === doc.id}
                      onClick={() => handleGenerateReminders(doc.id)}
                    >
                      <RefreshCw className={`h-3 w-3 ${generatingId === doc.id ? "animate-spin" : ""}`} />
                      Reminders
                    </Button>
                  )}
                  {onStartRenewal && view !== "missing_expiry" && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => onStartRenewal(doc)}
                    >
                      <Plus className="h-3 w-3" />
                      Renew
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
