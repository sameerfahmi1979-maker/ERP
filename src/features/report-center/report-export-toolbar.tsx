"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  Mail,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ERPSendEmailDialog } from "@/components/erp/email/erp-send-email-dialog";
import { sendReportEmail } from "@/server/actions/email";
import { generatePDFAttachment, generateExcelAttachment, generateCSVAttachment } from "@/lib/export/generate-attachment";
import type { ReportDataResult, ReportRegistryEntry } from "@/lib/report-center/types";
import type { ExportBrandingContext, ERPExportOptions } from "@/lib/export/export-types";

interface ReportExportToolbarProps {
  registryEntry: ReportRegistryEntry;
  data: ReportDataResult;
  onExport: (format: "pdf" | "excel" | "csv" | "print") => void;
  rowCount: number;
  isExporting?: boolean;
  runId?: number;
  resolvedBranding?: ExportBrandingContext;
}

export function ReportExportToolbar({
  registryEntry,
  data,
  onExport,
  rowCount,
  isExporting,
  runId,
  resolvedBranding,
}: ReportExportToolbarProps) {
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const formats = registryEntry.default_output_formats;
  const hasPdf = formats.includes("pdf");
  const hasExcel = formats.includes("excel");
  const hasCsv = formats.includes("csv");
  const hasPrint = formats.includes("print");
  const hasEmail = formats.includes("email") || hasPdf || hasExcel || hasCsv;

  const dateStr = new Date().toISOString().split("T")[0];
  const filenameBase = `${registryEntry.report_code}_${dateStr}`;

  const buildExportOptions = (): ERPExportOptions<Record<string, unknown>> => {
    const { columns, rows } = data;
    const exportColumns = columns.map((col) => ({
      key: col,
      header: col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
    const exportData = rows.map((row) =>
      Object.fromEntries(columns.map((col) => [col, row[col] ?? ""]))
    );
    return {
      title: registryEntry.report_name_en,
      filename: filenameBase,
      columns: exportColumns,
      data: exportData,
      orientation: registryEntry.default_orientation,
      branding: resolvedBranding,
    };
  };

  const handleCsvDownload = () => {
    const { columns, rows } = data;
    const header = columns.join(",");
    const rowLines = rows.map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",")
    );
    const csv = [header, ...rowLines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const attachmentOptions = [
    ...(hasPdf ? [{
      type: "pdf" as const,
      label: "PDF",
      filename: filenameBase,
      generateAttachment: () => generatePDFAttachment(buildExportOptions()),
    }] : []),
    ...(hasExcel ? [{
      type: "excel" as const,
      label: "Excel",
      filename: filenameBase,
      generateAttachment: () => generateExcelAttachment(buildExportOptions()),
    }] : []),
    ...(hasCsv ? [{
      type: "csv" as const,
      label: "CSV",
      filename: filenameBase,
      generateAttachment: () => generateCSVAttachment(buildExportOptions()),
    }] : []),
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-3 border rounded-lg bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">{registryEntry.report_name_en}</span>
          <Badge variant="outline" className="text-[10px]">
            {rowCount.toLocaleString()} rows
          </Badge>
          {registryEntry.sensitive_profile !== "normal" && (
            <Badge variant="secondary" className="text-[10px]">
              {registryEntry.sensitive_profile}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasCsv && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleCsvDownload} disabled={isExporting}>
              <Download className="h-3 w-3" />
              CSV
            </Button>
          )}
          {hasPrint && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onExport("print")} disabled={isExporting}>
              <Printer className="h-3 w-3" />
              Print
            </Button>
          )}
          {(hasPdf || hasExcel) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 h-7 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                aria-disabled={isExporting}
              >
                <FileText className="h-3 w-3" />
                Export
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hasPdf && (
                  <DropdownMenuItem onClick={() => onExport("pdf")}>
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Export as PDF
                  </DropdownMenuItem>
                )}
                {hasExcel && (
                  <>
                    {hasPdf && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => onExport("excel")}>
                      <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                      Export as Excel
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {hasEmail && attachmentOptions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowEmailDialog(true)}
              disabled={isExporting}
            >
              <Mail className="h-3 w-3" />
              Email
            </Button>
          )}
        </div>
      </div>

      {showEmailDialog && (
        <ERPSendEmailDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          title={registryEntry.report_name_en}
          subtitle={registryEntry.report_code}
          defaultSubject={`${registryEntry.report_name_en} — ${dateStr}`}
          attachmentOptions={attachmentOptions}
          recordCount={rowCount}
          moduleCode="REPORTS"
          onPreparedSend={async (input) => {
            if (!input.attachment) {
              return { success: false, error: "Attachment not ready." };
            }
            const result = await sendReportEmail({
              to: input.to.split(",").map((e) => e.trim()).filter(Boolean),
              cc: input.cc ? input.cc.split(",").map((e) => e.trim()).filter(Boolean) : [],
              subject: input.subject,
              body: input.body,
              attachment: input.attachment,
              runId,
              attachmentFormat: input.attachmentType,
              attachmentFilename: input.attachment.filename,
              attachmentSizeBytes: input.attachment.sizeBytes,
              context: { moduleCode: "REPORTS", recordCount: rowCount },
            });
            if (result.success) {
              toast.success("Report emailed successfully.");
            } else {
              toast.error(result.error ?? "Email failed.");
            }
            return result;
          }}
        />
      )}
    </>
  );
}
