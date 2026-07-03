/**
 * Report Designer — Feature Public API
 * Phase: REPORT DESIGNER.2 — Puck Installation, Type, Query Keys, Editor Shell Prep
 *
 * Re-exports the public surface of the report-designer feature module.
 * Keep this lean — only export what other parts of the app need to import.
 */

// Puck shell (client-only — import dynamically from server components)
export type { ReportDesignerPuckShellProps } from "./puck/report-designer-puck-shell";

// Puck types
export type {
  HeadingBlockProps,
  BodyTextSectionBlockProps,
  SpacerBlockProps,
  ReportDesignerPuckComponents,
  ReportDesignerPuckConfig,
} from "./puck/report-designer-puck-types";
