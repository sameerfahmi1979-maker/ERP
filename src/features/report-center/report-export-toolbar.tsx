"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
import { useLegacyEmailAccess } from "@/hooks/use-legacy-email-access";
import { generatePDFAttachment, generateExcelAttachment, generateCSVAttachment } from "@/lib/export/generate-attachment";
import type { ReportDataResult, ReportRegistryEntry } from "@/lib/report-center/types";
import type { ExportBrandingContext, ERPExportOptions } from "@/lib/export/export-types";
import {usesOfficialDocumentSurface} from '@/lib/report-center/output-surface';

interface ReportExportToolbarProps {
  registryEntry: ReportRegistryEntry;
  data: ReportDataResult;
  onExport: (format: "pdf" | "excel" | "csv" | "print") => void;
  /** Rechecks the exact current report result, not just its mounting identity. */
  canUseData: () => boolean;
  rowCount: number;
  isExporting?: boolean;
  runId?: number;
  resolvedBranding?: ExportBrandingContext;
}

export function ReportExportToolbar({
  registryEntry,
  data,
  onExport,
  canUseData,
  rowCount,
  isExporting,
  runId,
  resolvedBranding,
}: ReportExportToolbarProps) {
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const canEmail = useLegacyEmailAccess();
  const currentEmailAccess = useRef(false);
  useLayoutEffect(() => {
    currentEmailAccess.current = canEmail;
    return () => {currentEmailAccess.current = false;};
  }, [canEmail]);
  const canUseEmail = () => canUseData() && canEmail && currentEmailAccess.current;
  const unavailable = "This report is no longer available. Run it again before exporting.";

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

  // A closed/retired dialog may still retain a generation promise or callback.
  // Do not hand attachment bytes back to it after the report owner changes.
  const prepareAttachment = async (format: "pdf" | "excel" | "csv") => {
    if (!canUseEmail()) throw new Error(unavailable);
    const options = buildExportOptions();
    const attachment = await (format === "pdf" ? generatePDFAttachment(options)
      : format === "excel" ? generateExcelAttachment(options) : generateCSVAttachment(options));
    if (!canUseEmail()) throw new Error(unavailable);
    return attachment;
  };

  const attachmentOptions = [
    ...(hasPdf ? [{
      type: "pdf" as const,
      label: "PDF",
      filename: filenameBase,
      generateAttachment: () => prepareAttachment("pdf"),
    }] : []),
    ...(hasExcel ? [{
      type: "excel" as const,
      label: "Excel",
      filename: filenameBase,
      generateAttachment: () => prepareAttachment("excel"),
    }] : []),
    ...(hasCsv ? [{
      type: "csv" as const,
      label: "CSV",
      filename: filenameBase,
      generateAttachment: () => prepareAttachment("csv"),
    }] : []),
  ];

  if(usesOfficialDocumentSurface(registryEntry)) return <div role="note" className="rounded-sm border bg-card p-4 text-sm">This is document source data, not an official document. Open the employee record’s Letters &amp; Forms section to preview a watermarked draft or issue an approved document. Unapproved wording cannot be issued. Official originals are downloaded from issuance history.</div>;

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
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={()=>{if(canUseData())onExport('csv');}} disabled={isExporting}>
              <Download className="h-3 w-3" />
              CSV
            </Button>
          )}
          {hasPrint && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => {if (canUseData()) onExport("print");}} disabled={isExporting}>
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
                  <DropdownMenuItem onClick={() => {if (canUseData()) onExport("pdf");}}>
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Export as PDF
                  </DropdownMenuItem>
                )}
                {hasExcel && (
                  <>
                    {hasPdf && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={() => {if (canUseData()) onExport("excel");}}>
                      <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                      Export as Excel
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {hasEmail && (hasPdf || hasExcel || hasCsv) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => {if (canUseEmail()) setShowEmailDialog(true);}}
              disabled={isExporting || !canEmail}
              title={!canEmail ? "Legacy Email Export temporarily requires global sending authority" : undefined}
            >
              <Mail className="h-3 w-3" />
              {canEmail ? "Email" : "Email restricted"}
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
            if (!canUseEmail()) return {success: false, error: unavailable};
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
            // An already-dispatched server mutation may have committed. Keep
            // its outcome truthful but do not announce it to another owner.
            if (!canUseEmail()) return result;
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
