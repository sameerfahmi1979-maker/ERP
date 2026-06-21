"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bulkRenameDocumentsToStandardFileNames,
  type BulkRenameResult,
} from "@/server/actions/dms/standard-file-name";

export function DmsStandardFileNameBulkRenamePanel() {
  const [limit, setLimit] = useState(100);
  const [lastResult, setLastResult] = useState<BulkRenameResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (dryRun: boolean) => {
    startTransition(async () => {
      const res = await bulkRenameDocumentsToStandardFileNames({ limit, dryRun });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Bulk rename failed");
        return;
      }
      setLastResult(res.data);
      toast.success(
        dryRun
          ? `Dry run: ${res.data.updated} would rename, ${res.data.skipped} skipped`
          : `Renamed ${res.data.updated} files (${res.data.skipped} skipped)`
      );
    });
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Standard File Name — Bulk Rename</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Retroactively apply{" "}
            <code className="text-[10px]">Document_type_Owner_DOC_NO_Expiry.ext</code> to existing
            original files. Medical insurance uses card number as DOC_NO. Uses{" "}
            <code className="text-[10px]">NoExpiry</code> when applicable.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Batch size</label>
          <Input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 100)))}
            className="w-28 h-8 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => run(true)}>
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          Dry Run
        </Button>
        <Button size="sm" disabled={isPending} onClick={() => run(false)}>
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Run Rename
        </Button>
      </div>

      {lastResult && (
        <div className="text-xs space-y-2 border-t pt-3">
          <p>
            Processed {lastResult.processed} · Updated {lastResult.updated} · Skipped{" "}
            {lastResult.skipped}
            {lastResult.errors.length > 0 ? ` · Errors ${lastResult.errors.length}` : ""}
          </p>
          {lastResult.samples.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pr-2 pb-1">Doc</th>
                    <th className="pr-2 pb-1">Before</th>
                    <th className="pb-1">After</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResult.samples.map((s) => (
                    <tr key={s.documentId} className="border-t border-border/40">
                      <td className="py-1 pr-2 font-mono">#{s.documentId}</td>
                      <td className="py-1 pr-2 max-w-[180px] truncate">{s.oldName}</td>
                      <td className="py-1 max-w-[220px] truncate font-medium">{s.newName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
