"use client";

/**
 * Report Designer — Puck Editor Shell
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 *
 * Security:
 *  - Client component — Puck editor must be client-only
 *  - No direct Supabase calls
 *  - No service role or admin client imports
 *  - All saves go through server actions in the parent component
 */

import { Puck, Render } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { useState } from "react";

import { reportDesignerPuckConfig } from "./report-designer-puck-config";
import type { ReportDesignerLayoutJson } from "@/lib/report-designer/types";
import { EMPTY_LAYOUT } from "@/lib/report-designer/types";
import {
  buildProseMirrorDocFromPlainText,
  isCorruptRichContentDoc,
} from "@/lib/report-designer/prosemirror-plaintext";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerPuckShellProps {
  templateId: number;
  initialLayout: ReportDesignerLayoutJson | null;
  /** Called on each Puck data change so parent can track unsaved state */
  onLayoutChange?: (layout: ReportDesignerLayoutJson) => void;
  readOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type PuckData = Parameters<typeof Puck>[0]["data"];
type PuckContentItem = NonNullable<PuckData["content"]>[number];

/**
 * Puck 0.22 requires every block to have `props.id: string` (via WithId<Props>).
 * Layout data stored in the DB may pre-date this requirement (no id in props).
 * Inject a stable random UUID for any block whose props.id is missing/falsy so
 * Puck's DragDropProvider doesn't crash on `undefined.toString()`.
 *
 * The id is intentionally NOT saved back to the DB — the Zod schema strips
 * unknown block props on save, so each editor session generates fresh IDs.
 * This is safe: Puck only needs IDs to be stable within a single editing session.
 */
function ensureBlockIds(
  content: ReportDesignerLayoutJson["content"]
): PuckData["content"] {
  return content.map((block) => {
    const props = block.props as Record<string, unknown>;
    if (props.id) return block as unknown as PuckContentItem;
    return {
      ...block,
      props: { ...props, id: crypto.randomUUID() },
    } as unknown as PuckContentItem;
  });
}

/**
 * Defensive sanitizer for BodyTextSectionBlock richContent:
 *
 * 1. Corrupt richContent (binding tokens saved without their `path` attribute
 *    by a stale pre-UX.2 editor bundle) → REBUILD the doc from the plain-text
 *    fallback so the user's text and field chips reappear in the editor.
 * 2. Missing richContent but non-empty plain text `content` → build richContent
 *    from the plain text so TipTap always opens with the current content.
 *
 * This guarantees the TipTap editor is always populated with what was last
 * saved, even for templates that pre-date rich text or were corrupted.
 */
function sanitizeBlockRichContent<T extends { type: string; props: Record<string, unknown> }>(
  block: T
): T {
  if (block.type !== "BodyTextSectionBlock") return block;

  const rc = block.props.richContent as Record<string, unknown> | null | undefined;
  const plainText = typeof block.props.content === "string" ? block.props.content : "";

  const needsRebuild =
    // corrupt: tokens lost their path attributes
    isCorruptRichContentDoc(rc ?? null) ||
    // missing: no rich content at all, but plain text exists
    ((!rc || rc.type !== "doc") && plainText.trim().length > 0);

  if (!needsRebuild) return block;

  const rebuilt = buildProseMirrorDocFromPlainText(plainText);
  return { ...block, props: { ...block.props, richContent: rebuilt } };
}

function sanitizeLayoutForEditor(
  content: ReportDesignerLayoutJson["content"]
): ReportDesignerLayoutJson["content"] {
  return content.map((block) =>
    sanitizeBlockRichContent(block as { type: string; props: Record<string, unknown> }) as typeof block
  );
}

function toPuckData(layout: ReportDesignerLayoutJson): PuckData {
  return {
    content: ensureBlockIds(sanitizeLayoutForEditor(layout.content)),
    root: layout.root as PuckData["root"],
    zones: {},
  };
}

function fromPuckData(
  data: PuckData,
  schemaVersion: number
): ReportDesignerLayoutJson {
  return {
    schemaVersion,
    engine: "puck",
    content: data.content as ReportDesignerLayoutJson["content"],
    root: data.root as ReportDesignerLayoutJson["root"],
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
  const layout = initialLayout ?? EMPTY_LAYOUT;
  // Compute initial Puck data ONCE per mount. The parent remounts this shell
  // (via key) on zone/template switch. Recomputing on every render would feed
  // Puck new object identities + fresh block UUIDs each time, resetting its
  // internal state (and the TipTap field) while the user is editing.
  const [puckData] = useState<PuckData>(() => toPuckData(layout));

  if (readOnly) {
    return (
      <div
        className="report-designer-preview"
        aria-label="Report layout preview (read-only)"
        style={{ padding: "16px" }}
      >
        <Render config={reportDesignerPuckConfig} data={puckData} />
      </div>
    );
  }

  return (
    <div
      className="report-designer-shell"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <Puck
        config={reportDesignerPuckConfig}
        data={puckData}
        onChange={(data) => {
          if (!onLayoutChange) return;
          onLayoutChange(fromPuckData(data, layout.schemaVersion));
        }}
        onPublish={(data) => {
          if (!onLayoutChange) return;
          onLayoutChange(fromPuckData(data, layout.schemaVersion));
        }}
      />
    </div>
  );
}
