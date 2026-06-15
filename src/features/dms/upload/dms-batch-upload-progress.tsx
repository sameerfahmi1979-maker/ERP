"use client";

import { CheckCircle2, XCircle, Loader2, Clock, UploadCloud, Bot, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BatchFilePhase = "pending" | "uploading" | "ai" | "done" | "failed";

export interface BatchFileProgress {
  name: string;
  phase: BatchFilePhase;
  error?: string | null;
}

interface DmsBatchUploadProgressProps {
  files: BatchFileProgress[];
  batchCode?: string | null;
  onOpenQueue?: () => void;
}

const PHASE_META: Record<BatchFilePhase, { label: string; icon: React.ReactNode; className: string }> = {
  pending: { label: "Waiting", icon: <Clock className="h-3.5 w-3.5" />, className: "text-muted-foreground" },
  uploading: { label: "Uploading", icon: <UploadCloud className="h-3.5 w-3.5 animate-pulse" />, className: "text-blue-600" },
  ai: { label: "AI analysing", icon: <Bot className="h-3.5 w-3.5 animate-pulse" />, className: "text-violet-600" },
  done: { label: "Draft created", icon: <CheckCircle2 className="h-3.5 w-3.5" />, className: "text-green-600" },
  failed: { label: "Failed", icon: <XCircle className="h-3.5 w-3.5" />, className: "text-destructive" },
};

export function DmsBatchUploadProgress({ files, batchCode, onOpenQueue }: DmsBatchUploadProgressProps) {
  const total = files.length;
  const done = files.filter((f) => f.phase === "done").length;
  const failed = files.filter((f) => f.phase === "failed").length;
  const inProgress = files.some((f) => f.phase === "uploading" || f.phase === "ai");
  const allSettled = files.every((f) => f.phase === "done" || f.phase === "failed");

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {inProgress ? (
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
            {inProgress ? "Processing batch…" : "Batch processed"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-600 font-medium">{done} created</span>
          {failed > 0 && <span className="text-destructive font-medium">{failed} failed</span>}
          <span className="text-muted-foreground">/ {total}</span>
        </div>
      </div>

      <ul className="space-y-1 max-h-56 overflow-auto">
        {files.map((f, i) => {
          const meta = PHASE_META[f.phase];
          return (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs rounded-md bg-background/60 px-2.5 py-1.5">
              <span className={cn("shrink-0", meta.className)}>{meta.icon}</span>
              <span className="flex-1 min-w-0 truncate">{f.name}</span>
              <span className={cn("shrink-0 font-medium", meta.className)}>{meta.label}</span>
            </li>
          );
        })}
      </ul>

      {allSettled && batchCode && (
        <div className="flex items-center justify-between border-t border-violet-200 dark:border-violet-900 pt-3">
          <p className="text-xs text-muted-foreground">
            Review each draft individually and approve one at a time.
          </p>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={onOpenQueue}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open Review Queue
          </Button>
        </div>
      )}
    </div>
  );
}
