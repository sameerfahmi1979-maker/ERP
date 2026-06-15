"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Layers, ArrowRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DmsUploadBatchListRow } from "@/server/actions/dms/batch-intake";

interface Props {
  initialBatches: DmsUploadBatchListRow[];
}

const BATCH_STATUS_STYLES: Record<string, string> = {
  processing: "bg-blue-100 text-blue-700 border-blue-200",
  ready_for_review: "bg-amber-100 text-amber-700 border-amber-200",
  partially_approved: "bg-violet-100 text-violet-700 border-violet-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DmsBatchListClient({ initialBatches }: Props) {
  const router = useRouter();
  const [batches] = useState<DmsUploadBatchListRow[]>(initialBatches);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const open = useCallback(
    (batchCode: string) => router.push(`/dms/inbox/batch/${batchCode}`),
    [router]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {batches.length} {batches.length === 1 ? "batch" : "batches"}
        </p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={isPending}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Batch</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-right font-medium px-3 py-2">Files</th>
              <th className="text-right font-medium px-3 py-2">Pending</th>
              <th className="text-right font-medium px-3 py-2">Approved</th>
              <th className="text-right font-medium px-3 py-2">Discarded</th>
              <th className="text-left font-medium px-3 py-2">Created</th>
              <th className="text-right font-medium px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  No upload batches yet. Use the Upload Inbox in &quot;Multiple Files (Batch)&quot; mode to create one.
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr
                key={b.id}
                className="border-t hover:bg-muted/20 cursor-pointer"
                onClick={() => open(b.batch_code)}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    <span className="font-mono text-xs font-semibold">{b.batch_code}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] border",
                      BATCH_STATUS_STYLES[b.status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                    )}
                  >
                    {b.status.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{b.total_files}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {b.pendingCount > 0 ? (
                    <span className="font-semibold text-amber-600">{b.pendingCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-green-600">{b.approvedCount}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{b.discardedCount}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(b.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      open(b.batch_code);
                    }}
                  >
                    {b.pendingCount > 0 ? "Review" : "Open"}
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
