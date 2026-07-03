"use client";

/**
 * Report Designer — Minimal Puck Config Scaffold
 * Phase: REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
 *
 * This is a compile/boundary verification scaffold only.
 * The full ERP block library (HeadingBlock with all binding options, KeyValueSection,
 * BrandingHeader, Signatory, Stamp, VerificationQr, etc.) is built in REPORT DESIGNER.3.
 *
 * Security rules:
 *  - No raw HTML in rendered blocks
 *  - No dangerouslySetInnerHTML
 *  - No direct DB access from client components
 *  - No service role / admin client usage
 */

import type { ReportDesignerPuckConfig } from "./report-designer-puck-types";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal placeholder block components
// ─────────────────────────────────────────────────────────────────────────────

function HeadingBlock({
  text,
  level,
  alignment,
}: {
  text: string;
  level: "h1" | "h2" | "h3" | "h4";
  alignment: "left" | "center" | "right";
}) {
  const Tag = level;
  return (
    <Tag
      style={{ textAlign: alignment, margin: 0, padding: "4px 0" }}
      className="report-designer-heading"
    >
      {text}
    </Tag>
  );
}

function BodyTextSectionBlock({
  text,
  alignment,
}: {
  text: string;
  alignment: "left" | "center" | "right" | "justify";
}) {
  return (
    <p
      style={{ textAlign: alignment, margin: 0, padding: "4px 0" }}
      className="report-designer-body-text"
    >
      {text}
    </p>
  );
}

function SpacerBlock({ height }: { height: number }) {
  return (
    <div
      aria-hidden="true"
      style={{ height: Math.max(4, Math.min(height, 200)) }}
      className="report-designer-spacer"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Puck config
// ─────────────────────────────────────────────────────────────────────────────

export const reportDesignerPuckConfig: ReportDesignerPuckConfig = {
  components: {
    HeadingBlock: {
      label: "Heading",
      fields: {
        text: { type: "text", label: "Text" },
        level: {
          type: "select",
          label: "Level",
          options: [
            { value: "h1", label: "H1" },
            { value: "h2", label: "H2" },
            { value: "h3", label: "H3" },
            { value: "h4", label: "H4" },
          ],
        },
        alignment: {
          type: "select",
          label: "Alignment",
          options: [
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ],
        },
      },
      defaultProps: {
        text: "Section Heading",
        level: "h2",
        alignment: "left",
      },
      render: HeadingBlock,
    },

    BodyTextSectionBlock: {
      label: "Body Text",
      fields: {
        text: { type: "textarea", label: "Text" },
        alignment: {
          type: "select",
          label: "Alignment",
          options: [
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
            { value: "justify", label: "Justify" },
          ],
        },
      },
      defaultProps: {
        text: "Body text content goes here.",
        alignment: "left",
      },
      render: BodyTextSectionBlock,
    },

    SpacerBlock: {
      label: "Spacer",
      fields: {
        height: {
          type: "number",
          label: "Height (px)",
          min: 4,
          max: 200,
        },
      },
      defaultProps: {
        height: 16,
      },
      render: SpacerBlock,
    },
  },
};
