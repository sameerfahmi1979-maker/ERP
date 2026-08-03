"use client";

/**
 * HR.DOC_BROWSER.1 — Column 3: document preview + metadata strip.
 *
 * - PDFs render inline via <iframe> using the /api/dms/file proxy (inline disposition)
 * - Images render via <img>
 * - Other types (Word/Excel/etc.): download card only (per approved decision Q5)
 * - "Open Full Record" opens the DMS document workspace tab (only for DMS-backed rows)
 */

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, ExternalLink, Eye, File as FileIcon, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { DmsDocumentStatusBadge } from "@/features/dms/documents/dms-document-status-badge";
import { DmsExpiryBadge } from "@/features/dms/documents/dms-expiry-badge";
import type { HrDocBrowserDocument, HrDocBrowserFile } from "@/server/actions/hr/doc-browser";
import type { BrowserEntitySelection } from "./hr-doc-browser-types";

interface HrDocBrowserPreviewProps {
  entity: BrowserEntitySelection | null;
  document: HrDocBrowserDocument | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function previewKind(mimeType: string | null): "pdf" | "image" | "other" {
  const mime = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "other";
}

export function HrDocBrowserPreview({ entity, document: doc }: HrDocBrowserPreviewProps) {
  const { openTab } = useWorkspace();
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Reset file selection when the document changes (render-time state adjustment)
  const [prevDoc, setPrevDoc] = useState<HrDocBrowserDocument | null>(doc);
  if (prevDoc !== doc) {
    setPrevDoc(doc);
    setActiveFileIndex(0);
  }

  const activeFile: HrDocBrowserFile | null = useMemo(() => {
    if (!doc || doc.files.length === 0) return null;
    return doc.files[Math.min(activeFileIndex, doc.files.length - 1)];
  }, [doc, activeFileIndex]);

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-muted-foreground">
        <FileSearch className="h-10 w-10 opacity-20" />
        <p className="text-sm text-center">
          Select a document from the list to preview it here.
        </p>
      </div>
    );
  }

  const kind = activeFile ? previewKind(activeFile.mimeType) : null;
  const inlineUrl = activeFile ? `/api/dms/file?fileId=${activeFile.id}&disposition=inline` : null;
  const downloadUrl = activeFile
    ? `/api/dms/file?fileId=${activeFile.id}&disposition=attachment`
    : null;

  const handleOpenFullRecord = () => {
    if (doc.id == null) return;
    openTab({
      route: `/dms/documents/record/${doc.id}`,
      title: doc.title,
      entityType: "dms_document",
      entityId: doc.id,
      tabKind: "record",
      closable: true,
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Metadata strip */}
      <div className="px-4 py-3 border-b border-border/60 shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {doc.typeNameEn && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {doc.typeNameEn}
            </Badge>
          )}
          {doc.documentNo && (
            <span className="font-mono text-[11px] text-muted-foreground">{doc.documentNo}</span>
          )}
          {doc.status && <DmsDocumentStatusBadge status={doc.status} />}
          <DmsExpiryBadge expiryDate={doc.expiryDate} />
        </div>

        <p className="text-sm font-semibold leading-snug">{doc.title}</p>

        <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          {doc.issueDate && <span>Issue: {format(new Date(doc.issueDate), "dd MMM yyyy")}</span>}
          {doc.expiryDate && <span>Expiry: {format(new Date(doc.expiryDate), "dd MMM yyyy")}</span>}
          {entity && <span>Owner: {entity.name}</span>}
          <span>
            {doc.files.length} file{doc.files.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {doc.id != null && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleOpenFullRecord}>
              <ExternalLink className="h-3 w-3 mr-1" />
              Open Full Record
            </Button>
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="inline-flex items-center h-7 px-2.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </a>
          )}
        </div>
      </div>

      {/* File selector (multi-file docs) */}
      {doc.files.length > 1 && (
        <div className="flex gap-1.5 px-4 py-2 border-b border-border/60 overflow-x-auto shrink-0">
          {doc.files.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setActiveFileIndex(i)}
              className={cn(
                "shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors max-w-[220px] truncate",
                i === Math.min(activeFileIndex, doc.files.length - 1)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
              title={f.fileName}
            >
              {f.fileName}
            </button>
          ))}
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 min-h-0 bg-muted/20">
        {!activeFile ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground px-6">
            <FileIcon className="h-8 w-8 opacity-25" />
            <p className="text-xs text-center">
              {doc.source === "hr_identity"
                ? "This HR identity record has no attached file. Details are shown in the strip above."
                : "This document has no files attached."}
            </p>
          </div>
        ) : kind === "pdf" ? (
          <iframe
            key={activeFile.id}
            src={inlineUrl ?? undefined}
            title={activeFile.fileName}
            className="w-full h-full border-0"
          />
        ) : kind === "image" ? (
          <div className="w-full h-full overflow-auto flex items-start justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={activeFile.id}
              src={inlineUrl ?? undefined}
              alt={activeFile.fileName}
              className="max-w-full h-auto rounded-md shadow-sm"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
            <FileIcon className="h-10 w-10 text-muted-foreground opacity-40" />
            <div className="text-center">
              <p className="text-sm font-medium">{activeFile.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {activeFile.mimeType ?? "Unknown type"}
                {activeFile.fileSizeBytes != null && ` · ${formatBytes(activeFile.fileSizeBytes)}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Inline preview is not available for this file type.
              </p>
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="inline-flex items-center h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Download to view
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
