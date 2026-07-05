"use client";

/**
 * Report Designer — Formal Preview Panel
 * Phase: REPORT DESIGNER.4 — Layout JSON to Executive Ledger Mapping
 *
 * Renders a formal Executive Ledger preview of the current in-memory layout.
 * Uses click-based preview (not auto-refresh) to avoid expensive server round-trips.
 *
 * Security:
 *  - HTML is server-rendered via trusted Executive Ledger renderer
 *  - Rendered inside <iframe srcDoc={...}> — no dangerouslySetInnerHTML in React
 *  - No QR link creation, no report run writes, no emails
 */

import { useCallback, useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, Eye, Loader2, RefreshCw } from "lucide-react";

import { previewReportDesignerTemplate } from "@/server/actions/reports/report-designer-preview";
import type { ReportDesignerLayoutJson } from "@/lib/report-designer/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface FormalPreviewPanelProps {
  templateId: number;
  /** Current in-memory header zone layout (may be unsaved) */
  headerLayout: ReportDesignerLayoutJson;
  /** Current in-memory body zone layout (may be unsaved) */
  bodyLayout: ReportDesignerLayoutJson;
  /** Current in-memory footer zone layout (may be unsaved) */
  footerLayout: ReportDesignerLayoutJson;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function FormalPreviewPanel({
  templateId,
  headerLayout,
  bodyLayout,
  footerLayout,
}: FormalPreviewPanelProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleGeneratePreview = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await previewReportDesignerTemplate({
        templateId,
        headerLayoutJson: headerLayout,
        bodyLayoutJson: bodyLayout,
        footerLayoutJson: footerLayout,
      });

      if (!result.ok || !result.html) {
        setError(result.error ?? "Preview generation failed");
        setHtml(null);
      } else {
        setHtml(result.html);
        setWarnings(result.warnings ?? []);
        setError(null);
      }
      setHasGenerated(true);
    });
  }, [templateId, headerLayout, bodyLayout, footerLayout]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#6b7280" }}>
          <Eye style={{ width: 14, height: 14 }} />
          <span>Formal Preview — sample data only</span>
        </div>
        <button
          onClick={handleGeneratePreview}
          disabled={isPending}
          aria-label={hasGenerated ? "Refresh formal preview" : "Generate formal preview"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #2563eb",
            background: isPending ? "#eff6ff" : "#2563eb",
            color: isPending ? "#93c5fd" : "#fff",
            cursor: isPending ? "not-allowed" : "pointer",
            fontSize: "0.85rem",
            fontWeight: 500,
            transition: "all 0.15s",
          }}
        >
          {isPending ? (
            <>
              <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              Generating…
            </>
          ) : (
            <>
              {hasGenerated ? (
                <RefreshCw style={{ width: 14, height: 14 }} />
              ) : (
                <Eye style={{ width: 14, height: 14 }} />
              )}
              {hasGenerated ? "Refresh Preview" : "Generate Preview"}
            </>
          )}
        </button>
      </div>

      {/* ── Warnings banner ──────────────────────────────────────────────── */}
      {warnings.length > 0 && html && (
        <div
          role="alert"
          style={{
            background: "#fffbeb",
            borderBottom: "1px solid #fde68a",
            padding: "8px 16px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              fontSize: "0.8rem",
              color: "#92400e",
            }}
          >
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
            <div>
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "#fef2f2",
            borderBottom: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "0.85rem",
            flexShrink: 0,
          }}
        >
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {!hasGenerated && !isPending && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              color: "#9ca3af",
              textAlign: "center",
              padding: 32,
            }}
          >
            <Eye style={{ width: 40, height: 40, opacity: 0.3 }} />
            <div style={{ fontSize: "0.95rem", fontWeight: 500, color: "#6b7280" }}>
              No preview generated yet
            </div>
            <div style={{ fontSize: "0.8rem", maxWidth: 360 }}>
              Click <strong>Generate Preview</strong> to render the current layout using the
              Executive Ledger engine with sample binding values.
            </div>
            <div style={{ fontSize: "0.75rem", color: "#d1d5db" }}>
              Unsaved changes are included — no save required before preview.
            </div>
          </div>
        )}

        {isPending && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
            }}
          >
            <Loader2 style={{ width: 32, height: 32, color: "#2563eb", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
              Rendering formal preview…
            </div>
          </div>
        )}

        {html && !isPending && (
          <iframe
            srcDoc={html}
            title="Formal Report Preview"
            aria-label="Formal Executive Ledger report preview"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "#e5e7eb",
              display: "block",
            }}
          />
        )}
      </div>
    </div>
  );
}
