/**
 * Report Designer — Feature Public API
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 */

// Puck shell (client-only — import dynamically from server components)
export type { ReportDesignerPuckShellProps } from "./puck/report-designer-puck-shell";

// Editor client (client-only)
export type { ReportDesignerEditorClientProps } from "./report-designer-editor-client";

// Test panel (client-only)
export type { ReportDesignerTestPanelProps } from "./report-designer-test-panel";

// Puck types (all 10 blocks)
export type {
  HeadingBlockProps,
  BodyTextSectionBlockProps,
  KeyValueSectionBlockProps,
  DividerBlockProps,
  SpacerBlockProps,
  BrandingHeaderBlockProps,
  CompanyLogoBlockProps,
  SignatoryBlockProps,
  StampBlockProps,
  VerificationQrBlockProps,
  ReportDesignerPuckComponents,
  ReportDesignerPuckConfig,
} from "./puck/report-designer-puck-types";
