"use client";

/**
 * Executive Ledger Preview Dialog
 * Phase: BRANDING.5 — Executive Ledger Template Engine
 *
 * A full-screen modal dialog that previews an ExecutiveLedgerDocument
 * and provides Print and PDF download actions.
 *
 * Design consistent with LetterPreviewDialog and ERPChildDialogForm overlay patterns.
 */

import { useState, useCallback } from "react";
import {
  X,
  Printer,
  FileDown,
  Maximize2,
  Minimize2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExecutiveLedgerPreview } from "./executive-ledger-preview";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";

interface ExecutiveLedgerPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ExecutiveLedgerDocument;
  /** Dialog header label (e.g. "Experience Letter") */
  title?: string;
  /** Optional subtitle (e.g. employee name) */
  subtitle?: string;
  /** Whether to show the PDF download button (default: true) */
  showPdf?: boolean;
  /** Whether to show the Print button (default: true) */
  showPrint?: boolean;
}

export function ExecutiveLedgerPreviewDialog({
  open,
  onOpenChange,
  document,
  title,
  subtitle,
  showPdf = true,
  showPrint = true,
}: ExecutiveLedgerPreviewDialogProps) {
  const [expanded, setExpanded] = useState(false);

  const handlePrint = useCallback(() => {
    const html = renderExecutiveLedgerHtml(document);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Delay to allow images to load before triggering print
    setTimeout(() => {
      win.print();
    }, 600);
  }, [document]);

  const handlePdf = useCallback(() => {
    // Print-to-PDF: open in new window; user saves via browser's print-to-PDF
    const html = renderExecutiveLedgerHtml(document);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 600);
  }, [document]);

  if (!open) return null;

  const insetClass = expanded
    ? "inset-2"
    : "inset-4 md:inset-8 lg:inset-16";

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-[100]"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog panel */}
      <div
        className={`fixed ${insetClass} z-[110] flex flex-col bg-background rounded-xl shadow-2xl border overflow-hidden transition-all duration-200`}
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
                {title ?? document.documentTitle}
              </h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-4 shrink-0">
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Restore" : "Expand"}
              className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors"
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-hidden min-h-0 bg-muted/20">
          <ExecutiveLedgerPreview
            document={document}
            height="100%"
            className="w-full h-full"
          />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t bg-background shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            {showPrint && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
            )}
            {showPdf && (
              <Button
                size="sm"
                onClick={handlePdf}
                className="gap-1.5"
              >
                <FileDown className="h-3.5 w-3.5" />
                Save as PDF
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
