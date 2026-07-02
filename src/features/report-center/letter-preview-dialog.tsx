"use client";

import { useState, useEffect, useTransition } from "react";
import {
  X,
  ExternalLink,
  Printer,
  FileDown,
  Loader2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { runReportAction } from "@/server/actions/reports/runner";
import { exportToPDF } from "@/lib/export/pdf";
import { exportToPrint } from "@/lib/export/print";
import type { ReportDataResult } from "@/lib/report-center/types";
import type { ERPExportColumn } from "@/lib/export/export-types";

interface LetterPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportCode: string;
  reportLabel: string;
  employeeId: number;
  employeeName?: string;
}

function formatColumnHeader(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }
  return s;
}

export function LetterPreviewDialog({
  open,
  onOpenChange,
  reportCode,
  reportLabel,
  employeeId,
  employeeName,
}: LetterPreviewDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ReportDataResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      return;
    }

    setData(null);
    setError(null);

    startTransition(async () => {
      const result = await runReportAction({
        reportCode,
        outputFormat: "screen",
        filters: { employee_id: String(employeeId) },
      });

      if (!result.success || !result.data?.data) {
        setError(result.error ?? "Failed to generate letter.");
      } else {
        setData(result.data.data);
      }
    });
  }, [open, reportCode, employeeId]);

  if (!open) return null;

  const row = data?.rows?.[0] ?? null;
  const columns = data?.columns ?? [];

  const exportColumns: ERPExportColumn<Record<string, unknown>>[] = columns.map(
    (col) => ({ key: col, header: formatColumnHeader(col) })
  );

  const handlePDF = () => {
    if (!data) return;
    exportToPDF({
      title: reportLabel,
      filename: `${reportCode}_${new Date().toISOString().split("T")[0]}`,
      columns: exportColumns,
      data: data.rows,
    });
  };

  const handlePrint = () => {
    if (!data) return;
    exportToPrint({
      title: reportLabel,
      filename: `${reportCode}_${new Date().toISOString().split("T")[0]}`,
      columns: exportColumns,
      data: data.rows,
    });
  };

  const handleOpenFullView = () => {
    window.open(
      `/admin/reports/run/${reportCode}?employee_id=${employeeId}`,
      "_blank"
    );
  };

  return (
    <>
      {/* Overlay — same z-index layer as child dialog overlays */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-[100]"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog panel */}
      <div
        className="fixed inset-4 md:inset-8 lg:inset-16 z-[110] flex flex-col bg-background rounded-xl shadow-2xl border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {reportLabel}
              </h2>
              {employeeName && (
                <p className="text-sm text-muted-foreground truncate">
                  {employeeName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-4 h-8 w-8 shrink-0 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {isPending && (
            <div className="flex flex-col items-center justify-center gap-3 h-40 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Generating {reportLabel}…</span>
            </div>
          )}

          {!isPending && error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {!isPending && !error && row && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                {columns.map((col) => (
                  <div key={col} className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {formatColumnHeader(col)}
                    </div>
                    <div className="text-sm text-foreground break-words">
                      {formatCellValue(row[col])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t bg-background shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenFullView}
              className="gap-1.5 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Report Center
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={!data || isPending}
              className="gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              size="sm"
              onClick={handlePDF}
              disabled={!data || isPending}
              className="gap-1.5"
            >
              <FileDown className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
