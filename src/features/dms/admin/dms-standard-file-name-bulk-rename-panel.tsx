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
        <div className="text-xs space-y-3 border-t pt-3">
          {/* Stats bar */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Processed <strong>{lastResult.processed}</strong></span>
            <span className="text-green-600 dark:text-green-400">
              Updated <strong>{lastResult.updated}</strong>
            </span>
            <span className="text-muted-foreground">
              Skipped <strong>{lastResult.skipped}</strong>
            </span>
            {lastResult.qualitySkipped > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                ⚠ Quality-blocked <strong>{lastResult.qualitySkipped}</strong>
                {" "}(rename would lose owner/doc-no — left unchanged)
              </span>
            )}
            {lastResult.errors.length > 0 && (
              <span className="text-destructive">
                Errors <strong>{lastResult.errors.length}</strong>
              </span>
            )}
          </div>

          {/* Errors list */}
          {lastResult.errors.length > 0 && (
            <div className="rounded bg-destructive/10 p-2 space-y-0.5">
              {lastResult.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-destructive font-mono">{e}</p>
              ))}
              {lastResult.errors.length > 5 && (
                <p className="text-muted-foreground">…and {lastResult.errors.length - 5} more</p>
              )}
            </div>
          )}

          {/* Rename preview table */}
          {lastResult.samples.length > 0 && (
            <div className="overflow-auto max-h-80 rounded border border-border/40">
              <table className="w-full text-[11px] min-w-[640px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-muted-foreground border-b border-border/40">
                    <th className="px-2 py-1.5 whitespace-nowrap">Doc</th>
                    <th className="px-2 py-1.5">Before</th>
                    <th className="px-2 py-1.5">After</th>
                    <th className="px-2 py-1.5 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResult.samples.map((s) => (
                    <tr
                      key={s.documentId}
                      className={
                        s.qualityIssue
                          ? "border-t border-border/40 bg-amber-50/50 dark:bg-amber-950/20"
                          : "border-t border-border/40"
                      }
                    >
                      <td className="px-2 py-1 font-mono whitespace-nowrap">#{s.documentId}</td>
                      <td className="px-2 py-1 max-w-[220px] truncate text-muted-foreground">
                        {s.oldName}
                      </td>
                      <td className={`px-2 py-1 max-w-[260px] truncate font-medium ${
                        s.qualityIssue
                          ? "text-amber-700 dark:text-amber-400 line-through"
                          : ""
                      }`}>
                        {s.newName}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {s.qualityIssue ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            ⚠ Skipped ({s.qualityIssue})
                          </span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">✓ Will rename</span>
                        )}
                      </td>
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
