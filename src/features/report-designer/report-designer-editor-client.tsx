"use client";

/**
 * Report Designer — Editor Client
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 * Phase: REPORT DESIGNER.4 — Layout JSON to Executive Ledger Mapping
 *
 * Responsibilities:
 *  - Load template visual layout (all 3 zones) from server action
 *  - Display template metadata header
 *  - Show governance status banner (read-only guard)
 *  - Provide Header / Body / Footer zone selector
 *  - Mount Puck editor for the active zone
 *  - Save active zone + preserve other zones via saveReportTemplateVisualLayout
 *  - Formal Preview tab — renders current in-memory layout via Executive Ledger
 *
 * Security:
 *  - No direct Supabase calls
 *  - No service role / admin client
 *  - All mutations go through server actions
 *  - Governance read-only guard in both UI and server action
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, Eye, FileText, Info, Lock, PenLine, Save, ShieldCheck } from "lucide-react";

import {
  getReportTemplateVisualLayout,
  saveReportTemplateVisualLayout,
} from "@/server/actions/reports/report-designer-layout";
import type { ReportDesignerLayoutJson, VisualLayoutResult } from "@/lib/report-designer/types";
import { EMPTY_LAYOUT } from "@/lib/report-designer/types";

import { ReportDesignerPuckShellLoader } from "./puck/report-designer-puck-shell-loader";
import { ReportDesignerTestPanel } from "./report-designer-test-panel";
import { FieldPickerContextProvider } from "./field-picker/field-picker-context";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Zone = "header" | "body" | "footer";
type EditorMode = "designer" | "preview";

// ─────────────────────────────────────────────────────────────────────────────
// Governance helpers
// ─────────────────────────────────────────────────────────────────────────────

function GovernanceBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    draft: { label: "Draft", bg: "#fef9c3", text: "#854d0e" },
    in_review: { label: "In Review", bg: "#dbeafe", text: "#1e40af" },
    approved: { label: "Approved", bg: "#dcfce7", text: "#166534" },
    published: { label: "Published", bg: "#f0fdf4", text: "#15803d" },
    rejected: { label: "Rejected", bg: "#fee2e2", text: "#991b1b" },
    archived: { label: "Archived", bg: "#f3f4f6", text: "#374151" },
  };
  const c = config[status] ?? { label: status, bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        fontSize: "0.7rem",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "9999px",
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {c.label}
    </span>
  );
}

function SecurityBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    pending: { label: "Security: Pending", bg: "#fef3c7", text: "#92400e" },
    in_progress: { label: "Security: In Progress", bg: "#dbeafe", text: "#1e40af" },
    passed: { label: "Security: Passed", bg: "#dcfce7", text: "#166534" },
    failed: { label: "Security: Failed", bg: "#fee2e2", text: "#991b1b" },
    waived: { label: "Security: Waived", bg: "#f3f4f6", text: "#374151" },
  };
  const c = config[status] ?? { label: `Security: ${status}`, bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        fontSize: "0.7rem",
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: "9999px",
        whiteSpace: "nowrap",
      }}
    >
      <ShieldCheck
        style={{ display: "inline", width: 11, height: 11, marginRight: 3, verticalAlign: "middle" }}
      />
      {c.label}
    </span>
  );
}

function ReadOnlyBanner({ governanceStatus }: { governanceStatus: string }) {
  const messages: Record<string, { icon: React.ReactNode; text: string; color: string; bg: string; border: string }> = {
    in_review: {
      icon: <Clock style={{ width: 16, height: 16, flexShrink: 0 }} />,
      text: "Template is under review. Create a new draft or wait for approval/rejection.",
      color: "#1e40af",
      bg: "#eff6ff",
      border: "#bfdbfe",
    },
    approved: {
      icon: <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0 }} />,
      text: "Approved templates cannot be edited directly. Create a new version from governance actions.",
      color: "#15803d",
      bg: "#f0fdf4",
      border: "#bbf7d0",
    },
    published: {
      icon: <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0 }} />,
      text: "Published templates cannot be edited directly. Create a new version from governance actions.",
      color: "#15803d",
      bg: "#f0fdf4",
      border: "#bbf7d0",
    },
    archived: {
      icon: <Lock style={{ width: 16, height: 16, flexShrink: 0 }} />,
      text: "Archived templates are read-only.",
      color: "#374151",
      bg: "#f3f4f6",
      border: "#d1d5db",
    },
  };

  const msg = messages[governanceStatus];
  if (!msg) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: msg.bg,
        borderBottom: `1px solid ${msg.border}`,
        color: msg.color,
        fontSize: "0.85rem",
        fontWeight: 500,
      }}
    >
      {msg.icon}
      <span>{msg.text}</span>
      <a
        href="/admin/reports/templates"
        style={{ marginLeft: "auto", fontSize: "0.75rem", color: "inherit", opacity: 0.7, whiteSpace: "nowrap", textDecoration: "underline" }}
      >
        Go to Governance
      </a>
    </div>
  );
}

function TestPreviewOnlyBanner({ governanceStatus }: { governanceStatus: string }) {
  const isProductionReady = governanceStatus === "approved" || governanceStatus === "published";
  if (isProductionReady) return null;

  const labels: Record<string, string> = {
    draft: "Draft",
    rejected: "Rejected",
    in_review: "In Review",
    archived: "Archived",
  };

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        background: "#fffbeb",
        borderBottom: "1px solid #fde68a",
        color: "#92400e",
        fontSize: "0.8rem",
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
      <span>
        <strong>Test preview only</strong> — this template is{" "}
        <strong>{labels[governanceStatus] ?? governanceStatus}</strong> and is not approved for
        official output. Results shown here will not appear in issued documents.
      </span>
      <a
        href="/admin/reports/templates"
        style={{ marginLeft: "auto", fontSize: "0.75rem", color: "inherit", opacity: 0.7, whiteSpace: "nowrap", textDecoration: "underline" }}
      >
        Submit for Review
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerEditorClientProps {
  templateId: number;
  /** UX.3: User permission codes passed from server page for governance-aware field picker */
  userPermissions?: string[];
}

export function ReportDesignerEditorClient({ templateId, userPermissions = [] }: ReportDesignerEditorClientProps) {
  const [layoutResult, setLayoutResult] = useState<VisualLayoutResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeZone, setActiveZone] = useState<Zone>("body");
  const [editorMode, setEditorMode] = useState<EditorMode>("designer");

  // Ref mirror of activeZone so async callbacks (Puck onChange events that can
  // arrive after a tab switch) never act on a stale zone value.
  const activeZoneRef = useRef<Zone>("body");

  // All three zones — single source of truth for save + test preview.
  const [zoneLayouts, setZoneLayouts] = useState<Record<Zone, ReportDesignerLayoutJson>>({
    header: EMPTY_LAYOUT,
    body: EMPTY_LAYOUT,
    footer: EMPTY_LAYOUT,
  });
  const zoneLayoutsRef = useRef(zoneLayouts);
  zoneLayoutsRef.current = zoneLayouts;

  // Bumped after load/save so the active Puck shell remounts with fresh DB data.
  const [layoutRevision, setLayoutRevision] = useState(0);
  // Global across ALL zones — saving persists all three zones at once, so
  // switching tabs must NOT clear it (edits in a previous zone would be
  // silently lost with the Save button disabled).
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [isPending, startTransition] = useTransition();

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadLayout = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await getReportTemplateVisualLayout(templateId);
    if (!result.success || !result.data) {
      setLoadError(result.error ?? "Failed to load template");
      setIsLoading(false);
      return;
    }
    const d = result.data;
    setZoneLayouts({
      header: d.headerLayout,
      body: d.bodyLayout,
      footer: d.footerLayout,
    });
    setLayoutRevision((v) => v + 1);
    setLayoutResult(d);
    setHasUnsavedChanges(false);
    setIsLoading(false);
  }, [templateId]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  // Warn before closing/leaving the page with unsaved layout changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // ── Zone switching ────────────────────────────────────────────────────────

  const handleZoneChange = useCallback((zone: Zone) => {
    // zoneLayouts always has current edits — switching tabs is just a pointer
    // move. hasUnsavedChanges is NOT reset so edits from the previous zone
    // are still saved when the user clicks Save Layout.
    activeZoneRef.current = zone;
    setActiveZone(zone);
  }, []);

  // ── Layout change from Puck ───────────────────────────────────────────────

  /**
   * Receives changes from the Puck shell, tagged with the zone that instance
   * was mounted for. Late/async events from an unmounting zone editor are
   * routed to their own zone bucket and can never leak into the active zone.
   * `initial` marks Puck's automatic mount-time data resolve — synced to the
   * zone bucket but NOT treated as a user edit.
   */
  const handleLayoutChange = useCallback(
    (zone: Zone, layout: ReportDesignerLayoutJson, opts?: { initial?: boolean }) => {
      // Update ref synchronously so handleSave always reads the latest data,
      // even if the React state re-render hasn't committed yet.
      zoneLayoutsRef.current = { ...zoneLayoutsRef.current, [zone]: layout };
      setZoneLayouts((prev) => ({ ...prev, [zone]: layout }));
      if (!opts?.initial) {
        setHasUnsavedChanges(true);
      }
    },
    []
  );

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    if (!layoutResult) return;

    startTransition(async () => {
      const layouts = zoneLayoutsRef.current;
      const result = await saveReportTemplateVisualLayout({
        templateId,
        bodyLayout: layouts.body,
        headerLayout: layouts.header,
        footerLayout: layouts.footer,
      });

      if (result.success) {
        toast.success("Layout saved", {
          description: "Header, body and footer zones saved successfully.",
        });
        setHasUnsavedChanges(false);
        // Reload to get updated metadata (updated_at, etc.)
        void loadLayout();
      } else {
        toast.error("Save failed", {
          description: result.error ?? "An unexpected error occurred.",
        });
      }
    });
  }, [layoutResult, templateId, loadLayout]);

  // ── States ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div
          style={{
            padding: "12px 20px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              height: 20,
              width: 240,
              background: "#e2e8f0",
              borderRadius: 4,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: 14,
              width: 160,
              background: "#e2e8f0",
              borderRadius: 4,
              marginTop: 8,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </div>
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm gap-2">
          <span>Loading template…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: 32,
            textAlign: "center",
          }}
        >
          <AlertCircle style={{ width: 32, height: 32, color: "#ef4444" }} />
          <div style={{ fontWeight: 600, color: "#111827" }}>Failed to load template</div>
          <div style={{ fontSize: "0.85rem", color: "#6b7280", maxWidth: 360 }}>{loadError}</div>
          <button
            onClick={() => void loadLayout()}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!layoutResult) return null;

  const isReadOnly = !layoutResult.isEditable;
  const isSaving = isPending;

  const zones: { id: Zone; label: string }[] = [
    { id: "header", label: "Header" },
    { id: "body", label: "Body" },
    { id: "footer", label: "Footer" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Metadata Header ──────────────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 20px",
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <FileText style={{ width: 18, height: 18, color: "#6b7280", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {layoutResult.templateName}
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af",
              marginTop: 1,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>{layoutResult.templateCode}</span>
            <span>·</span>
            <span style={{ textTransform: "capitalize" }}>
              {layoutResult.templateType.replace(/_/g, " ")}
            </span>
            <span>·</span>
            <span>v{layoutResult.versionNo}</span>
            {layoutResult.visualLayoutUpdatedAt && (
              <>
                <span>·</span>
                <span>
                  Layout saved{" "}
                  {new Date(layoutResult.visualLayoutUpdatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <GovernanceBadge status={layoutResult.governanceStatus} />
          <SecurityBadge status={layoutResult.securityReviewStatus} />
        </div>
      </div>

      {/* ── Read-only banner ──────────────────────────────────────────────── */}
      {isReadOnly && <ReadOnlyBanner governanceStatus={layoutResult.governanceStatus} />}

      {/* ── Zone selector + save bar ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
          gap: 8,
        }}
      >
        {/* Mode + Zone tabs */}
        <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
          {/* Editor mode toggle */}
          <div
            style={{
              display: "flex",
              gap: 0,
              marginRight: 12,
              borderRight: "1px solid #e2e8f0",
              paddingRight: 12,
            }}
            role="tablist"
            aria-label="Editor mode"
          >
            <button
              role="tab"
              aria-selected={editorMode === "designer"}
              aria-label="Designer mode"
              onClick={() => setEditorMode("designer")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                borderBottom: editorMode === "designer" ? "2px solid #2563eb" : "2px solid transparent",
                cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight: editorMode === "designer" ? 600 : 400,
                color: editorMode === "designer" ? "#2563eb" : "#6b7280",
              }}
            >
              <PenLine style={{ width: 13, height: 13 }} />
              Designer
            </button>
            <button
              role="tab"
              aria-selected={editorMode === "preview"}
              aria-label="Test report preview mode"
              onClick={() => setEditorMode("preview")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                borderBottom: editorMode === "preview" ? "2px solid #7c3aed" : "2px solid transparent",
                cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight: editorMode === "preview" ? 600 : 400,
                color: editorMode === "preview" ? "#7c3aed" : "#6b7280",
              }}
            >
              <Eye style={{ width: 13, height: 13 }} />
              Test Report
            </button>
          </div>

          {/* Zone tabs — only shown in designer mode */}
          {editorMode === "designer" && (
            <div style={{ display: "flex", gap: 0 }} role="tablist" aria-label="Layout zone selector">
              {zones.map((z) => (
                <button
                  key={z.id}
                  role="tab"
                  aria-selected={activeZone === z.id}
                  aria-label={`Edit ${z.label} zone`}
                  onClick={() => handleZoneChange(z.id)}
                  style={{
                    padding: "10px 20px",
                    background: "transparent",
                    border: "none",
                    borderBottom:
                      activeZone === z.id ? "2px solid #2563eb" : "2px solid transparent",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: activeZone === z.id ? 600 : 400,
                    color: activeZone === z.id ? "#2563eb" : "#6b7280",
                    transition: "all 0.15s",
                  }}
                >
                  {z.label}
                  {activeZone === z.id && hasUnsavedChanges && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#f59e0b",
                        marginLeft: 5,
                        verticalAlign: "middle",
                      }}
                      title="Unsaved changes"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save button — only in designer mode */}
        {editorMode === "designer" && !isReadOnly && (
          <button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            aria-label="Save layout zone"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #2563eb",
              background: isSaving || !hasUnsavedChanges ? "#eff6ff" : "#2563eb",
              color: isSaving || !hasUnsavedChanges ? "#93c5fd" : "#fff",
              cursor: isSaving || !hasUnsavedChanges ? "not-allowed" : "pointer",
              fontSize: "0.85rem",
              fontWeight: 500,
              transition: "all 0.15s",
            }}
          >
            {isSaving ? (
              <>
                <svg
                  style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }}
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <Save style={{ width: 14, height: 14 }} />
                Save Layout
              </>
            )}
          </button>
        )}

        {editorMode === "designer" && isReadOnly && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: "0.75rem",
              color: "#9ca3af",
            }}
          >
            <Info style={{ width: 13, height: 13 }} />
            Read-only
          </div>
        )}
      </div>

      {/* ── Content area: Designer or Test Report Preview ────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
        <FieldPickerContextProvider
          value={{
            userPermissions,
            templateType: layoutResult.templateType,
            governanceStatus: layoutResult.governanceStatus,
          }}
        >
        {editorMode === "preview" ? (
          <>
            <TestPreviewOnlyBanner governanceStatus={layoutResult.governanceStatus} />
            <div style={{ flex: 1, overflow: "hidden" }}>
              <ReportDesignerTestPanel
                templateId={templateId}
                templateType={layoutResult.templateType}
                headerLayout={zoneLayouts.header}
                bodyLayout={zoneLayouts.body}
                footerLayout={zoneLayouts.footer}
              />
            </div>
          </>
        ) : (
        <div className="report-designer-puck-container" style={{ height: "100%" }}>
          <ReportDesignerPuckShellLoader
            key={`${templateId}-${activeZone}-${layoutRevision}`}
            templateId={templateId}
            zone={activeZone}
            initialLayout={zoneLayouts[activeZone]}
            onLayoutChange={isReadOnly ? undefined : handleLayoutChange}
            readOnly={isReadOnly}
          />
        </div>
        )}
        </FieldPickerContextProvider>
      </div>
    </div>
  );
}
