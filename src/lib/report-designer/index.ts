/**
 * Report Designer — Public API Index
 * Phase: REPORT DESIGNER.1
 *
 * Re-exports all types, schemas, and utilities for external consumers.
 * Import from "@/lib/report-designer" in server actions and future UI code.
 */

// Types
export type {
  ReportDesignerEngine,
  ReportDesignerLayoutJson,
  ReportDesignerLayoutRoot,
  ReportDesignerBlock,
  ReportDesignerBlockType,
  HeadingBlock,
  BodyTextSectionBlock,
  KeyValueSectionBlock,
  KeyValueFieldDef,
  DividerBlock,
  SpacerBlock,
  BrandingHeaderBlock,
  CompanyLogoBlock,
  SignatoryBlock,
  StampBlock,
  VerificationQrBlock,
  ReportTableBlock,
  ReportTableColumnDef,
  SaveVisualLayoutInput,
  VisualLayoutResult,
  LayoutSaveAuditMeta,
} from "./types";

export { CURRENT_LAYOUT_SCHEMA_VERSION, EMPTY_LAYOUT } from "./types";

// Constants
export {
  REPORT_DESIGNER_SCHEMA_VERSION,
  REPORT_DESIGNER_ENGINE,
  PAGE_SIZES,
  PERMITTED_FONT_FAMILIES,
  REPORT_DESIGNER_BLOCK_TYPES,
  EDITABLE_GOVERNANCE_STATUSES,
  LOCKED_GOVERNANCE_STATUSES,
  MAX_BLOCKS_PER_ZONE,
  MAX_BINDING_PATH_LENGTH,
  BINDING_PATH_REGEX,
  MAX_BLOCK_TEXT_LENGTH,
  REPORT_TABLE_MAX_ROWS,
  REPORT_TABLE_DEFAULT_MAX_ROWS,
  SAFE_COLUMN_KEY_REGEX,
} from "./constants";
export type { PermittedFontFamily, ReportDesignerBlockType as BlockTypeConstant } from "./constants";

// Binding registry
export {
  ERP_BINDING_REGISTRY,
  SAFE_BINDING_PATHS,
  isAllowlistedBinding,
  extractBindingsFromText,
  validateTextBindings,
} from "./binding-registry";
export type { BindingDescriptor } from "./binding-registry";

// Zod schemas
export {
  ReportDesignerBlockSchema,
  ReportDesignerLayoutRootSchema,
  ReportDesignerLayoutJsonSchema,
  SaveVisualLayoutInputSchema,
} from "./layout-schema";
export type {
  ReportDesignerLayoutJsonInput,
  ReportDesignerBlockInput,
  SaveVisualLayoutInputValidated,
} from "./layout-schema";

// Layout validation helpers
export {
  validateLayoutZone,
  validateSaveLayoutInput,
  buildLayoutAuditMeta,
} from "./layout-validation";

// Plain text ↔ ProseMirror utilities (client-safe)
export {
  buildProseMirrorDocFromPlainText,
  collectBindingTokens,
  isCorruptRichContentDoc,
  normalizeRichContentDoc,
  rebuildPreservingParagraphAttrs,
  repairLayoutBindingTokenPaths,
} from "./prosemirror-plaintext";
export type { LayoutValidationResult } from "./layout-validation";

// Live test schema
export {
  ReportDesignerTestModeSchema,
  ReportDesignerTestInputSchema,
  buildSampleBindingValues,
} from "./live-test-schema";
export type {
  ReportDesignerTestMode,
  ReportDesignerTestDataSource,
  ReportDesignerTestInput,
  ReportDesignerTestContext,
  ReportDesignerTestResult,
  ReportDesignerTestOptions,
  ReportDesignerTestInputValidated,
} from "./live-test-schema";

// Layout to Executive Ledger mapper (REPORT DESIGNER.4)
export {
  mapReportDesignerZonesToExecutiveLedgerDocument,
  mapRawZonesToExecutiveLedgerDocument,
} from "./layout-to-executive-ledger";
export type { MapZonesInput, MapZonesResult } from "./layout-to-executive-ledger";

// Test data resolver (REPORT DESIGNER.5)
export {
  buildSampleReportDesignerBindingValues,
  redactDesignerTestBindingValues,
  resolveDocumentBindingValues,
  buildReportDesignerTestContextSummary,
} from "./test-data-resolver";
export type {
  ResolveEmployeeBindingValuesResult,
  ResolveCompanyBindingValuesResult,
  ReportDesignerTestContextSummary,
} from "./test-data-resolver";

// Production renderer (REPORT DESIGNER.6)
export {
  renderVisualTemplateZones,
  renderVisualTemplateZonesParsed,
  parseVisualLayoutZone,
  templateHasVisualLayout,
  EMPTY_LAYOUT as PRODUCTION_RENDERER_EMPTY_LAYOUT,
} from "./production-renderer";
export type {
  ProductionRenderInput,
  ProductionRenderResult,
} from "./production-renderer";

// Visual template security review (REPORT DESIGNER.7)
export {
  reviewVisualTemplateLayoutSecurity,
  reviewVisualLayoutZone,
  extractVisualLayoutBindings,
} from "./visual-template-security-review";
export type {
  VisualTemplateSecurityReviewInput,
  VisualTemplateSecurityReviewResult,
} from "./visual-template-security-review";
