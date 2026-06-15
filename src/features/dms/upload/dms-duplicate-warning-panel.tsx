"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface DmsDuplicateWarningPanelProps {
  duplicateDocument: { id: number; document_no: string; title: string } | null | undefined;
  onContinueAnyway: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function DmsDuplicateWarningPanel({
  duplicateDocument,
  onContinueAnyway,
  onCancel,
  isSubmitting,
}: DmsDuplicateWarningPanelProps) {
  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Duplicate File Detected
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This file&apos;s SHA-256 hash matches an existing document file. Uploading again may create a redundant copy.
          </p>
        </div>
      </div>

      {duplicateDocument && (
        <div className="rounded-md border border-amber-300 bg-white dark:bg-amber-900/20 px-3 py-2.5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Existing Document</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{duplicateDocument.title}</p>
              <p className="text-xs text-muted-foreground font-mono">{duplicateDocument.document_no}</p>
            </div>
            <Link
              href={`/dms/documents/record/${duplicateDocument.id}`}
              target="_blank"
              className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
            >
              Open <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel upload
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onContinueAnyway}
          disabled={isSubmitting}
        >
          Continue anyway (admin override)
        </Button>
      </div>
    </div>
  );
}
