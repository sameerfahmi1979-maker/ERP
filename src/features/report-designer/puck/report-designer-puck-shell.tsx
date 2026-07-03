"use client";

/**
 * Report Designer — Puck Editor Shell (Scaffold)
 * Phase: REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
 *
 * This is a minimal shell that proves Puck can load in the Next.js App Router
 * without client/server import violations. It is NOT the final editor UI.
 *
 * Full editor UI with sidebar controls, branding preview, live test panel,
 * and block library comes in REPORT DESIGNER.3+.
 *
 * Limitations (intentional for this phase):
 *  - No save integration yet (save wire-up is REPORT DESIGNER.3)
 *  - No block library panel customization yet
 *  - No Executive Ledger preview rendering yet
 *  - No zone switching (header/body/footer) yet
 *
 * Security:
 *  - Client component — Puck editor must be client-only
 *  - No direct Supabase calls from this component
 *  - No service role or admin client imports
 *  - All saves must go through server actions (not yet wired here)
 */

import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";

import { reportDesignerPuckConfig } from "./report-designer-puck-config";
import type { ReportDesignerLayoutJson } from "@/lib/report-designer/types";
import { EMPTY_LAYOUT } from "@/lib/report-designer/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerPuckShellProps {
  /** The template ID being edited */
  templateId: number;
  /** The current body layout JSON, or null for a new/empty layout */
  initialLayout: ReportDesignerLayoutJson | null;
  /** Called with updated layout JSON on each Puck change (for future save integration) */
  onLayoutChange?: (layout: ReportDesignerLayoutJson) => void;
  /** Whether the editor is in read-only/preview mode */
  readOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert our ReportDesignerLayoutJson into the Puck Data format.
 * Puck expects: { content: ComponentData[], root: { props: Record<string, unknown> } }
 * Our layout JSON is structurally compatible.
 */
function toPuckData(layout: ReportDesignerLayoutJson): Parameters<typeof Puck>[0]["data"] {
  return {
    content: layout.content as Parameters<typeof Puck>[0]["data"]["content"],
    root: layout.root as Parameters<typeof Puck>[0]["data"]["root"],
    zones: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReportDesignerPuckShell({
  templateId: _templateId,
  initialLayout,
  onLayoutChange,
  readOnly = false,
}: ReportDesignerPuckShellProps) {
  const puckData = toPuckData(initialLayout ?? EMPTY_LAYOUT);

  if (readOnly) {
    // Render output only — no editor chrome
    return (
      <div className="report-designer-preview" aria-label="Report layout preview">
        <Puck.Preview />
      </div>
    );
  }

  return (
    <div className="report-designer-shell" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Puck
        config={reportDesignerPuckConfig}
        data={puckData}
        onPublish={(data) => {
          if (!onLayoutChange) return;
          const updated: ReportDesignerLayoutJson = {
            schemaVersion: (initialLayout?.schemaVersion ?? 1),
            engine: "puck",
            content: data.content as ReportDesignerLayoutJson["content"],
            root: data.root as ReportDesignerLayoutJson["root"],
          };
          onLayoutChange(updated);
        }}
      />
    </div>
  );
}
