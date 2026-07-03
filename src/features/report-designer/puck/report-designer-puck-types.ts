/**
 * Report Designer — Puck Component Type Definitions
 * Phase: REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
 *
 * Maps REPORT DESIGNER.1 block definitions to Puck's Props/Config type system.
 * Only minimal placeholder blocks are defined here; the full ERP block library
 * comes in REPORT DESIGNER.3.
 *
 * In Puck v0.22, Config<Components> maps component names directly to their prop
 * types (e.g. { HeadingBlock: HeadingBlockProps }), not wrapped in { props: ... }.
 */

import type { Config } from "@puckeditor/core";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal placeholder block prop definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface HeadingBlockProps {
  text: string;
  level: "h1" | "h2" | "h3" | "h4";
  alignment: "left" | "center" | "right";
}

export interface BodyTextSectionBlockProps {
  text: string;
  alignment: "left" | "center" | "right" | "justify";
}

export interface SpacerBlockProps {
  height: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Puck component map
// In Puck v0.22, Config<Components> maps names directly to prop types.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportDesignerPuckComponents = {
  HeadingBlock: HeadingBlockProps;
  BodyTextSectionBlock: BodyTextSectionBlockProps;
  SpacerBlock: SpacerBlockProps;
};

/** Typed Puck Config for the Report Designer editor */
export type ReportDesignerPuckConfig = Config<ReportDesignerPuckComponents>;
