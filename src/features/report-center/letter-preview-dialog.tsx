"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  X,
  ExternalLink,
  Printer,
  FileDown,
  Loader2,
  FileText,
  AlertCircle,
  LayoutTemplate,
  Table2,
  QrCode,
  Check,
  Copy,
  Link2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { runReportAction } from "@/server/actions/reports/runner";
import { exportToPDF } from "@/lib/export/pdf";
import { exportToPrint } from "@/lib/export/print";
import type { ReportDataResult } from "@/lib/report-center/types";
import type { ERPExportColumn, ExportBrandingContext } from "@/lib/export/export-types";
import { ExecutiveLedgerPreview } from "@/features/executive-ledger/executive-ledger-preview";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import { elColumnLabel, elFormatValue } from "@/lib/executive-ledger/formatters";
import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";
import { createOutputPublicLink } from "@/server/actions/reports/public-verification";
import { generateQrDataUrl } from "@/lib/public-verification/qr";
import { listReportTemplatesForSelection, resolveTemplatePreview, type ReportTemplateForSelection } from "@/server/actions/reports/templates";

interface LetterPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportCode: string;
  reportLabel: string;
  employeeId: number;
  employeeName?: string;
  /**
   * Optional branding context from BRANDING.4 `resolveTemplatePreview()`.
   * When provided, the Formal View toggle renders the letter with full company branding.
   * When absent, the Formal View still works with neutral branding.
   */
  branding?: ExportBrandingContext;
  /**
   * Pre-selected approved/published template ID for QR issuance (BRANDING.8).
   * When absent, the user must select a template before QR issuance is allowed.
   */
  templateId?: number | null;
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

/** Build an ExecutiveLedgerDocument from flat report row data */
function buildExecutiveLedgerDoc(
  columns: string[],
  row: Record<string, unknown>,
  reportLabel: string,
  branding?: ExportBrandingContext,
  verification?: ExecutiveLedgerDocument["verification"]
): ExecutiveLedgerDocument {
  const rows = columns.map((col) => ({
    label: elColumnLabel(col),
    value: elFormatValue(row[col]),
  }));

  const mid = Math.ceil(rows.length / 2);
  const detailRows = rows.slice(0, mid);
  const extraRows = rows.slice(mid);

  const sections: ExecutiveLedgerDocument["sections"] = [
    { type: "key_value", title: "Details", rows: detailRows },
  ];

  if (extraRows.length > 0) {
    sections.push({
      type: "key_value",
      title: "Additional Information",
      rows: extraRows,
    });
  }

  return {
    documentTitle: reportLabel,
    issuedDate: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    branding: branding ?? undefined,
    sections,
    // Use real verification context if available, otherwise show placeholder
    verification: verification ?? undefined,
    qrPlaceholder: !verification,
  };
}

export function LetterPreviewDialog({
  open,
  onOpenChange,
  reportCode,
  reportLabel,
  employeeId,
  employeeName,
  branding,
  templateId: propTemplateId,
}: LetterPreviewDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ReportDataResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formalView, setFormalView] = useState(false);

  // Verification link state
  const [verificationData, setVerificationData] = useState<{
    publicUrl: string;
    qrDataUrl: string | null;
  } | null>(null);
  const [issuingLink, setIssuingLink] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // BRANDING.8: Template selection for QR issuance
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(propTemplateId ?? null);
  const [selectedBranding, setSelectedBranding] = useState<ExportBrandingContext | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<ReportTemplateForSelection[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setFormalView(false);
      setVerificationData(null);
      setIssueError(null);
      setCopied(false);
      setSelectedTemplateId(propTemplateId ?? null);
      setSelectedBranding(null);
      setTemplatePickerOpen(false);
      setAvailableTemplates([]);
      setTemplateLoadError(null);
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

  // Eagerly load approved/published templates as soon as Formal View is activated.
  // This avoids the fragile "fire-and-forget async" pattern and ensures templates
  // are ready before the user clicks the QR issuance button.
  useEffect(() => {
    if (!open || !formalView) return;
    if (availableTemplates.length > 0 || loadingTemplates) return;
    setLoadingTemplates(true);
    setTemplateLoadError(null);
    listReportTemplatesForSelection({ issuableOnly: true })
      .then((res) => {
        if (res.success) {
          setAvailableTemplates(res.data ?? []);
        } else {
          setTemplateLoadError(res.error ?? "Failed to load templates.");
        }
      })
      .catch((e: unknown) => {
        setTemplateLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoadingTemplates(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, formalView]);

  // Computed values — derived from state; safe when open=false because data=null
  const row = data?.rows?.[0] ?? null;
  const columns = data?.columns ?? [];

  const exportColumns: ERPExportColumn<Record<string, unknown>>[] = columns.map(
    (col) => ({ key: col, header: formatColumnHeader(col) })
  );

  const elVerification = verificationData
    ? {
        publicUrl: verificationData.publicUrl,
        qrDataUrl: verificationData.qrDataUrl,
        label: "Scan to verify",
      }
    : undefined;

  const elDoc: ExecutiveLedgerDocument | null = row
    ? buildExecutiveLedgerDoc(columns, row, reportLabel, selectedBranding ?? branding, elVerification)
    : null;

  /** Open the template picker; if templates failed to load, retry the fetch */
  const handleOpenTemplatePicker = () => {
    setTemplatePickerOpen(true);
    // Retry fetch if templates haven't loaded yet (e.g., prior load failed)
    if (availableTemplates.length === 0 && !loadingTemplates) {
      setLoadingTemplates(true);
      setTemplateLoadError(null);
      listReportTemplatesForSelection({ issuableOnly: true })
        .then((res) => {
          if (res.success) {
            setAvailableTemplates(res.data ?? []);
          } else {
            setTemplateLoadError(res.error ?? "Failed to load templates.");
          }
        })
        .catch((e: unknown) => {
          setTemplateLoadError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setLoadingTemplates(false));
    }
  };

  /** Issue a public verification link and generate QR */
  const handleIssueVerificationLink = async () => {
    if (!row || issuingLink) return;

    // BRANDING.8: template_id is required for official letter issuance
    if (!selectedTemplateId) {
      setIssueError("Select an approved or published template before issuing a verification link.");
      handleOpenTemplatePicker();
      return;
    }

    setIssuingLink(true);
    setIssueError(null);
    try {
      const result = await createOutputPublicLink({
        output_type: "letter",
        source_module: "HR",
        source_entity_type: "employee",
        source_entity_id: employeeId,
        template_id: selectedTemplateId,
        document_title: reportLabel,
        access_level: "verify_only",
        verification_summary: {
          document_type: "HR Letter",
          document_title: reportLabel,
          subject_name: employeeName ?? null,
        },
      });

      if (!result.success || !result.data) {
        setIssueError(result.error ?? "Failed to issue verification link.");
        return;
      }

      const publicUrl = result.data.public_url;
      const qrDataUrl = await generateQrDataUrl(publicUrl);
      setVerificationData({ publicUrl, qrDataUrl });
      setTemplatePickerOpen(false);
    } catch {
      setIssueError("Failed to generate verification link.");
    } finally {
      setIssuingLink(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!verificationData?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(verificationData.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handlePDF = async () => {
    if (formalView && elDoc) {
      const html = renderExecutiveLedgerHtml(elDoc);
      const win = window.open("", "_blank");
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 600);
      }
      return;
    }
    if (!data) return;
    await exportToPDF({
      title: reportLabel,
      filename: `${reportCode}_${new Date().toISOString().split("T")[0]}`,
      columns: exportColumns,
      data: data.rows,
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePrint = useCallback(() => {
    if (formalView && elDoc) {
      const html = renderExecutiveLedgerHtml(elDoc);
      const win = window.open("", "_blank");
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 600);
      }
      return;
    }
    if (!data) return;
    exportToPrint({
      title: reportLabel,
      filename: `${reportCode}_${new Date().toISOString().split("T")[0]}`,
      columns: exportColumns,
      data: data.rows,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formalView, elDoc, data, reportLabel, reportCode]);

  // Early return AFTER all hooks — safe per Rules of Hooks
  if (!open) return null;

  const handleOpenFullView = () => {
    window.open(
      `/admin/reports/run/${reportCode}?employee_id=${employeeId}`,
      "_blank"
    );
  };

  return (
    <>
      {/* Overlay */}
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
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {/* Formal / Data view toggle — shown when data is loaded */}
            {!isPending && !error && row && (
              <Button
                variant={formalView ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setFormalView((v) => !v)}
                title={
                  formalView
                    ? "Switch to data grid view"
                    : "Switch to formal letter view"
                }
              >
                {formalView ? (
                  <>
                    <Table2 className="h-3.5 w-3.5" />
                    Data View
                  </>
                ) : (
                  <>
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    Formal View
                  </>
                )}
              </Button>
            )}
            {/* Issue Verification QR — shown only in formal view, when data is loaded */}
            {formalView && !isPending && !error && row && (
              verificationData ? (
                <div className="flex items-center gap-1.5">
                  <a
                    href={verificationData.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                  >
                    <QrCode className="h-3 w-3" />
                    Verified
                  </a>
                  <button
                    onClick={handleCopyUrl}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background hover:bg-accent text-muted-foreground transition-colors"
                    title="Copy verification URL"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={handleIssueVerificationLink}
                  disabled={issuingLink}
                  title={
                    selectedTemplateId
                      ? "Issue a public verification QR for this document"
                      : "Select an approved/published template first"
                  }
                >
                  {issuingLink ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  {issuingLink ? "Issuing…" : selectedTemplateId ? "Issue QR" : "Select Template & Issue QR"}
                </Button>
              )
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 shrink-0 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className={
            formalView
              ? "flex-1 overflow-hidden min-h-0 bg-muted/20"
              : "flex-1 overflow-y-auto p-6 min-h-0"
          }
        >
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

          {/* Data view */}
          {!isPending && !error && row && !formalView && (
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

          {/* Formal view — Executive Ledger preview */}
          {!isPending && !error && elDoc && formalView && (
            <>
              {issueError && (
                <div className="flex items-start gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20 text-destructive text-xs shrink-0">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {issueError}
                </div>
              )}
              {/* BRANDING.8: Template picker for QR issuance */}
              {templatePickerOpen && !verificationData && (
                <div className="px-4 py-3 border-b bg-muted/40 shrink-0">
                  <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                    <QrCode className="h-3.5 w-3.5 text-primary" />
                    Select an approved/published template for official QR issuance
                  </p>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading templates…
                    </div>
                  ) : templateLoadError ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-destructive">
                        Could not load templates: {templateLoadError}
                      </p>
                      <button
                        onClick={handleOpenTemplatePicker}
                        className="px-2 py-0.5 text-xs rounded border border-border hover:bg-muted transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : availableTemplates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No approved or published templates available. Templates must be approved in the Templates &amp; Branding admin.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableTemplates.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={async () => {
                            setSelectedTemplateId(tpl.id);
                            setTemplatePickerOpen(false);
                            setIssueError(null);
                            // Resolve full branding context for the selected template so
                            // the letter preview re-renders with the template's logo,
                            // company details, colours, etc.
                            const brandRes = await resolveTemplatePreview({
                              templateId: tpl.id,
                              reportCode,
                            });
                            if (brandRes.success && brandRes.data) {
                              setSelectedBranding(brandRes.data);
                            }
                          }}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            selectedTemplateId === tpl.id
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:bg-muted"
                          }`}
                        >
                          {tpl.template_name}
                        </button>
                      ))}
                      <button
                        onClick={() => setTemplatePickerOpen(false)}
                        className="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
              <ExecutiveLedgerPreview
                document={elDoc}
                height="100%"
                className="w-full h-full"
              />
            </>
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
              {formalView ? "Save as PDF" : "Download PDF"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
