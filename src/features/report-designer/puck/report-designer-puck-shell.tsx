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
import { useEffect, useRef, useState } from "react";

import { reportDesignerPuckConfig } from "./report-designer-puck-config";
import type { ReportDesignerLayoutJson } from "@/lib/report-designer/types";
import { EMPTY_LAYOUT } from "@/lib/report-designer/types";
import {
  buildProseMirrorDocFromPlainText,
  collectBindingTokens,
  isCorruptRichContentDoc,
  normalizeRichContentDoc,
  rebuildPreservingParagraphAttrs,
} from "@/lib/report-designer/prosemirror-plaintext";

/** Regex to extract {{binding.path}} tokens from plain text — matches same pattern as BINDING_TOKEN_REGEX in prosemirror-plaintext */
const BINDING_PATH_RE = /\{\{([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\}\}/g;

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerPuckShellProps {
  templateId: number;
  /** Which layout zone this editor instance is editing (header/body/footer) */
  zone: "header" | "body" | "footer";
  initialLayout: ReportDesignerLayoutJson | null;
  /**
   * Called on each Puck data change, tagged with this instance's zone so the
   * parent can never write the data into the wrong zone bucket (even for
   * late/async events during a tab switch). `opts.initial` is true for Puck's
   * automatic mount-time data resolve — not a user edit.
   */
  onLayoutChange?: (
    zone: "header" | "body" | "footer",
    layout: ReportDesignerLayoutJson,
    opts?: { initial?: boolean }
  ) => void;
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
 * 1. Missing richContent + non-empty plain text → build richContent from plain
 *    text so TipTap always opens with the current content.
 * 2. Corrupt richContent (binding tokens missing `path` attribute, produced by
 *    stale pre-UX.2 editor bundles) → REPAIR positionally from the plain-text
 *    fallback first. Positional repair preserves paragraph-level formatting
 *    (textAlign, etc.). Only falls back to a full rebuild if token counts
 *    diverge (edge case), which mirrors the server-side
 *    repairLayoutBindingTokenPaths() logic.
 */
function sanitizeBlockRichContent<T extends { type: string; props: Record<string, unknown> }>(
  block: T
): T {
  if (block.type !== "BodyTextSectionBlock") return block;

  const rawRc = block.props.richContent as Record<string, unknown> | null | undefined;
  const plainText = typeof block.props.content === "string" ? block.props.content : "";

  // Case: no richContent — build from plain text if available
  if (!rawRc || rawRc.type !== "doc") {
    if (plainText.trim().length > 0) {
      const rebuilt = buildProseMirrorDocFromPlainText(plainText);
      return { ...block, props: { ...block.props, richContent: rebuilt } };
    }
    return block;
  }

  // Normalize: strip auto-link marks and merge text nodes they split apart.
  // Pasted text with {{binding.path}} tokens got linkified by TipTap's Link
  // extension in older sessions, splitting bindings across multiple text
  // nodes so they could never resolve. Heal that here on load.
  const normalized = JSON.parse(JSON.stringify(rawRc)) as Record<string, unknown>;
  const wasNormalized = normalizeRichContentDoc(normalized);
  const rc = wasNormalized ? normalized : rawRc;
  const withNormalizedRc: T = wasNormalized
    ? { ...block, props: { ...block.props, richContent: normalized } }
    : block;

  // Case: richContent is valid — nothing to do
  if (!isCorruptRichContentDoc(rc)) return withNormalizedRc;

  // Case: richContent has binding tokens with missing paths (corrupt data).
  // Try positional repair FIRST — this preserves paragraph attrs (textAlign,
  // font formatting, etc.). Only fall back to a full rebuild if token counts
  // diverge and positional fill is not possible.
  const repairedRc = JSON.parse(JSON.stringify(rc)) as Record<string, unknown>;
  const tokens = collectBindingTokens(repairedRc);
  const pathless = tokens.filter((t) => {
    const attrs = t.attrs as Record<string, unknown> | undefined;
    return !attrs || typeof attrs.path !== "string" || !attrs.path;
  });

  if (pathless.length > 0 && plainText.trim()) {
    BINDING_PATH_RE.lastIndex = 0;
    const plainPaths = Array.from(plainText.matchAll(BINDING_PATH_RE)).map((m) => m[1]);

    if (plainPaths.length === tokens.length) {
      // Positional fill: repairs missing binding paths while keeping
      // all paragraph attributes (textAlign, etc.) intact.
      tokens.forEach((t, i) => {
        const attrs = (t.attrs ?? {}) as Record<string, unknown>;
        if (typeof attrs.path !== "string" || !attrs.path) {
          attrs.path = plainPaths[i];
          t.attrs = attrs;
        }
      });
      return { ...block, props: { ...block.props, richContent: repairedRc } };
    }
  }

  // Fallback: rebuild from plain text but preserve paragraph attrs (textAlign).
  const rebuilt = rebuildPreservingParagraphAttrs(plainText, rc);
  return { ...block, props: { ...block.props, richContent: rebuilt ?? rc } };
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
  zone,
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

  // Puck fires an onChange right after mount from its automatic
  // resolveAndCommitData() (setTimeout 0). That event is a data sync (id
  // injection + plain-text regeneration), NOT a user edit — flag it so the
  // parent doesn't mark the layout dirty on every tab switch / reload.
  const mountTimeRef = useRef(Date.now());
  const seenFirstChangeRef = useRef(false);
  const mountedRef = useRef(true);

  // Ignore onChange events fired during/after unmount — remounting Puck on tab
  // switch or post-save reload used to overwrite zonesRef with stale mount data.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const emitChange = (data: PuckData) => {
    if (!mountedRef.current || !onLayoutChange) return;
    const initial =
      !seenFirstChangeRef.current && Date.now() - mountTimeRef.current < 1500;
    seenFirstChangeRef.current = true;
    onLayoutChange(zone, fromPuckData(data, layout.schemaVersion), { initial });
  };

  return (
    <div
      className="report-designer-shell"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <Puck
        config={reportDesignerPuckConfig}
        data={puckData}
        onChange={emitChange}
        onPublish={emitChange}
      />
    </div>
  );
}
