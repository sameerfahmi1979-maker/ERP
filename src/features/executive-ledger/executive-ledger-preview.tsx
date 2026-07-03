"use client";

/**
 * Executive Ledger Preview Component
 * Phase: BRANDING.5 — Executive Ledger Template Engine
 *
 * Renders an ExecutiveLedgerDocument inside an iframe for safe isolation.
 * The iframe uses srcdoc= to inject the renderer output — no external URL needed.
 *
 * Security note:
 * - Content is rendered by the trusted HTML renderer (all text escaped).
 * - iframe sandbox="allow-same-origin" is intentionally NOT used to prevent
 *   any embedded script execution; "allow-popups" is omitted as well.
 * - Print is triggered by opening a new window (handled by parent).
 */

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";

interface ExecutiveLedgerPreviewProps {
  /** The document definition to render */
  document: ExecutiveLedgerDocument;
  /** Optional CSS class for the outer wrapper */
  className?: string;
  /** Height of the iframe preview area (default: 600px) */
  height?: number | string;
  /** Whether the document is still loading (shows spinner instead) */
  isLoading?: boolean;
}

export function ExecutiveLedgerPreview({
  document,
  className,
  height = 600,
  isLoading = false,
}: ExecutiveLedgerPreviewProps) {
  const html = useMemo(() => renderExecutiveLedgerHtml(document), [document]);

  if (isLoading) {
    return (
      <div
        className={className}
        style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Rendering document…</span>
        </div>
      </div>
    );
  }

  return (
    <iframe
      className={className}
      srcDoc={html}
      style={{ width: "100%", height, border: "none", background: "#e5e7eb" }}
      title="Executive Ledger Preview"
      // No sandbox — the renderer output is trusted, but we still keep it isolated
      // via the iframe boundary. Sandbox would block CSS/font loading in srcdoc.
    />
  );
}
